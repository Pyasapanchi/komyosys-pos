import { clientIp } from './client-ip-throttler.guard';

describe('clientIp', () => {
  const req = (headers: Record<string, string | string[]>) => ({ ip: '172.18.0.5', headers });

  it('uses req.ip when no header is configured', () => {
    expect(clientIp(req({ 'cf-connecting-ip': '203.0.113.7' }), undefined)).toBe('172.18.0.5');
  });

  it('uses the configured header, case-insensitively', () => {
    expect(clientIp(req({ 'cf-connecting-ip': ' 203.0.113.7 ' }), 'CF-Connecting-IP')).toBe('203.0.113.7');
    expect(clientIp(req({ 'cf-connecting-ip': '2001:db8::1' }), 'cf-connecting-ip')).toBe('2001:db8::1');
  });

  it('falls back to req.ip when the header is missing or not an IP', () => {
    expect(clientIp(req({}), 'cf-connecting-ip')).toBe('172.18.0.5');
    expect(clientIp(req({ 'cf-connecting-ip': 'not-an-ip' }), 'cf-connecting-ip')).toBe('172.18.0.5');
    expect(clientIp(req({ 'cf-connecting-ip': '1.2.3.4, 5.6.7.8' }), 'cf-connecting-ip')).toBe('172.18.0.5');
  });

  it('takes the first value of a repeated header', () => {
    expect(clientIp(req({ 'cf-connecting-ip': ['198.51.100.2', '1.1.1.1'] }), 'cf-connecting-ip')).toBe('198.51.100.2');
  });
});
