'use client';

import React, { useEffect, useState } from 'react';
import { sfx } from './audio';

/**
 * 3 · 2 · 1 · GO overlay. Blocks input while visible; call-site keeps the
 * game paused until `onGo` fires. Renders nothing once finished.
 */
export default function Countdown({ onGo }: { onGo: () => void }) {
  const [step, setStep] = useState(3);

  useEffect(() => {
    if (step === 0) {
      const t = setTimeout(onGo, 350);
      return () => clearTimeout(t);
    }
    sfx('tick');
    const t = setTimeout(() => setStep((s) => s - 1), 750);
    return () => clearTimeout(t);
  }, [step, onGo]);

  if (step < 0) return null;

  return (
    <div
      className="absolute inset-0 z-30 flex items-center justify-center"
      style={{ background: 'rgba(18,8,24,0.55)', backdropFilter: 'blur(4px)' }}
    >
      <span
        key={step}
        className={`font-display select-none ${step === 0 ? 'glow-candy' : 'glow-gold'}`}
        style={{
          fontSize: step === 0 ? 72 : 108,
          animation: 'gv-count 0.7s ease-out both',
        }}
      >
        {step === 0 ? 'GO!' : step}
      </span>
      <style>{`
        @keyframes gv-count {
          0% { transform: scale(1.6); opacity: 0; }
          25% { transform: scale(1); opacity: 1; }
          85% { opacity: 1; }
          100% { opacity: 0.2; }
        }
      `}</style>
    </div>
  );
}
