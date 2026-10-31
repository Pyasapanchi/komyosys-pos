import { createHash, randomBytes } from 'node:crypto';
import { BadRequestException, Injectable } from '@nestjs/common';
import type { AuthTokenPurpose } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

const hash = (raw: string) => createHash('sha256').update(raw).digest('hex');
const INVALID = 'This link is invalid or has expired. Request a new one.';

// One-time links (password reset, email verification). The raw token only ever
// exists in the email; the database keeps its SHA-256, so a database leak can't
// be turned into working links.
@Injectable()
export class AuthTokensService {
  constructor(private readonly prisma: PrismaService) {}

  /** Issues a fresh token, invalidating any earlier unused one for the same purpose. */
  async issue(userId: string, purpose: AuthTokenPurpose, ttlMs: number): Promise<string> {
    const raw = randomBytes(32).toString('base64url');
    await this.prisma.$transaction([
      this.prisma.authToken.deleteMany({ where: { userId, purpose, usedAt: null } }),
      this.prisma.authToken.create({
        data: { userId, purpose, tokenHash: hash(raw), expiresAt: new Date(Date.now() + ttlMs) },
      }),
    ]);
    return raw;
  }

  async lastIssuedAt(userId: string, purpose: AuthTokenPurpose): Promise<Date | null> {
    const last = await this.prisma.authToken.findFirst({
      where: { userId, purpose },
      orderBy: { createdAt: 'desc' },
      select: { createdAt: true },
    });
    return last?.createdAt ?? null;
  }

  /** Marks the token used and returns its user. Works exactly once, before expiry. */
  async consume(raw: string, purpose: AuthTokenPurpose): Promise<string> {
    const token = await this.prisma.authToken.findUnique({ where: { tokenHash: hash(raw) } });
    if (!token || token.purpose !== purpose || token.usedAt || token.expiresAt <= new Date()) {
      throw new BadRequestException(INVALID);
    }
    // Conditional update so two simultaneous clicks can't both succeed.
    const { count } = await this.prisma.authToken.updateMany({
      where: { id: token.id, usedAt: null },
      data: { usedAt: new Date() },
    });
    if (count !== 1) throw new BadRequestException(INVALID);
    return token.userId;
  }
}
