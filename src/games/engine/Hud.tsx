'use client';

import React from 'react';

/**
 * Hybrid-rendering HUD: crisp HTML/CSS typography layered over the game
 * canvas. Passive readouts sit at the top; interactive controls render
 * inside the bottom thumb zone (`.hud-controls`, ≥44px targets).
 */
export function Hud({ children }: { children: React.ReactNode }) {
  return <div className="hud">{children}</div>;
}

export function HudRow({ children }: { children: React.ReactNode }) {
  return <div className="flex flex-wrap items-start justify-between gap-2">{children}</div>;
}

export function HudChip({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <span className="hud-chip">
      <span className="text-[9px] tracking-[0.25em] text-muted uppercase">{label}</span>
      <strong>{value}</strong>
    </span>
  );
}

export function HudControls({ children }: { children: React.ReactNode }) {
  return <div className="hud-controls">{children}</div>;
}

/** Center-screen banner for transient messages (JACKPOT!, STREAK ×3, …). */
export function HudBanner({ text }: { text: string | null }) {
  if (!text) return null;
  return (
    <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center">
      <span
        className="font-display glow-gold fair-fade-in rounded-xl px-8 py-3 text-4xl"
        style={{
          background: 'rgba(18,8,24,0.72)',
          backdropFilter: 'blur(8px)',
          border: '1px solid rgba(255,198,77,0.35)',
        }}
      >
        {text}
      </span>
    </div>
  );
}
