import { isIP } from 'node:net';
import { Injectable } from '@nestjs/common';
import { ThrottlerGuard, normalizeIp } from '@nestjs/throttler';

type RequestLike = {
  ip?: string;
  headers?: Record<string, string | string[] | undefined>;
};

// Behind Cloudflare -> Traefik -> web container, req.ip is the web container for
// every visitor, so the app-wide and login limits were one bucket shared by all
// restaurants. When CLIENT_IP_HEADER names a header set by a trusted edge
// (cf-connecting-ip), key the limits on that instead. Only set it when the origin
// accepts traffic solely from that edge, otherwise the header can be forged.
export function clientIp(
  req: RequestLike,
  header: string | undefined = process.env.CLIENT_IP_HEADER,
): string | undefined {
  const name = header?.trim().toLowerCase();
  if (name) {
    const raw = req.headers?.[name];
    const value = (Array.isArray(raw) ? raw[0] : raw)?.trim();
    if (value && isIP(value)) return value;
  }
  return req.ip;
}

@Injectable()
export class ClientIpThrottlerGuard extends ThrottlerGuard {
  protected override async getTracker(req: Record<string, any>): Promise<string> {
    return normalizeIp(clientIp(req as RequestLike) ?? '');
  }
}
