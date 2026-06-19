import * as jose from 'jose';

const ISSUER = 'palmi-api';
const ACCESS_TTL_SECONDS = 7 * 24 * 60 * 60; // 7 days
const REFRESH_TTL_SECONDS = 14 * 24 * 60 * 60; // 14 days

export interface TokenPayload {
  sub: string;   // userId
  jti: string;   // token id for KV lookup
  iat: number;
  exp: number;
  iss: string;
  type: 'access' | 'refresh';
}

export async function signToken(
  userId: string,
  type: 'access' | 'refresh',
  secret: string
): Promise<{ token: string; jti: string; expiresAt: Date }> {
  const jti = crypto.randomUUID();
  const now = Math.floor(Date.now() / 1000);
  const ttl = type === 'access' ? ACCESS_TTL_SECONDS : REFRESH_TTL_SECONDS;
  const exp = now + ttl;
  const expiresAt = new Date(exp * 1000);

  const secretKey = new TextEncoder().encode(secret);

  const token = await new jose.SignJWT({ type })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(userId)
    .setJti(jti)
    .setIssuedAt(now)
    .setExpirationTime(exp)
    .setIssuer(ISSUER)
    .sign(secretKey);

  return { token, jti, expiresAt };
}

export async function verifyToken(
  token: string,
  secret: string
): Promise<TokenPayload> {
  const secretKey = new TextEncoder().encode(secret);
  const { payload } = await jose.jwtVerify(token, secretKey, {
    issuer: ISSUER,
    algorithms: ['HS256'],
  });
  return payload as unknown as TokenPayload;
}
