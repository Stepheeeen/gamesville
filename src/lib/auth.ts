// ── Auth client — Gamesville Ticket Booth ─────────────────────────────────────
// Thin fetch wrappers over the auth API. No storage here: callers put the
// returned token/user into the zustand session store (src/lib/store.ts),
// the single source of session truth.
//
// Flow:
//   First time:  subscribe (MNO / mock) → phone + 6-digit code → set
//                password + security question → done
//   Returning:   phone + password
//   Forgot:      security answer → new password

import type { SessionUser } from './store';

// ── Phone helpers ─────────────────────────────────────────────────────────────

export function normaliseMsisdn(raw: string, countryCode = '234'): string {
  let digits = raw.replace(/\D/g, '');
  if (digits.startsWith('0')) digits = digits.slice(1);
  if (!digits.startsWith(countryCode)) digits = countryCode + digits;
  return '+' + digits;
}

export function formatMsisdn(msisdn: string): string {
  const m = msisdn.match(/^(\+\d{3})(\d{3})(\d{3})(\d{4})$/);
  return m ? `${m[1]} ${m[2]} ${m[3]} ${m[4]}` : msisdn;
}

// ── Token → session user ──────────────────────────────────────────────────────

export function decodeSessionUser(token: string): SessionUser | null {
  try {
    const part = token.split('.')[1];
    const payload = JSON.parse(atob(part.replace(/-/g, '+').replace(/_/g, '/')));
    if (!payload.userId) return null;
    const phone = String(payload.phone ?? '');
    return {
      id: String(payload.userId),
      phone,
      displayNumber: String(payload.displayNumber ?? phone),
      isFirstLogin: Boolean(payload.isFirstLogin ?? false),
    };
  } catch {
    return null;
  }
}

// ── API wrappers ──────────────────────────────────────────────────────────────

type TokenResult = { token?: string; isFirstLogin?: boolean; error?: string };

async function post(url: string, body: object, token?: string): Promise<Record<string, unknown>> {
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(body),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) return { error: json.error ?? 'Something went wrong.' };
    return json;
  } catch {
    return { error: 'Network error. Please check your connection.' };
  }
}

export function requestAccessCode(phone: string) {
  return post('/api/auth/register', { phone }) as Promise<{ success?: boolean; error?: string }>;
}

export function loginWithCode(phone: string, code: string) {
  return post('/api/auth/login', {
    phone,
    credential: code,
    credentialType: 'code',
  }) as Promise<TokenResult>;
}

export function loginWithPassword(phone: string, password: string) {
  return post('/api/auth/login', {
    phone,
    credential: password,
    credentialType: 'password',
  }) as Promise<TokenResult>;
}

export function setPasswordAndSecurity(
  token: string,
  password: string,
  securityQuestion: string,
  securityAnswer: string,
) {
  return post(
    '/api/auth/set-password',
    { password, securityQuestion, securityAnswer },
    token,
  ) as Promise<TokenResult & { success?: boolean }>;
}

export function verifySecurity(phone: string, answer: string) {
  return post('/api/auth/verify-security', { phone, answer }) as Promise<{
    changeToken?: string;
    error?: string;
  }>;
}

export function changePassword(changeToken: string, newPassword: string) {
  return post('/api/auth/change-password', { changeToken, newPassword }) as Promise<TokenResult>;
}
