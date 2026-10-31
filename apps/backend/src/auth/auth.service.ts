import {
  BadRequestException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import {
  DEFAULT_ROLE_PERMISSIONS,
  PERMISSIONS,
  STAFF_ROLES,
  type LoginDto,
  type PinLoginDto,
  type RegisterDto,
  type ResetPasswordDto,
  type SessionUser,
} from '@nodedr-restaurant/types';
import * as bcrypt from 'bcrypt';
import { AuditService } from '../audit/audit.service';
import { EmailService } from '../modules/email/email.service';
import { PrismaService } from '../prisma/prisma.service';
import { passwordResetEmail, verifyEmail } from './auth-emails';
import { AuthTokensService } from './auth-tokens.service';
import { TwoFactorService } from './two-factor.service';

const RESET_TTL_MS = 30 * 60_000;
const VERIFY_TTL_MS = 24 * 60 * 60_000;
const RESEND_COOLDOWN_MS = 60_000;
const errMessage = (err: unknown) => (err instanceof Error ? err.message : String(err));

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly twoFactor: TwoFactorService,
    private readonly tokens: AuthTokensService,
    private readonly email: EmailService,
    private readonly audit: AuditService,
  ) {}

  private toSessionUser(user: {
    id: string;
    restaurantId: string;
    name: string;
    roleId: string;
    email?: string | null;
    emailVerifiedAt?: Date | null;
    role: { name: string; permissions: { permission: { key: string } }[] };
  }): SessionUser {
    return {
      id: user.id,
      restaurantId: user.restaurantId,
      name: user.name,
      roleId: user.roleId,
      roleName: user.role.name,
      permissions: user.role.permissions.map((rp) => rp.permission.key),
      emailVerified: !user.email || !!user.emailVerifiedAt,
    };
  }

  async login(dto: LoginDto) {
    const user = await this.prisma.user.findFirst({
      where: { email: { equals: dto.email.trim(), mode: 'insensitive' }, isActive: true },
      include: {
        role: { include: { permissions: { include: { permission: true } } } },
      },
    });

    if (!user) {
      throw new UnauthorizedException('Invalid email or password');
    }

    const valid = await bcrypt.compare(dto.password, user.passwordHash);
    if (!valid) {
      throw new UnauthorizedException('Invalid email or password');
    }

    // Only asked for after the password is right, so the response never
    // reveals which emails exist or which accounts use two-factor.
    if (user.twoFactorEnabled) {
      await this.twoFactor.verifyLogin(user, dto.totp);
    }

    return this.issueSession(user);
  }

  async register(dto: RegisterDto) {
    const existing = await this.prisma.user.findFirst({
      where: { email: { equals: dto.email.trim(), mode: 'insensitive' } },
    });
    if (existing) {
      throw new BadRequestException(
        'An account with this email already exists',
      );
    }

    // Permissions are global, not per-tenant — upsert (idempotent) outside
    // the transaction below rather than re-creating them per restaurant.
    for (const permission of PERMISSIONS) {
      await this.prisma.permission.upsert({
        where: { key: permission.key },
        update: {},
        create: permission,
      });
    }
    const allPermissions = await this.prisma.permission.findMany();
    const permissionByKey = new Map(allPermissions.map((p) => [p.key, p]));

    const passwordHash = await bcrypt.hash(dto.password, 12);

    const owner = await this.prisma.$transaction(async (tx) => {
      const restaurant = await tx.restaurant.create({
        data: { name: dto.restaurantName },
      });
      const branch = await tx.branch.create({
        data: { restaurantId: restaurant.id, name: dto.branchName },
      });

      let ownerRoleId = '';
      for (const roleName of STAFF_ROLES) {
        const role = await tx.role.create({
          data: {
            restaurantId: restaurant.id,
            name: roleName,
            label: roleName.replace(/_/g, ' '),
          },
        });
        if (roleName === 'OWNER') ownerRoleId = role.id;

        const grantedKeys = DEFAULT_ROLE_PERMISSIONS[roleName];
        await tx.rolePermission.createMany({
          data: grantedKeys
            .map((key) => permissionByKey.get(key))
            .filter((p): p is NonNullable<typeof p> => Boolean(p))
            .map((permission) => ({
              roleId: role.id,
              permissionId: permission.id,
            })),
        });
      }

      const user = await tx.user.create({
        data: {
          restaurantId: restaurant.id,
          roleId: ownerRoleId,
          name: dto.ownerName,
          email: dto.email,
          passwordHash,
        },
        include: {
          role: { include: { permissions: { include: { permission: true } } } },
        },
      });

      await tx.userBranch.create({
        data: { userId: user.id, branchId: branch.id },
      });

      return user;
    });

    // Never block signup on email delivery.
    void this.sendEmailVerification(owner.id).catch((err) =>
      this.logger.warn(`Verification email failed: ${errMessage(err)}`),
    );
    return this.issueSession(owner);
  }

  // ---- Password reset & email verification --------------------------------

  private appUrl(): string {
    const explicit = process.env.APP_URL?.trim();
    const firstOrigin = (process.env.CORS_ORIGIN ?? 'http://localhost:1995').split(',')[0].trim();
    return (explicit || firstOrigin).replace(/\/+$/, '');
  }

  /**
   * Always succeeds from the caller's point of view and returns before any
   * lookup or email happens, so neither the response nor its timing reveals
   * whether the email has an account.
   */
  requestPasswordReset(email: string): void {
    void this.sendPasswordReset(email).catch((err) =>
      this.logger.warn(`Password reset email failed: ${errMessage(err)}`),
    );
  }

  private async sendPasswordReset(email: string) {
    const user = await this.prisma.user.findFirst({
      where: { email: { equals: email.trim(), mode: 'insensitive' }, isActive: true },
      include: { restaurant: { select: { name: true } } },
    });
    if (!user?.email) return;
    if (!this.email.isConfigured()) {
      this.logger.warn('Password reset requested, but email is not set up (SMTP_URL / SMTP_FROM)');
      return;
    }
    // One email per account per minute, whatever the per-IP limit allows.
    const last = await this.tokens.lastIssuedAt(user.id, 'PASSWORD_RESET');
    if (last && Date.now() - last.getTime() < RESEND_COOLDOWN_MS) return;

    const token = await this.tokens.issue(user.id, 'PASSWORD_RESET', RESET_TTL_MS);
    const link = `${this.appUrl()}/reset-password?token=${token}`;
    await this.email.send(passwordResetEmail(user.email, user.name, user.restaurant.name, link));
    await this.audit.record({ userId: user.id, action: 'auth.password_reset_requested', entity: 'User', entityId: user.id });
  }

  async resetPassword(dto: ResetPasswordDto): Promise<void> {
    const userId = await this.tokens.consume(dto.token, 'PASSWORD_RESET');
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user?.isActive) {
      throw new BadRequestException('This link is invalid or has expired. Request a new one.');
    }
    const passwordHash = await bcrypt.hash(dto.password, 12);
    await this.prisma.user.update({
      where: { id: userId },
      data: {
        passwordHash,
        // Signs out every existing session, including an attacker's.
        passwordChangedAt: new Date(),
        // Clicking an emailed link proves they own the inbox.
        emailVerifiedAt: user.emailVerifiedAt ?? new Date(),
      },
    });
    await this.audit.record({ userId, action: 'auth.password_reset', entity: 'User', entityId: userId });
  }

  async sendEmailVerification(userId: string): Promise<void> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { restaurant: { select: { name: true } } },
    });
    if (!user?.email || user.emailVerifiedAt || !this.email.isConfigured()) return;
    const last = await this.tokens.lastIssuedAt(user.id, 'EMAIL_VERIFY');
    if (last && Date.now() - last.getTime() < RESEND_COOLDOWN_MS) return;

    const token = await this.tokens.issue(user.id, 'EMAIL_VERIFY', VERIFY_TTL_MS);
    const link = `${this.appUrl()}/verify-email?token=${token}`;
    await this.email.send(verifyEmail(user.email, user.name, user.restaurant.name, link));
  }

  async verifyEmailToken(token: string): Promise<void> {
    const userId = await this.tokens.consume(token, 'EMAIL_VERIFY');
    await this.prisma.user.updateMany({
      where: { id: userId, emailVerifiedAt: null },
      data: { emailVerifiedAt: new Date() },
    });
  }

  async hasAnyRestaurant(): Promise<boolean> {
    const restaurant = await this.prisma.restaurant.findFirst({
      select: { id: true },
    });
    return restaurant !== null;
  }

  async pinLogin(dto: PinLoginDto) {
    const user = await this.prisma.user.findUnique({
      where: { id: dto.userId },
      include: {
        role: { include: { permissions: { include: { permission: true } } } },
      },
    });

    if (!user || !user.isActive || !user.pinHash) {
      throw new UnauthorizedException('PIN login not available for this user');
    }
    // A 4-8 digit PIN must not be a way around the second factor.
    if (user.twoFactorEnabled) {
      throw new UnauthorizedException(
        'PIN login is off for accounts with two-factor authentication — sign in with your password',
      );
    }

    const valid = await bcrypt.compare(dto.pin, user.pinHash);
    if (!valid) {
      throw new UnauthorizedException('Incorrect PIN');
    }

    return this.issueSession(user);
  }

  private async issueSession(
    user: Parameters<AuthService['toSessionUser']>[0],
  ) {
    const sessionUser = this.toSessionUser(user);
    const token = await this.jwt.signAsync({ sub: user.id });
    return { token, user: sessionUser };
  }
}
