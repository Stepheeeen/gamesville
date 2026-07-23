# Gamesville — Night Carnival Arcade: Redesign Milestones

Full redesign + upscale to the platform model proven in gamed-up / sports-cafe,
under a new **Retro Carnival Funfair at Night** theme. Landed 2026-07-23.

## M0 — Setup ✅
- [x] zustand installed (only new dependency)
- [x] `src/lib/jwt.ts`: production now requires `JWT_SECRET` (≥16 chars); dev fallback only

## M1 — Carnival theme foundation ✅
- [x] `globals.css` rewritten: Tailwind v4 `@theme` carnival tokens (midnight-plum,
      bulb gold, candy red, teal, cream), component classes (`.marquee` bulb-chase border,
      `.ticket` punched-notch cards, `.awning` scalloped stripes, `.bunting`, `.booth-panel`,
      `.prize-badge`, `.hud-*`, `.stage`), keyframes, reduced-motion block
- [x] `layout.tsx`: Alfa Slab One (display) + Nunito (body) via next/font
- [x] Navbar (awning + marquee logo), BottomNav (ticket-booth tabs), AuthGuard on new tokens

## M2 — Catalog + shared engine ✅
- [x] `src/lib/game-catalog.ts` — single source of truth for all 10 games: display copy
      AND server validation (`scoreBounds`) and win rules (`winThreshold`) side by side
- [x] `src/games/types.ts` — 4-field GameProps host↔game contract
- [x] `src/games/engine/` — PhaserHost (SSR-safe, legacy-event bridge, loop-sleep pause,
      visibility sleep/wake, ResizeObserver FIT refresh), useGameFlow (hint → countdown),
      Hud overlay, WebAudio synth sfx (zero assets), haptics
- [x] `src/games/registry.ts` — per-game dynamic imports + hover/touch/focus preload

## M3 — 10 games integrated ✅
- [x] 10 thin wrappers in `src/games/phaser/` over the existing scenes (no gameplay rework)
- [x] Scene canvas backgrounds recolored to carnival midnight-plum
- [x] The 5 previously-orphaned scenes (TowerStack, KnifeHit, ZigZagDrift, BasketFlip,
      PenaltyShootout) are now live — all 10 smoke-tested headless: canvas boots, HUD
      receives SCORE_UPDATE, zero page errors

## M4 — Backend rebuild ✅
- [x] `db.ts` dual backend (MongoDB when `MONGODB_URI`, JSON FileStore `.data/store.json`
      otherwise), globalThis-cached, `warmDb()` from instrumentation.ts, best-per-game
      score upsert, UTC-day streaks, Carnival Cup F1 points (25…1) with parallel fan-out
- [x] Server-side Prize Booth achievements (`achievements.ts`) + `buildProfile`
- [x] **Login backdoor removed** (no auto-create, no hardcoded code, no cross-project mock
      seeds); register/resend route (mock MNO, rate-limited); login/security-answer
      rate limits
- [x] Scores API: bearer-token identity only, catalog bounds + integer validation,
      10/60s sliding-window rate limit, server-side achievement diff in the response
- [x] Leaderboard: per-game boards (one row per player) + `?game=championship`
- [x] Passes ("Ride Tickets & Wristbands": Day/Weekend/Golden, mock DCB) + hardened MNO
      webhook (`x-webhook-secret` required; subscribe/renew/cancel/expire events)
- [x] Profile + public stats APIs (30s cache, real numbers only — honest zeros)

## M5 — Pages ✅
- [x] `/play/[gameId]` GameRoom: attempt-keyed replay remount, idempotent game-over,
      deferred score save (sign in from the overlay auto-posts), prize-pop achievement
      reveal, booth-rules ticket, mute toggle, error boundary
- [x] Lobby (featured-attraction marquee + 10 ticket cards, hover preload), landing
      (awning hero, live ticker, Cup explainer), leaderboard (Cup + per-game tabs,
      "You" highlight), profile (stat tiles, wristband purchase, Prize Booth shelf),
      auth ("Ticket Booth" wizard on the new endpoints)
- [x] Dead code deleted: GameContainer, PhaserWrapper, storage.ts, mongodb.ts,
      old duplicated metadata copies — every surface reads the catalog

## M6 — Verification ✅ (2026-07-23, against MongoDB via .env.local)
- [x] `npm run build` clean; `tsc --noEmit` clean
- [x] Register (mock OTP) → code login → score submit → achievements returned
      (First Ticket, High Striker, Showstopper, Golden Plushie) → Cup standings correct
- [x] Day Ticket purchase → profile shows active wristband
- [x] Headless-Chromium play pass: all 10 game rooms boot, HUD live, no console errors
- [x] Negative tests: score w/o bearer → 401 · out-of-bounds/unknown game → 422 ·
      11th rapid submit → 429 · unknown-phone login does NOT auto-create → 401 ·
      webhook w/o secret → 401

## Defects found & fixed during play-testing
- Carnival Cup / stats fan-out was serial → ~9s score submits against Atlas (rate limit
  could never trip). Parallelized `championship()` and stats tops; submits ~5.5s.
- `PASS_CATALOG` exported from a route file (Next forbids extra route exports) → moved
  to `src/lib/passes.ts`.

## M7 — Five new midway games ✅ (2026-07-23)
Five brand-new attractions, mechanically distinct from every game in gamed-up,
sports-cafe, sportsville and the original ten:
- [x] **High Striker** 🔨 (`striker`) — oscillating power meter, bell chains ×2/×3, 8 swings
- [x] **Whack-a-Mole** 🦫 (`whack`) — 3×3 reaction grid, dynamite decoys, 3 lives / 60s
- [x] **Duck Gallery** 🦆 (`ducks`) — 3-lane lead-aim shooting gallery, 20 shots, golden ducks
- [x] **Ferris Drop** 🎡 (`ferris`) — rotational trajectory timing into the open gondola
- [x] **Milk Bottle Smash** 🥛 (`bottles`) — drag-release ballistic throws, 3 pyramids, STRIKE bonus
- [x] Wired through the standard pattern: scene + config in `src/game-engine/`, catalog
      entries (bounds/thresholds/howTo), wrappers in `src/games/phaser/`, registry importers
- [x] Copy updated to "fifteen midway mini-games"; the Cup and the Full House prize now
      automatically span 15 boards (Full House got harder — by design)

## M8 — Legacy games retired ✅ (2026-07-23)
- [x] The ten original games (BlockSort, HexaBlocks, BrickQuest, LineConnect, WordSwipe,
      TowerStack, KnifeHit, ZigZagDrift, BasketFlip, PenaltyShootout) removed at the user's
      request — scenes, wrappers, registry importers and catalog entries deleted
- [x] The midway is now the five M7 attractions only; copy updated to "five midway mini-games"
- [x] Catalog-driven surfaces (Cup, Full House prize, stats, lobby) adjusted automatically;
      the score API now rejects the retired game ids (422). Old score rows for retired ids
      remain in the database but are no longer read by any board.

## M9 — Midway gated behind auth ✅ (2026-07-23)
- [x] `/play` (lobby) and `/play/[gameId]` (game rooms) wrapped in `AuthGuard` —
      unauthenticated visitors are redirected to `/auth?next=<intended page>` and
      return there after signing in
- [x] Verified headless: anonymous → redirected to the Ticket Booth for both routes;
      seeded session → lobby renders 5 tickets and the game room boots
- [x] Server-side score/profile APIs already required bearer tokens (unchanged);
      landing and leaderboard remain public as marketing/browse surfaces

## M10 — Mobile game-room UX + password visibility ✅ (2026-07-23)
- [x] Ticket Booth passwords get a show/hide toggle (👁️/🙈, `aria-pressed`) on all five
      password fields (setup ×2, sign-in, reset ×2)
- [x] Mobile game rooms are now the full screen: header + canvas fill 100dvh with
      `overflow-hidden` — verified headless that neither document nor body scrolls
- [x] ❔ icon in the room bar opens the booth rules (emoji, steps, rules) as a modal;
      the game pauses (`forcePaused` → loop sleep) while it's open, tap-outside or
      "Got it" closes. The below-stage rules card is now desktop-only.

## Known follow-ups
- Score submit still ~5s on remote Atlas (two `buildProfile` round-trip batches);
  worth caching championship per request or precomputing ranks.
- Legacy scenes use raw `setTimeout` in places; pause is enforced via `game.loop.sleep()`
  (freezes update/render/`this.time`), so stray timeouts can fire while paused — cosmetic.
- Lint debt in legacy `src/game-engine/*Scene.ts` (`no-explicit-any`) predates the
  redesign; the `set-state-in-effect` warnings are the standard hydration pattern.
