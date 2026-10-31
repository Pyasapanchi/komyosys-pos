import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import type { SessionUser } from '@nodedr-restaurant/types';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { PrismaService } from '../prisma/prisma.service';

interface JwtPayload {
  sub: string;
  iat?: number;
}

/**
 * A session issued before the user's last password change no longer counts,
 * so a reset signs out everyone holding the old one. `iat` is in whole seconds,
 * so compare at second precision (a login in the same second as the change
 * still works).
 */
export function isSessionRevoked(
  user: { passwordChangedAt: Date | null },
  iat: number | undefined,
): boolean {
  if (!user.passwordChangedAt) return false;
  if (typeof iat !== 'number') return true;
  return iat < Math.floor(user.passwordChangedAt.getTime() / 1000);
}

const cookieExtractor = (req: {
  cookies?: Record<string, string>;
}): string | null => {
  return req.cookies?.['nodedr_session'] ?? null;
};

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    config: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromExtractors([cookieExtractor]),
      ignoreExpiration: false,
      secretOrKey: config.getOrThrow<string>('JWT_SECRET'),
    });
  }

  async validate(payload: JwtPayload): Promise<SessionUser> {
    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      include: {
        role: { include: { permissions: { include: { permission: true } } } },
      },
    });

    if (!user || !user.isActive || isSessionRevoked(user, payload.iat)) {
      throw new UnauthorizedException('Session no longer valid');
    }

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
}
