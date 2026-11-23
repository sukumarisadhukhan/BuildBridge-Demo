import { createHmac, timingSafeEqual } from 'node:crypto';

function secret() {
  const value = process.env.UNSUBSCRIBE_TOKEN_SECRET;
  if (!value || value.length < 32) throw new Error('UNSUBSCRIBE_TOKEN_SECRET must contain at least 32 characters.');
  return value;
}

export function createUnsubscribeToken(userId: string, expiresAt: number) {
  const payload = `${userId}.${expiresAt}`;
  const signature = createHmac('sha256', secret()).update(payload).digest('base64url');
  return `${Buffer.from(payload).toString('base64url')}.${signature}`;
}

export function verifyUnsubscribeToken(token: string) {
  const [encoded, suppliedSignature] = token.split('.');
  if (!encoded || !suppliedSignature) return null;
  const payload = Buffer.from(encoded, 'base64url').toString('utf8');
  const expectedSignature = createHmac('sha256', secret()).update(payload).digest();
  const actualSignature = Buffer.from(suppliedSignature, 'base64url');
  if (actualSignature.length !== expectedSignature.length || !timingSafeEqual(actualSignature, expectedSignature)) return null;
  const [userId, expiration] = payload.split('.');
  const expiresAt = Number(expiration);
  if (!userId || !Number.isInteger(expiresAt) || expiresAt <= Math.floor(Date.now() / 1000)) return null;
  return { userId };
}
