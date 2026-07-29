// ── Onboarding demo account ───────────────────────────────────────────────────
// A single fixed account that can sign in with a password WITHOUT going
// through the MNO subscription/OTP flow — for demos, reviews and store
// onboarding. It is seeded on demand (idempotent) rather than hardcoded as
// a login bypass, so it flows through the normal password check like any
// real user. Only this one number is privileged.
//
// The number and password come from env vars (DEMO_ACCOUNT_PHONE /
// DEMO_ACCOUNT_PASSWORD) so no credential lives in the repo. If either is
// unset the whole feature is a no-op.

import bcrypt from 'bcryptjs';
import { getUserByPhone, createUser, updateUser, setPass } from './db';

function normaliseMsisdn(raw: string, countryCode = '234'): string {
  let digits = raw.replace(/\D/g, '');
  if (digits.startsWith('0')) digits = digits.slice(1);
  if (!digits.startsWith(countryCode)) digits = countryCode + digits;
  return '+' + digits;
}

const RAW_PHONE = process.env.DEMO_ACCOUNT_PHONE ?? '';
const DEMO_PASSWORD = process.env.DEMO_ACCOUNT_PASSWORD ?? '';

/** Normalised MSISDN of the allow-listed demo number, or '' if unconfigured. */
export const DEMO_PHONE = RAW_PHONE ? normaliseMsisdn(RAW_PHONE) : '';

export function isDemoPhone(phone: string): boolean {
  return !!DEMO_PHONE && phone === DEMO_PHONE;
}

// Dedupe concurrent seeds within a process.
const g = globalThis as unknown as { __gvDemoSeed?: Promise<void> };

/**
 * Ensure the demo account exists with its password and an active pass.
 * No-op for any other phone, or when the feature is unconfigured. Safe to
 * call on every login attempt.
 */
export async function ensureDemoAccount(phone: string): Promise<void> {
  if (!DEMO_PASSWORD || !isDemoPhone(phone)) return;
  if (!g.__gvDemoSeed) {
    g.__gvDemoSeed = seed().catch((err) => {
      console.error('[demo] seed failed', err);
      g.__gvDemoSeed = undefined; // allow a retry on the next attempt
    });
  }
  return g.__gvDemoSeed;
}

async function seed(): Promise<void> {
  const existing = await getUserByPhone(DEMO_PHONE);
  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 12);

  if (!existing) {
    // createUser sets isFirstLogin + a temp code; we immediately finish
    // onboarding so a password sign-in works straight away.
    await createUser(DEMO_PHONE, '000000', 60 * 60 * 1000);
  }

  await updateUser(DEMO_PHONE, {
    passwordHash,
    isFirstLogin: false,
    tempCode: null,
    tempCodeExpires: null,
    securityQuestion: 'Demo account',
    securityAnswerHash: await bcrypt.hash('demo', 10),
  });

  // Give it a long-lived wristband so every gated surface is open.
  await setPass(DEMO_PHONE, 'golden', 3650);
}
