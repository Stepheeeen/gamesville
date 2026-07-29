// ── Onboarding demo account ───────────────────────────────────────────────────
// A single fixed account that can sign in with a password WITHOUT going
// through the MNO subscription/OTP flow — for demos, reviews and store
// onboarding. It is seeded on demand (idempotent) rather than hardcoded as
// a login bypass, so it flows through the normal password check like any
// real user. Only this one number is privileged; nothing else changes.

import bcrypt from 'bcryptjs';
import { getUserByPhone, createUser, updateUser, setPass } from './db';

/** Normalised MSISDN of the allow-listed demo number "07035007672". */
export const DEMO_PHONE = '+2347035007672';
const DEMO_PASSWORD = 'Test@123';

export function isDemoPhone(phone: string): boolean {
  return phone === DEMO_PHONE;
}

// Dedupe concurrent seeds within a process.
const g = globalThis as unknown as { __gvDemoSeed?: Promise<void> };

/**
 * Ensure the demo account exists with the fixed password and an active
 * pass. No-op for any other phone. Safe to call on every login attempt.
 */
export async function ensureDemoAccount(phone: string): Promise<void> {
  if (!isDemoPhone(phone)) return;
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
