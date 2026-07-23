import jwt from 'jsonwebtoken';

// Dev-only fallback; production must supply a real secret.
const SECRET = (() => {
  const s = process.env.JWT_SECRET;
  if (s && s.length >= 16) return s;
  if (process.env.NODE_ENV === 'production') {
    throw new Error('JWT_SECRET (>=16 chars) is required in production');
  }
  return 'gv-dev-secret-not-for-prod';
})();
const EXPIRES = '7d';

export interface JwtPayload {
  userId:        string;
  phone:         string;
  displayNumber: string;
  isFirstLogin:  boolean;
}

export function signToken(payload: JwtPayload): string {
  return jwt.sign(payload, SECRET, { expiresIn: EXPIRES });
}

export function verifyToken(token: string): JwtPayload | null {
  try {
    return jwt.verify(token, SECRET) as JwtPayload;
  } catch {
    return null;
  }
}

/** Extract the verified session payload from an Authorization header. */
export function bearerPayload(header: string | null): JwtPayload | null {
  if (!header?.startsWith('Bearer ')) return null;
  return verifyToken(header.slice(7));
}

/** Short-lived single-purpose token (e.g. change-password). */
export function signPurposeToken(payload: object, purpose: string, expiresIn: string): string {
  return jwt.sign({ ...payload, purpose }, SECRET, { expiresIn } as jwt.SignOptions);
}

export function verifyPurposeToken<T extends object>(token: string, purpose: string): T | null {
  try {
    const decoded = jwt.verify(token, SECRET) as T & { purpose?: string };
    return decoded.purpose === purpose ? decoded : null;
  } catch {
    return null;
  }
}
