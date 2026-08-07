import * as Phaser from 'phaser';
import { FRAMES, PERFECT, breakdown, total } from './bowling-scoring';

/**
 * Ten-Pin Bowling — five frames on a night-fair alley.
 *
 * Top-down lane view with zero gravity: the "ball falling" axis doesn't
 * exist here, so arcade physics is used purely in the lane plane. That is
 * exactly what arcade's circle bodies are good at — a heavy ball ploughing
 * through ten light pins, with pin-on-pin action doing the rest.
 *
 * One gesture does everything a bowler actually controls:
 *   - touch down  → places the ball across the approach (your stance)
 *   - swipe up    → direction sets the line, length sets the speed
 * Scoring is real 10-pin over five frames, with the last frame taking
 * bonus balls exactly like a regulation tenth. A perfect game is 150.
 */

// ── Lane geometry (canvas is 600×1000) ───────────────────────────────────────
// Everything below is scaled from regulation dimensions at ~6.33px per inch,
// because the ratios are what make bowling behave like bowling. Critically,
// the gap between two neighbouring pins (12in spacing − 4.75in pin = 7.25in)
// is NARROWER than the 8.5in ball, so a ball physically cannot thread between
// two pins on the same row. Get that ratio wrong and a centred ball sails
// through the whole rack untouched.
const PX_PER_IN = 6.333;
const PIN_SPACING = Math.round(12 * PX_PER_IN); // 76
const ROW_SPACING = Math.round(12 * Math.sin(Math.PI / 3) * PX_PER_IN); // 66
const PIN_R = Math.round((4.75 * PX_PER_IN) / 2); // 15
const BALL_R = Math.round((8.5 * PX_PER_IN) / 2); // 27

const LANE_CX = 300;
const LANE_HALF = 140; // 44in — a shade wider than regulation, for playability
const LANE_L = LANE_CX - LANE_HALF;
const LANE_R = LANE_CX + LANE_HALF;
const GUTTER_W = 42;
const PIT_Y = 150; // far end — where the ball and pins disappear
const FOUL_Y = 838;
const BALL_HOME_Y = 896;
const HEAD_PIN_Y = 430;

const KNOCKED_DIST = 11;      // px a pin must be shoved off its spot to count as down
const PIN_RESTITUTION = 0.62; // pin-on-pin bounciness
const PIN_MAX_SPEED = 540;    // cap on pin carry — too high and every line clears the rack
const BALL_PIN_KICK = 1.1;    // share of the ball's closing speed handed to a pin
const BALL_DEFLECT = 0.1;     // how much the ball is turned by each pin it strikes

const CREAM = 0xfff4e0;
const GOLD = 0xffc64d;
const TEAL = 0x2bd9c8;
const CANDY = 0xff4d5e;

/** The ten spots, apex (head pin) nearest the bowler. */
const PIN_SPOTS: { x: number; y: number }[] = (() => {
  const spots: { x: number; y: number }[] = [];
  for (let row = 0; row < 4; row++) {
    const count = row + 1;
    const y = HEAD_PIN_Y - row * ROW_SPACING;
    const startX = LANE_CX - ((count - 1) * PIN_SPACING) / 2;
    for (let i = 0; i < count; i++) spots.push({ x: startX + i * PIN_SPACING, y });
  }
  return spots;
})();

type Pin = Phaser.GameObjects.Container;

export default class BowlingScene extends Phaser.Scene {
  // ── Match state ────────────────────────────────────────────────────────────
  /** Every ball's pin count, in order — the single source of truth for scoring. */
  private rolls: number[] = [];
  private frame = 1;
  private ballInFrame = 1;
  private over = false;

  // ── Roll state ─────────────────────────────────────────────────────────────
  private pins: Pin[] = [];
  private ball!: Phaser.GameObjects.Container;
  private ballArt!: Phaser.GameObjects.Container;
  private ballBody!: Phaser.Physics.Arcade.Body;
  private rolling = false;
  private resolved = true; // true between rolls, false while a ball is live
  private inGutter = false;
  private settleFrames = 0;
  private maxRollTimer: Phaser.Time.TimerEvent | null = null;

  // ── Input ──────────────────────────────────────────────────────────────────
  private dragging = false;
  private dragStart = new Phaser.Math.Vector2();
  private aimGfx!: Phaser.GameObjects.Graphics;

  // ── Chrome ─────────────────────────────────────────────────────────────────
  private frameText!: Phaser.GameObjects.Text;
  private ballText!: Phaser.GameObjects.Text;
  private sheetCells: { balls: Phaser.GameObjects.Text[]; total: Phaser.GameObjects.Text }[] = [];
  private sheetHighlight!: Phaser.GameObjects.Graphics;

  constructor() {
    super({ key: 'BowlingScene' });
  }

  create() {
    this.rolls = [];
    this.frame = 1;
    this.ballInFrame = 1;
    this.over = false;
    this.pins = [];
    this.rolling = false;
    this.resolved = true;
    this.inGutter = false;
    this.sheetCells = [];

    this.drawAlley();
    this.buildScoresheet();

    this.aimGfx = this.add.graphics().setDepth(25);

    this.rackFresh();
    this.newBall();
    this.refreshChrome();

    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      if (this.over || !this.canBowl()) return;
      this.dragging = true;
      this.dragStart.set(p.worldX, p.worldY);
      // Touching down sets your stance across the approach.
      this.ball.x = Phaser.Math.Clamp(p.worldX, LANE_L + BALL_R + 4, LANE_R - BALL_R - 4);
    });
    this.input.on('pointermove', (p: Phaser.Input.Pointer) => {
      if (this.dragging) this.drawAim(p);
    });
    this.input.on('pointerup', (p: Phaser.Input.Pointer) => {
      if (!this.dragging) return;
      this.dragging = false;
      this.aimGfx.clear();
      this.throwBall(p);
    });
  }

  private canBowl() {
    return this.resolved && !this.rolling;
  }

  // ── Alley dressing ──────────────────────────────────────────────────────────

  private drawAlley() {
    const g = this.add.graphics();

    // Room behind the pit
    g.fillGradientStyle(0x241333, 0x241333, 0x120818, 0x120818, 1);
    g.fillRect(0, 0, 600, PIT_Y + 40);

    // Gutters — recessed channels either side of the lane
    for (const gx of [LANE_L - GUTTER_W, LANE_R]) {
      g.fillStyle(0x1a0f28, 1);
      g.fillRect(gx, PIT_Y, GUTTER_W, FOUL_Y - PIT_Y);
      g.fillStyle(0x0d0715, 1);
      g.fillRect(gx + 6, PIT_Y, GUTTER_W - 12, FOUL_Y - PIT_Y);
    }

    // Lane bed — polished maple, warmer toward the foul line
    g.fillGradientStyle(0x9c6b34, 0x9c6b34, 0xc08a49, 0xc08a49, 1);
    g.fillRect(LANE_L, PIT_Y, LANE_R - LANE_L, FOUL_Y - PIT_Y);
    // Boards
    g.lineStyle(1, 0x7a5228, 0.45);
    for (let x = LANE_L + 15; x < LANE_R; x += 15) g.lineBetween(x, PIT_Y, x, FOUL_Y);
    // Lane shine down the middle
    g.fillStyle(CREAM, 0.05);
    g.fillRect(LANE_CX - 60, PIT_Y, 120, FOUL_Y - PIT_Y);

    // Pin deck — slightly paler, with the ten spots marked
    g.fillStyle(0xd8a35e, 0.5);
    g.fillRect(LANE_L, PIT_Y, LANE_R - LANE_L, HEAD_PIN_Y + 30 - PIT_Y);
    // Faint spot marks. Kept small: at full pin radius they read as holes in
    // the deck once a pin is cleared away.
    g.fillStyle(0x0d0715, 0.1);
    for (const s of PIN_SPOTS) g.fillCircle(s.x, s.y + 8, 4);

    // Targeting arrows — aligned with the pin spots, centre arrow deepest
    for (let i = 0; i < 7; i++) {
      const x = LANE_CX + (i - 3) * (PIN_SPACING / 2);
      const y = 664 + Math.abs(i - 3) * 18;
      g.fillStyle(0x5d3a1d, 0.85);
      g.fillTriangle(x, y - 15, x - 9, y + 11, x + 9, y + 11);
    }
    // Approach dots
    g.fillStyle(0x5d3a1d, 0.7);
    for (let i = -2; i <= 2; i++) g.fillCircle(LANE_CX + i * PIN_SPACING, 782, 4);

    // Foul line
    g.fillStyle(CANDY, 0.9);
    g.fillRect(LANE_L - GUTTER_W, FOUL_Y, LANE_R - LANE_L + GUTTER_W * 2, 5);

    // Approach floor
    g.fillStyle(0x2a1838, 1);
    g.fillRect(0, FOUL_Y + 5, 600, 1000 - FOUL_Y);
    g.lineStyle(2, 0x1a0f28, 0.8);
    for (let x = 60; x < 600; x += 120) g.lineBetween(x, FOUL_Y + 5, x, 1000);

    // Pit backdrop + masking unit glow
    const glow = this.add.ellipse(LANE_CX, PIT_Y + 30, 320, 120, GOLD, 0.06).setDepth(1);
    this.tweens.add({ targets: glow, alpha: 0.12, duration: 2400, yoyo: true, repeat: -1 });

    this.add
      .text(LANE_CX, 962, 'TOUCH TO STAND · SWIPE UP TO BOWL', {
        fontSize: '15px',
        fontFamily: 'Arial',
        color: '#c9a97e',
        fontStyle: 'bold',
      })
      .setOrigin(0.5)
      .setDepth(3);
  }

  // ── Scoresheet ──────────────────────────────────────────────────────────────

  private buildScoresheet() {
    this.frameText = this.add
      .text(28, 34, 'FRAME 1 / 5', { fontSize: '17px', fontFamily: 'Arial', color: '#2bd9c8', fontStyle: 'bold' })
      .setOrigin(0, 0.5)
      .setDepth(30);
    this.ballText = this.add
      .text(572, 34, 'BALL 1', { fontSize: '17px', fontFamily: 'Arial', color: '#ffc64d', fontStyle: 'bold' })
      .setOrigin(1, 0.5)
      .setDepth(30);

    const g = this.add.graphics().setDepth(29);
    this.sheetHighlight = this.add.graphics().setDepth(28);

    const top = 58;
    const h = 66;
    let x = 26;
    for (let f = 0; f < FRAMES; f++) {
      const isLast = f === FRAMES - 1;
      const w = isLast ? 122 : 106;
      const subs = isLast ? 3 : 2;
      const subW = w / subs;

      g.lineStyle(2, GOLD, 0.55);
      g.strokeRect(x, top, w, h);
      g.lineStyle(1, GOLD, 0.35);
      g.lineBetween(x, top + 26, x + w, top + 26);
      for (let s = 1; s < subs; s++) g.lineBetween(x + s * subW, top, x + s * subW, top + 26);

      const balls: Phaser.GameObjects.Text[] = [];
      for (let s = 0; s < subs; s++) {
        balls.push(
          this.add
            .text(x + s * subW + subW / 2, top + 13, '', {
              fontSize: '16px',
              fontFamily: 'Arial',
              color: '#fff4e0',
              fontStyle: 'bold',
            })
            .setOrigin(0.5)
            .setDepth(30),
        );
      }
      const total = this.add
        .text(x + w / 2, top + 46, '', {
          fontSize: '19px',
          fontFamily: 'Georgia, serif',
          color: '#ffe08a',
          fontStyle: 'bold',
        })
        .setOrigin(0.5)
        .setDepth(30);

      this.sheetCells.push({ balls, total });
      x += w;
    }
  }

  /** Highlight box around the frame being bowled. */
  private markCurrentFrame() {
    this.sheetHighlight.clear();
    if (this.over) return;
    let x = 26;
    for (let f = 0; f < this.frame - 1; f++) x += f === FRAMES - 1 ? 122 : 106;
    const w = this.frame === FRAMES ? 122 : 106;
    this.sheetHighlight.fillStyle(TEAL, 0.12);
    this.sheetHighlight.fillRect(x, 58, w, 66);
  }

  // ── Scoring ─────────────────────────────────────────────────────────────────
  // Rules live in ./bowling-scoring — pure, Phaser-free and unit tested.

  private refreshChrome() {
    const rows = breakdown(this.rolls);
    rows.forEach((row, f) => {
      const cell = this.sheetCells[f];
      cell.balls.forEach((t, s) => {
        const sym = row.symbols[s] ?? '';
        t.setText(sym);
        t.setColor(sym === 'X' ? '#ffc64d' : sym === '/' ? '#2bd9c8' : '#fff4e0');
      });
      cell.total.setText(row.cumulative === null ? '' : String(row.cumulative));
    });

    this.frameText.setText(`FRAME ${Math.min(this.frame, FRAMES)} / ${FRAMES}`);
    this.ballText.setText(this.over ? 'FINAL' : `BALL ${this.ballInFrame}`);
    this.markCurrentFrame();
  }

  // ── Pins ────────────────────────────────────────────────────────────────────

  /** Billboard pin: classic silhouette drawn upright on a top-down deck. */
  private makePin(x: number, y: number): Pin {
    const c = this.add.container(x, y).setDepth(10);
    const g = this.add.graphics();

    // Shadow on the deck
    g.fillStyle(0x0d0715, 0.28);
    g.fillEllipse(0, 10, 26, 9);

    // Body: base → waist → neck → head
    g.fillStyle(CREAM, 1);
    g.fillEllipse(0, 6, 22, 14);
    g.fillRoundedRect(-11, -6, 22, 14, 5);
    g.fillRoundedRect(-6, -18, 12, 14, 5);
    g.fillCircle(0, -20, 7);

    // Neck rings
    g.fillStyle(CANDY, 0.95);
    g.fillRect(-6.5, -14, 13, 3);
    g.fillRect(-7.5, -9, 15, 3);

    // Highlight
    g.fillStyle(0xffffff, 0.5);
    g.fillRoundedRect(-7, -17, 3, 20, 1.5);

    // The silhouette above is drawn against a 13px radius; keep it locked to
    // whatever PIN_R the regulation scaling works out to.
    g.setScale(PIN_R / 13);

    c.add(g);
    c.setSize(PIN_R * 2, PIN_R * 2);

    this.physics.add.existing(c);
    const body = c.body as Phaser.Physics.Arcade.Body;
    // No offset: Phaser already centres a Container's body on its origin, so
    // passing -r,-r (as is idiomatic for Sprites) shifts it a full radius
    // up-left and the collision stops matching what you can see.
    body.setCircle(PIN_R);
    body.setDrag(460); // deck friction — a struck pin slides, then settles
    body.setAngularDrag(300);

    c.setData('spotX', x);
    c.setData('spotY', y);
    c.setData('down', false);
    return c;
  }

  // ── Contact resolution ──────────────────────────────────────────────────────
  // Arcade's built-in circle separation is unusable for this: it does not
  // conserve momentum and it stops a fast mover dead on a stationary target.
  // Both contacts below are registered as overlaps and resolved by hand —
  // positional correction first, then an impulse along the contact normal.

  /** Pin against pin: equal masses, so an impulse exchange along the normal. */
  private resolvePinPin(a: Pin, b: Pin) {
    const ba = a.body as Phaser.Physics.Arcade.Body;
    const bb = b.body as Phaser.Physics.Arcade.Body;
    if (!ba.enable || !bb.enable) return;

    let nx = b.x - a.x;
    let ny = b.y - a.y;
    let d = Math.hypot(nx, ny);
    if (d === 0) {
      nx = 1;
      ny = 0;
      d = 1;
    }
    nx /= d;
    ny /= d;

    const overlap = PIN_R * 2 - d;
    if (overlap > 0) {
      a.x -= (nx * overlap) / 2;
      a.y -= (ny * overlap) / 2;
      b.x += (nx * overlap) / 2;
      b.y += (ny * overlap) / 2;
    }

    const closing = (ba.velocity.x - bb.velocity.x) * nx + (ba.velocity.y - bb.velocity.y) * ny;
    if (closing <= 0) return; // already separating

    const j = ((1 + PIN_RESTITUTION) * closing) / 2;
    ba.velocity.x -= j * nx;
    ba.velocity.y -= j * ny;
    bb.velocity.x += j * nx;
    bb.velocity.y += j * ny;
    ba.setAngularVelocity(ba.angularVelocity + Phaser.Math.Between(-160, 160));
    bb.setAngularVelocity(bb.angularVelocity + Phaser.Math.Between(-160, 160));
  }

  /**
   * Ball against pin: the ball outweighs a pin roughly 7:1, so it ploughs
   * on almost undisturbed while the pin takes the energy. Only the pin is
   * moved out of the overlap — shoving the ball off its line would make
   * aiming meaningless.
   */
  private resolveBallPin(pin: Pin) {
    const pb = pin.body as Phaser.Physics.Arcade.Body;
    if (!pb.enable || !this.ballBody.enable) return;

    let nx = pin.x - this.ball.x;
    let ny = pin.y - this.ball.y;
    let d = Math.hypot(nx, ny);
    if (d === 0) {
      nx = 0;
      ny = -1;
      d = 1;
    }
    nx /= d;
    ny /= d;

    const overlap = BALL_R + PIN_R - d;
    if (overlap > 0) {
      pin.x += nx * overlap;
      pin.y += ny * overlap;
    }

    const closing = this.ballBody.velocity.x * nx + this.ballBody.velocity.y * ny;
    if (closing <= 0) return;

    // Normal kick plus a little of the ball's own heading, so pins carry
    // down-lane rather than only squirting sideways.
    let vx = pb.velocity.x + nx * closing * BALL_PIN_KICK + this.ballBody.velocity.x * 0.14;
    let vy = pb.velocity.y + ny * closing * BALL_PIN_KICK + this.ballBody.velocity.y * 0.14;
    const sp = Math.hypot(vx, vy);
    if (sp > PIN_MAX_SPEED) {
      vx = (vx / sp) * PIN_MAX_SPEED;
      vy = (vy / sp) * PIN_MAX_SPEED;
    }
    pb.velocity.x = vx;
    pb.velocity.y = vy;
    pb.setAngularVelocity(Phaser.Math.Between(-460, 460));

    // Newton's third law, scaled down by the mass difference. Small as it is,
    // this is what separates a pocket hit from a flush centre hit: the ball
    // angles off the head pin and drives into the rack instead of boring
    // straight through it.
    this.ballBody.velocity.x -= nx * closing * BALL_DEFLECT;
    this.ballBody.velocity.y -= ny * closing * BALL_DEFLECT;
    this.ballBody.velocity.x *= 0.985;
    this.ballBody.velocity.y *= 0.985;
    this.pinHitFx(pin.x, pin.y);
  }

  /** Every pin still standing (and therefore still scoreable). */
  private standing(): Pin[] {
    return this.pins.filter((p) => !p.getData('down'));
  }

  /** Full rack of ten, popped in with a stagger. */
  private rackFresh() {
    for (const p of this.pins) p.destroy();
    this.pins = [];

    PIN_SPOTS.forEach((s, i) => {
      const pin = this.makePin(s.x, s.y);
      pin.setScale(0);
      this.tweens.add({
        targets: pin,
        scale: 1,
        duration: 220,
        delay: i * 40,
        ease: 'Back.easeOut',
      });
      this.pins.push(pin);
    });

    this.physics.add.overlap(this.pins, this.pins, (a, b) => this.resolvePinPin(a as Pin, b as Pin));
  }

  /** Between balls in a frame: clear the fallen, tidy the survivors back onto their spots. */
  private sweepFallen(after: () => void) {
    const fallen = this.pins.filter((p) => p.getData('down'));
    for (const p of fallen) {
      this.tweens.add({
        targets: p,
        y: p.y - 40,
        alpha: 0,
        scale: 0.6,
        duration: 260,
        ease: 'Quad.easeIn',
        onComplete: () => p.destroy(),
      });
    }
    this.pins = this.standing();

    for (const p of this.pins) {
      const body = p.body as Phaser.Physics.Arcade.Body;
      body.stop();
      this.tweens.add({
        targets: p,
        x: p.getData('spotX'),
        y: p.getData('spotY'),
        angle: 0,
        duration: 240,
        ease: 'Quad.easeOut',
      });
    }

    this.time.delayedCall(340, after);
  }

  /** The rake bar sweeping the deck before a fresh rack. */
  private rakeSweep(after: () => void) {
    const rake = this.add
      .rectangle(LANE_CX, PIT_Y + 20, LANE_R - LANE_L, 16, 0x6d1522)
      .setStrokeStyle(2, GOLD, 0.6)
      .setDepth(18);
    for (const p of this.pins) {
      this.tweens.add({
        targets: p,
        y: p.y - 60,
        alpha: 0,
        duration: 300,
        delay: 120,
        ease: 'Quad.easeIn',
      });
    }
    this.tweens.add({
      targets: rake,
      y: HEAD_PIN_Y + 30,
      duration: 260,
      yoyo: true,
      hold: 60,
      ease: 'Quad.easeInOut',
      onComplete: () => {
        rake.destroy();
        after();
      },
    });
  }

  // ── Ball ────────────────────────────────────────────────────────────────────

  private newBall() {
    if (this.ball) this.ball.destroy();

    this.ball = this.add.container(LANE_CX, BALL_HOME_Y).setDepth(14);
    this.ballArt = this.add.container(0, 0);
    const g = this.add.graphics();
    g.fillStyle(0x3a2158, 1);
    g.fillCircle(0, 0, BALL_R);
    g.fillStyle(0x4e2d73, 1);
    g.fillCircle(-BALL_R * 0.22, -BALL_R * 0.22, BALL_R * 0.72);
    g.fillStyle(0xffffff, 0.28);
    g.fillEllipse(-BALL_R * 0.34, -BALL_R * 0.38, BALL_R * 0.5, BALL_R * 0.34);
    g.fillStyle(0x120818, 0.85);
    g.fillCircle(-6, 4, 3.6);
    g.fillCircle(6, 4, 3.6);
    g.fillCircle(0, 12, 3.6);
    g.lineStyle(2, GOLD, 0.35);
    g.strokeCircle(0, 0, BALL_R);
    this.ballArt.add(g);
    this.ball.add(this.ballArt);

    this.ball.setSize(BALL_R * 2, BALL_R * 2);
    this.physics.add.existing(this.ball);
    this.ballBody = this.ball.body as Phaser.Physics.Arcade.Body;
    this.ballBody.setCircle(BALL_R);
    this.ballBody.setBounce(0.12);
    this.ballBody.setDrag(38); // lane friction — a slow ball carries less
    this.ballBody.setMass(14); // heavy enough to plough straight through

    this.rolling = false;
    this.inGutter = false;
    this.settleFrames = 0;

    this.ball.setScale(0);
    this.tweens.add({ targets: this.ball, scale: 1, duration: 200, ease: 'Back.easeOut' });

    // Overlap, not collide: Arcade's own circle separation is not a real
    // elastic collision — against a stationary target it zeroes the mover's
    // velocity whatever the masses say, which stopped the ball dead on the
    // head pin. A gutter ball must not touch pins, hence the process callback.
    this.physics.add.overlap(
      this.ball,
      this.pins,
      (_b, pinObj) => this.resolveBallPin(pinObj as Pin),
      () => !this.inGutter,
    );
  }

  /** Short sighting line — shows your line and speed, not the impact point. */
  private drawAim(p: Phaser.Input.Pointer) {
    const shot = this.shotFrom(p);
    this.aimGfx.clear();
    if (!shot) return;

    const { dir, power } = shot;
    const color = power > 0.8 ? CANDY : power > 0.45 ? GOLD : TEAL;

    // Pull tether
    this.aimGfx.lineStyle(2, CREAM, 0.18);
    this.aimGfx.lineBetween(this.ball.x, this.ball.y, p.worldX, p.worldY);

    // Sighting dots, deliberately stopping short of the arrows
    const reach = 120 + power * 190;
    for (let i = 1; i <= 12; i++) {
      const t = i / 12;
      const x = this.ball.x + dir.x * reach * t;
      const y = this.ball.y + dir.y * reach * t;
      this.aimGfx.fillStyle(color, (1 - t) * 0.9);
      this.aimGfx.fillCircle(x, y, 5 - t * 2.4);
    }

    // Power bar along the foul line
    this.aimGfx.fillStyle(0x0d0715, 0.55);
    this.aimGfx.fillRect(LANE_L, FOUL_Y + 22, LANE_R - LANE_L, 10);
    this.aimGfx.fillStyle(color, 0.95);
    this.aimGfx.fillRect(LANE_L, FOUL_Y + 22, (LANE_R - LANE_L) * power, 10);
  }

  /**
   * Reads a swipe into a shot. Returns null for anything that isn't a
   * deliberate upward swipe, so stray taps never burn a ball.
   */
  private shotFrom(p: Phaser.Input.Pointer): { dir: Phaser.Math.Vector2; power: number } | null {
    const dx = p.worldX - this.dragStart.x;
    const dy = p.worldY - this.dragStart.y;
    if (dy > -50) return null; // not an upward swipe
    const len = Math.hypot(dx, dy);
    if (len < 60) return null;

    // Clamp the line to ±40° of straight — wilder than that is a guaranteed
    // gutter and just feels like the game ignored you.
    let angle = Math.atan2(dy, dx); // dy is negative → angle near -90°
    const straight = -Math.PI / 2;
    const maxOff = Phaser.Math.DegToRad(40);
    angle = Phaser.Math.Clamp(angle, straight - maxOff, straight + maxOff);

    const power = Phaser.Math.Clamp((len - 60) / 380, 0.08, 1);
    return { dir: new Phaser.Math.Vector2(Math.cos(angle), Math.sin(angle)), power };
  }

  private throwBall(p: Phaser.Input.Pointer) {
    if (!this.canBowl()) return;
    const shot = this.shotFrom(p);
    if (!shot) return;

    const speed = 400 + shot.power * 440;
    this.ballBody.setVelocity(shot.dir.x * speed, shot.dir.y * speed);

    this.rolling = true;
    this.resolved = false;
    this.settleFrames = 0;

    // Hard cap so a wedged ball can never stall the frame.
    this.maxRollTimer = this.time.delayedCall(6000, () => this.resolveRoll());
  }

  // ── Juice ───────────────────────────────────────────────────────────────────

  private pinHitFx(x: number, y: number) {
    this.cameras.main.shake(90, 0.005);
    for (let i = 0; i < 7; i++) {
      const spark = this.add.circle(x, y, Phaser.Math.Between(2, 4), CREAM).setDepth(24);
      const a = Math.random() * Math.PI * 2;
      const d = Phaser.Math.Between(20, 60);
      this.tweens.add({
        targets: spark,
        x: x + Math.cos(a) * d,
        y: y + Math.sin(a) * d,
        alpha: 0,
        scale: 0.3,
        duration: Phaser.Math.Between(220, 420),
        ease: 'Quad.easeOut',
        onComplete: () => spark.destroy(),
      });
    }
  }

  private banner(text: string, color: string, big = false) {
    const t = this.add
      .text(LANE_CX, 560, text, {
        fontSize: big ? '54px' : '38px',
        fontFamily: 'Georgia, serif',
        color,
        fontStyle: 'bold',
      })
      .setOrigin(0.5)
      .setDepth(35)
      .setScale(0.3);
    if (big) this.cameras.main.flash(160, 255, 198, 77);
    this.tweens.add({
      targets: t,
      scale: 1,
      duration: 240,
      ease: 'Back.easeOut',
      onComplete: () =>
        this.tweens.add({ targets: t, alpha: 0, delay: 620, duration: 300, onComplete: () => t.destroy() }),
    });
  }

  private floatText(x: number, y: number, text: string, color: string) {
    const t = this.add
      .text(x, y, text, { fontSize: '26px', fontFamily: 'Georgia, serif', color, fontStyle: 'bold' })
      .setOrigin(0.5)
      .setDepth(28);
    this.tweens.add({ targets: t, y: y - 60, alpha: 0, duration: 700, onComplete: () => t.destroy() });
  }

  // ── Roll resolution ─────────────────────────────────────────────────────────

  /** Called once per ball, after the deck has stopped moving. */
  private resolveRoll() {
    if (this.resolved || this.over) return;
    this.resolved = true;
    this.rolling = false;
    if (this.maxRollTimer) {
      this.maxRollTimer.remove();
      this.maxRollTimer = null;
    }

    // A pin is down once it's been shoved off its spot or into the pit.
    const before = this.standing();
    for (const pin of before) {
      const dx = pin.x - pin.getData('spotX');
      const dy = pin.y - pin.getData('spotY');
      if (Math.hypot(dx, dy) > KNOCKED_DIST || pin.y < PIT_Y + 20) {
        pin.setData('down', true);
        const body = pin.body as Phaser.Physics.Arcade.Body;
        body.stop();
        body.setEnable(false);
        this.tweens.add({
          targets: pin,
          angle: Phaser.Math.Between(-88, 88),
          alpha: 0.4,
          scale: 0.86,
          duration: 220,
          ease: 'Quad.easeOut',
        });
      }
    }

    const knocked = before.length - this.standing().length;
    const wasFullRack = before.length === 10;
    this.rolls.push(knocked);

    this.ball.setVisible(false);
    this.ballBody.setEnable(false);

    // Banners
    if (this.inGutter && knocked === 0) this.banner('GUTTER', '#8a7a63');
    else if (wasFullRack && knocked === 10) this.banner('STRIKE!', '#ffe08a', true);
    else if (!wasFullRack && this.standing().length === 0 && this.ballInFrame > 1)
      this.banner('SPARE!', '#9ff3ea');
    else if (knocked > 0) this.floatText(LANE_CX, 520, `+${knocked}`, '#fff4e0');

    this.game.events.emit('SCORE_UPDATE', total(this.rolls));
    this.refreshChrome();

    this.time.delayedCall(520, () => this.advance(knocked));
  }

  /** Frame/ball state machine — regulation rules, with frame 5 as the tenth. */
  private advance(knocked: number) {
    if (this.over) return;
    const isLast = this.frame === FRAMES;

    if (!isLast) {
      if (this.ballInFrame === 1 && knocked === 10) {
        this.nextFrame();
      } else if (this.ballInFrame === 1) {
        this.ballInFrame = 2;
        this.continueRoll(false);
      } else {
        this.nextFrame();
      }
      return;
    }

    // Final frame: up to three balls, fresh racks after a strike or spare.
    const r = this.rolls;
    if (this.ballInFrame === 1) {
      this.ballInFrame = 2;
      this.continueRoll(knocked === 10);
    } else if (this.ballInFrame === 2) {
      const first = r[r.length - 2];
      const earnedThird = first === 10 || first + knocked === 10;
      if (!earnedThird) {
        this.endGame();
        return;
      }
      this.ballInFrame = 3;
      // Fresh deck unless the second ball left pins standing after a strike.
      this.continueRoll(knocked === 10 || first + knocked === 10);
    } else {
      this.endGame();
    }
  }

  private nextFrame() {
    this.frame += 1;
    this.ballInFrame = 1;
    this.continueRoll(true);
  }

  /** Reset the deck for the next ball, then hand a new ball to the bowler. */
  private continueRoll(freshRack: boolean) {
    const handOff = () => {
      this.newBall();
      this.refreshChrome();
    };
    if (freshRack) {
      this.rakeSweep(() => {
        this.rackFresh();
        handOff();
      });
    } else {
      this.sweepFallen(handOff);
    }
  }

  private endGame() {
    this.over = true;
    this.refreshChrome();
    const final = total(this.rolls);
    if (final === PERFECT) this.banner('PERFECT!', '#ffe08a', true);
    this.time.delayedCall(700, () => this.game.events.emit('GAME_OVER', final));
  }

  // ── Loop ────────────────────────────────────────────────────────────────────

  update() {
    if (this.over || !this.rolling) return;

    const speed = this.ballBody.speed;

    // Roll the ball's face for a sense of motion
    if (speed > 5) this.ballArt.rotation += speed * 0.00006;

    // Gutter: once the ball is in the channel it rides it out, harmlessly.
    if (!this.inGutter) {
      if (this.ball.x < LANE_L + BALL_R || this.ball.x > LANE_R - BALL_R) {
        this.inGutter = true;
        const side = this.ball.x < LANE_CX ? LANE_L - GUTTER_W / 2 : LANE_R + GUTTER_W / 2;
        this.ballBody.setVelocity(0, Math.min(this.ballBody.velocity.y, -260));
        this.tweens.add({ targets: this.ball, x: side, duration: 180, ease: 'Quad.easeOut' });
      }
    } else {
      this.ballBody.velocity.x = 0;
    }

    // Pins swept into the pit are gone: park them so a pin still coasting
    // off-screen can't hold up the count.
    for (const pin of this.standing()) {
      if (pin.y < PIT_Y + 20 || pin.x < LANE_L - GUTTER_W || pin.x > LANE_R + GUTTER_W) {
        const pb = pin.body as Phaser.Physics.Arcade.Body;
        if (pb.enable) {
          pb.stop();
          pb.setEnable(false);
          this.tweens.add({ targets: pin, alpha: 0, scale: 0.5, duration: 220 });
        }
      }
    }

    // The ball is spent once it reaches the pit or grinds to a halt.
    const ballSpent = this.ball.y < PIT_Y + 10 || speed < 26;

    if (ballSpent) {
      const deckMoving = this.standing().some((p) => (p.body as Phaser.Physics.Arcade.Body).speed > 10);
      this.settleFrames = deckMoving ? 0 : this.settleFrames + 1;
      // ~0.4s of stillness before we count the deck
      if (this.settleFrames > 24) this.resolveRoll();
    }
  }
}

export const bowlingConfig: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
    width: 600,
    height: 1000,
  },
  physics: {
    default: 'arcade',
    // Top-down lane: gravity would pull the ball "down the screen", which
    // here means backward toward the bowler.
    arcade: { gravity: { x: 0, y: 0 }, debug: false },
  },
  scene: BowlingScene,
  backgroundColor: '#1A0C24',
  audio: { noAudio: true },
};
