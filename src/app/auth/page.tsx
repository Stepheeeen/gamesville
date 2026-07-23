'use client';

import { Suspense, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  normaliseMsisdn,
  decodeSessionUser,
  requestAccessCode,
  loginWithCode,
  loginWithPassword,
  setPasswordAndSecurity,
  verifySecurity,
  changePassword,
} from '@/lib/auth';
import { useSession } from '@/lib/store';

type Step =
  | 'landing'
  | 'subscribe'
  | 'code'
  | 'setup'
  | 'login'
  | 'forgot'
  | 'forgot-password';

const SECURITY_QUESTIONS = [
  'What is the name of your first pet?',
  'What city were you born in?',
  'What is your mother’s maiden name?',
  'What was your first school called?',
];

export default function AuthPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-bg-900">
          <div className="fair-spinner" />
        </div>
      }
    >
      <TicketBooth />
    </Suspense>
  );
}

function TicketBooth() {
  const router = useRouter();
  const next = useSearchParams().get('next') ?? '/play';
  const signIn = useSession((s) => s.signIn);

  const [step, setStep] = useState<Step>('landing');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [question, setQuestion] = useState(SECURITY_QUESTIONS[0]);
  const [answer, setAnswer] = useState('');
  const [setupToken, setSetupToken] = useState<string | null>(null);
  const [changeToken, setChangeToken] = useState<string | null>(null);

  const finish = (token: string) => {
    const user = decodeSessionUser(token);
    if (!user) {
      setError('Session error. Please try again.');
      return;
    }
    signIn(token, user);
    router.replace(next);
  };

  const go = (s: Step) => {
    setError(null);
    setStep(s);
  };

  // ── Handlers ────────────────────────────────────────────────────────────────

  const handleSubscribe = async () => {
    setBusy(true);
    setError(null);
    const res = await requestAccessCode(phone);
    setBusy(false);
    if (res.error) setError(res.error);
    else go('code');
  };

  const handleCode = async () => {
    setBusy(true);
    setError(null);
    const res = await loginWithCode(normaliseMsisdn(phone), code);
    setBusy(false);
    if (!res.token) {
      setError(res.error ?? 'Login failed.');
      return;
    }
    if (res.isFirstLogin) {
      setSetupToken(res.token);
      go('setup');
    } else {
      finish(res.token);
    }
  };

  const handleSetup = async () => {
    if (password.length < 8) return setError('Password must be at least 8 characters.');
    if (password !== confirm) return setError('Passwords don’t match.');
    if (!answer.trim()) return setError('Pick a security answer — it recovers your account.');
    setBusy(true);
    setError(null);
    const res = await setPasswordAndSecurity(setupToken!, password, question, answer);
    setBusy(false);
    if (res.token) finish(res.token);
    else setError(res.error ?? 'Could not set password.');
  };

  const handleLogin = async () => {
    setBusy(true);
    setError(null);
    const res = await loginWithPassword(normaliseMsisdn(phone), password);
    setBusy(false);
    if (res.token) finish(res.token);
    else setError(res.error ?? 'Login failed.');
  };

  const handleForgot = async () => {
    setBusy(true);
    setError(null);
    const res = await verifySecurity(normaliseMsisdn(phone), answer);
    setBusy(false);
    if (res.changeToken) {
      setChangeToken(res.changeToken);
      go('forgot-password');
    } else {
      setError(res.error ?? 'Verification failed.');
    }
  };

  const handleChangePassword = async () => {
    if (password.length < 8) return setError('Password must be at least 8 characters.');
    if (password !== confirm) return setError('Passwords don’t match.');
    setBusy(true);
    setError(null);
    const res = await changePassword(changeToken!, password);
    setBusy(false);
    if (res.token) finish(res.token);
    else setError(res.error ?? 'Could not change password.');
  };

  // ── UI ──────────────────────────────────────────────────────────────────────

  return (
    <div className="fair-room flex min-h-screen flex-col">
      <div className="awning h-3" aria-hidden />

      <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-5 py-10">
        <Link href="/" className="font-display glow-gold mb-8 block text-center text-2xl">
          GAMESVILLE
        </Link>

        <div className="marquee p-7">
          <p className="mb-1 text-center text-[10px] font-bold tracking-[0.35em] text-muted uppercase">
            🎟 Ticket Booth
          </p>

          {step === 'landing' && (
            <div className="mt-4 flex flex-col gap-3">
              <h1 className="font-display mb-2 text-center text-xl text-cream">
                Step right up!
              </h1>
              <button className="btn-carnival" onClick={() => go('login')}>
                Sign in
              </button>
              <button className="btn-candy" onClick={() => go('subscribe')}>
                Get an access code
              </button>
              <button className="btn-ghost" onClick={() => go('code')}>
                I already have a code
              </button>
            </div>
          )}

          {step === 'subscribe' && (
            <Form
              title="Join the fair"
              hint="Text GAME to 32770, or enter your number for a mock code (dev: 123456)."
              busy={busy}
              submitLabel="Send my code"
              onSubmit={handleSubscribe}
              onBack={() => go('landing')}
            >
              <PhoneInput value={phone} onChange={setPhone} />
            </Form>
          )}

          {step === 'code' && (
            <Form
              title="Enter your access code"
              hint="The 6-digit code from your subscription SMS."
              busy={busy}
              submitLabel="Claim my ticket"
              onSubmit={handleCode}
              onBack={() => go('landing')}
            >
              <PhoneInput value={phone} onChange={setPhone} />
              <input
                className="booth-input tracking-[0.5em]"
                inputMode="numeric"
                maxLength={6}
                placeholder="••••••"
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
              />
            </Form>
          )}

          {step === 'setup' && (
            <Form
              title="Set up your booth pass"
              hint="A password and a security question for next time."
              busy={busy}
              submitLabel="Finish setup"
              onSubmit={handleSetup}
            >
              <PasswordInput
                placeholder="Password (8+ characters)"
                value={password}
                onChange={setPassword}
              />
              <PasswordInput
                placeholder="Confirm password"
                value={confirm}
                onChange={setConfirm}
              />
              <select
                className="booth-input"
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
              >
                {SECURITY_QUESTIONS.map((q) => (
                  <option key={q} value={q}>
                    {q}
                  </option>
                ))}
              </select>
              <input
                className="booth-input"
                placeholder="Your answer"
                value={answer}
                onChange={(e) => setAnswer(e.target.value)}
              />
            </Form>
          )}

          {step === 'login' && (
            <Form
              title="Welcome back"
              busy={busy}
              submitLabel="Sign in"
              onSubmit={handleLogin}
              onBack={() => go('landing')}
            >
              <PhoneInput value={phone} onChange={setPhone} />
              <PasswordInput placeholder="Password" value={password} onChange={setPassword} />
              <button
                type="button"
                className="text-left text-xs text-teal hover:underline"
                onClick={() => go('forgot')}
              >
                Forgot password?
              </button>
            </Form>
          )}

          {step === 'forgot' && (
            <Form
              title="Recover your pass"
              hint="Answer your security question to reset your password."
              busy={busy}
              submitLabel="Verify"
              onSubmit={handleForgot}
              onBack={() => go('login')}
            >
              <PhoneInput value={phone} onChange={setPhone} />
              <input
                className="booth-input"
                placeholder="Security answer"
                value={answer}
                onChange={(e) => setAnswer(e.target.value)}
              />
            </Form>
          )}

          {step === 'forgot-password' && (
            <Form
              title="Choose a new password"
              busy={busy}
              submitLabel="Save & sign in"
              onSubmit={handleChangePassword}
            >
              <PasswordInput
                placeholder="New password (8+ characters)"
                value={password}
                onChange={setPassword}
              />
              <PasswordInput
                placeholder="Confirm new password"
                value={confirm}
                onChange={setConfirm}
              />
            </Form>
          )}

          {error && (
            <p className="mt-4 rounded-lg border border-danger/40 bg-danger/10 px-3 py-2 text-center text-xs text-danger">
              {error}
            </p>
          )}
        </div>

        <p className="mt-6 text-center text-xs text-muted">
          <Link href="/play" className="hover:text-cream-2">
            Just browsing? Walk the midway →
          </Link>
        </p>
      </main>

      <style>{`
        .booth-input {
          width: 100%;
          padding: 12px 14px;
          border-radius: 10px;
          background: rgba(18, 8, 24, 0.6);
          border: 1px solid var(--color-border-bright);
          color: var(--color-cream);
          font-size: 0.9rem;
          outline: none;
        }
        .booth-input:focus { border-color: var(--color-gold); }
        .booth-input::placeholder { color: var(--color-muted); }
        select.booth-input option { background: #241333; }
      `}</style>
    </div>
  );
}

function PasswordInput({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
}) {
  const [visible, setVisible] = useState(false);
  return (
    <div className="relative">
      <input
        className="booth-input pr-12"
        type={visible ? 'text' : 'password'}
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
      <button
        type="button"
        aria-label={visible ? 'Hide password' : 'Show password'}
        aria-pressed={visible}
        onClick={() => setVisible((v) => !v)}
        className="absolute top-1/2 right-3 -translate-y-1/2 p-1 text-lg leading-none opacity-70 hover:opacity-100"
      >
        {visible ? '🙈' : '👁️'}
      </button>
    </div>
  );
}

function PhoneInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <input
      className="booth-input"
      inputMode="tel"
      placeholder="Phone number (e.g. 0903 731 1304)"
      value={value}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}

function Form({
  title,
  hint,
  busy,
  submitLabel,
  onSubmit,
  onBack,
  children,
}: {
  title: string;
  hint?: string;
  busy: boolean;
  submitLabel: string;
  onSubmit: () => void;
  onBack?: () => void;
  children: React.ReactNode;
}) {
  return (
    <form
      className="mt-4 flex flex-col gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit();
      }}
    >
      <h1 className="font-display text-center text-xl text-cream">{title}</h1>
      {hint && <p className="text-center text-xs text-muted">{hint}</p>}
      {children}
      <button className="btn-carnival mt-1" type="submit" disabled={busy}>
        {busy ? 'One moment…' : submitLabel}
      </button>
      {onBack && (
        <button type="button" className="text-xs text-muted hover:text-cream-2" onClick={onBack}>
          ← Back
        </button>
      )}
    </form>
  );
}
