import * as Phaser from 'phaser';

/**
 * Milk Bottle Smash — the classic booth throw, dressed for the night fair.
 * Drag back from the ball to aim (a dotted trajectory arc previews the
 * shot), release to hurl a spinning baseball at a pyramid of milk bottles.
 * A bottle scores once it tumbles off the stand. 3 balls per pyramid,
 * 3 pyramids per run; a first-ball clean sweep pays a STRIKE bonus.
 *
 * Straight-on booth view: the ball travels "into" the booth, so it passes
 * the stand plane (no ball↔stand collider) and smashes the bottles.
 */
export default class MilkBottleScene extends Phaser.Scene {
  private score = 0;
  private pyramid = 1;
  private ballsLeft = 3;
  private ballsUsedThisPyramid = 0;
  private over = false;

  private ball!: Phaser.GameObjects.Container;
  private ballBody!: Phaser.Physics.Arcade.Body;
  private ballThrown = false;
  private settleTimer: Phaser.Time.TimerEvent | null = null;

  private bottles: Phaser.GameObjects.Container[] = [];
  private stand!: Phaser.GameObjects.Rectangle;
  private aimGfx!: Phaser.GameObjects.Graphics;
  private dragging = false;

  private scoreText!: Phaser.GameObjects.Text;
  private pyramidText!: Phaser.GameObjects.Text;
  private ballPips: Phaser.GameObjects.Container[] = [];

  private readonly STAND_Y = 520;
  private readonly STAND_X = 300;
  private readonly BALL_HOME = { x: 300, y: 862 };
  private readonly THROW_POWER = 8;
  private readonly GRAVITY = 900;

  constructor() {
    super({ key: 'MilkBottleScene' });
  }

  create() {
    this.score = 0;
    this.pyramid = 1;
    this.ballsLeft = 3;
    this.ballsUsedThisPyramid = 0;
    this.over = false;
    this.bottles = [];
    this.ballPips = [];

    this.drawBooth();

    // Stand (static physics platform the bottles rest on)
    this.stand = this.add.rectangle(this.STAND_X, this.STAND_Y, 280, 20, 0x4a2c14).setStrokeStyle(0);
    this.physics.add.existing(this.stand, true);
    this.decorateStand();

    // UI
    this.scoreText = this.add
      .text(300, 56, '0', { fontSize: '54px', fontFamily: 'Georgia, serif', color: '#fff4e0', fontStyle: 'bold' })
      .setOrigin(0.5)
      .setDepth(30);
    this.pyramidText = this.add
      .text(570, 48, 'PYRAMID 1 / 3', { fontSize: '17px', fontFamily: 'Arial', color: '#2bd9c8', fontStyle: 'bold' })
      .setOrigin(1, 0.5)
      .setDepth(30);
    this.buildBallPips();

    this.aimGfx = this.add.graphics().setDepth(25);

    this.buildPyramid(true);
    this.newBall();

    // Drag-anywhere slingshot
    this.input.on('pointerdown', () => {
      if (!this.over && !this.ballThrown) this.dragging = true;
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

  // ── Booth dressing ──────────────────────────────────────────────────────────

  private drawBooth() {
    const g = this.add.graphics();

    // Back wall wash + shelf glow behind the pyramid
    g.fillGradientStyle(0x241333, 0x241333, 0x120818, 0x120818, 1);
    g.fillRect(60, 170, 480, 420);
    g.lineStyle(3, 0xd98e1f, 0.35);
    g.strokeRect(60, 170, 480, 420);
    const glow = this.add.ellipse(this.STAND_X, this.STAND_Y - 90, 340, 220, 0xffc64d, 0.07);
    glow.setDepth(1);

    // Side curtains
    g.fillStyle(0x8c1f2e, 1);
    g.fillRect(38, 170, 26, 420);
    g.fillRect(536, 170, 26, 420);
    g.fillStyle(0x6d1522, 1);
    for (let y = 190; y < 580; y += 46) {
      g.fillEllipse(51, y, 20, 12);
      g.fillEllipse(549, y, 20, 12);
    }

    // Striped awning with scalloped hem
    for (let i = 0; i < 10; i++) {
      g.fillStyle(i % 2 === 0 ? 0xff4d5e : 0xf4e8d8, 1);
      g.fillRect(38 + i * 52.4, 96, 52.4, 46);
    }
    for (let i = 0; i < 10; i++) {
      g.fillStyle(i % 2 === 0 ? 0xff4d5e : 0xf4e8d8, 1);
      g.beginPath();
      g.arc(38 + i * 52.4 + 26.2, 142, 26.2, 0, Math.PI, false);
      g.fillPath();
    }

    // Painted sign hanging under the awning
    const sign = this.add.container(300, 205).setDepth(3);
    const board = this.add.rectangle(0, 0, 300, 44, 0x3a2158).setStrokeStyle(3, 0xffc64d, 0.9);
    const label = this.add
      .text(0, 0, '🥛 MILK BOTTLE SMASH', { fontSize: '20px', fontFamily: 'Georgia, serif', color: '#ffe08a', fontStyle: 'bold' })
      .setOrigin(0.5);
    sign.add([board, label]);
    this.tweens.add({ targets: sign, angle: 1.4, duration: 2600, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });

    // String lights across the booth mouth
    const lights = this.add.graphics().setDepth(2);
    lights.lineStyle(2, 0x120818, 0.9);
    lights.beginPath();
    lights.moveTo(64, 168);
    for (let x = 64; x <= 536; x += 8) {
      lights.lineTo(x, 168 + Math.sin(((x - 64) / 472) * Math.PI) * 26);
    }
    lights.strokePath();
    const bulbColors = [0xffc64d, 0x2bd9c8, 0xff4d5e];
    for (let i = 0; i < 11; i++) {
      const x = 64 + i * 47.2;
      const y = 172 + Math.sin(((x - 64) / 472) * Math.PI) * 26;
      const bulb = this.add.circle(x, y + 6, 5, bulbColors[i % 3]).setDepth(2);
      this.tweens.add({
        targets: bulb,
        alpha: 0.35,
        duration: 700 + (i % 4) * 180,
        yoyo: true,
        repeat: -1,
        delay: i * 120,
      });
    }

    // Wooden counter at the player's end
    g.fillStyle(0x4a2c14, 1);
    g.fillRect(0, 906, 600, 94);
    g.fillStyle(0x5d3a1d, 1);
    g.fillRect(0, 906, 600, 12);
    g.lineStyle(2, 0x2c1a0b, 0.6);
    for (let x = 60; x < 600; x += 120) g.lineBetween(x, 918, x, 1000);

    this.add
      .text(300, 946, 'DRAG BACK & RELEASE TO THROW', { fontSize: '16px', fontFamily: 'Arial', color: '#c9a97e', fontStyle: 'bold' })
      .setOrigin(0.5)
      .setDepth(3);
  }

  private decorateStand() {
    const g = this.add.graphics().setDepth(2);
    // Wood grain top + skirted pedestal
    g.fillStyle(0x5d3a1d, 1);
    g.fillRect(this.STAND_X - 140, this.STAND_Y - 10, 280, 8);
    g.fillStyle(0x8c1f2e, 1);
    g.fillRect(this.STAND_X - 24, this.STAND_Y + 10, 48, 120);
    g.fillStyle(0x6d1522, 1);
    g.fillRect(this.STAND_X - 24, this.STAND_Y + 10, 48, 10);
  }

  private buildBallPips() {
    this.ballPips.forEach((p) => p.destroy());
    this.ballPips = [];
    for (let i = 0; i < 3; i++) {
      this.ballPips.push(this.makeBaseballIcon(34 + i * 34, 52, 12).setDepth(30));
    }
    this.updateBallPips();
  }

  private updateBallPips() {
    this.ballPips.forEach((p, i) => p.setAlpha(i < this.ballsLeft ? 1 : 0.22));
  }

  private makeBaseballIcon(x: number, y: number, r: number): Phaser.GameObjects.Container {
    const c = this.add.container(x, y);
    const body = this.add.circle(0, 0, r, 0xfff4e0).setStrokeStyle(2, 0xc9a97e);
    const seamL = this.add.arc(-r * 0.45, 0, r * 0.62, 300, 60, false).setStrokeStyle(2, 0xff4d5e).setClosePath(false);
    const seamR = this.add.arc(r * 0.45, 0, r * 0.62, 120, 240, false).setStrokeStyle(2, 0xff4d5e).setClosePath(false);
    c.add([body, seamL, seamR]);
    return c;
  }

  // ── Bottles ─────────────────────────────────────────────────────────────────

  /** A proper milk-bottle silhouette: body, shoulders, neck, cap, label band. */
  private makeBottle(x: number, y: number): Phaser.GameObjects.Container {
    const c = this.add.container(x, y).setDepth(5);
    const g = this.add.graphics();
    // Body (cream glass)
    g.fillStyle(0xf4e8d8, 1);
    g.fillRoundedRect(-16, -18, 32, 48, 6);
    // Shoulders + neck
    g.fillTriangle(-16, -18, 16, -18, 9, -32);
    g.fillTriangle(-16, -18, 9, -32, -9, -32);
    g.fillRoundedRect(-9, -44, 18, 14, 3);
    // Cap
    g.fillStyle(0xffc64d, 1);
    g.fillRoundedRect(-10, -48, 20, 7, 2);
    // Label band
    g.fillStyle(0x2bd9c8, 0.85);
    g.fillRect(-16, -2, 32, 12);
    // Glass highlight
    g.fillStyle(0xffffff, 0.45);
    g.fillRoundedRect(-11, -14, 5, 38, 2);
    // Outline
    g.lineStyle(2, 0x8a7a63, 0.8);
    g.strokeRoundedRect(-16, -18, 32, 48, 6);
    c.add(g);
    const label = this.add
      .text(0, 4, 'MILK', { fontSize: '9px', fontFamily: 'Arial', color: '#120818', fontStyle: 'bold' })
      .setOrigin(0.5);
    c.add(label);

    c.setSize(34, 92);
    this.physics.add.existing(c);
    const body = c.body as Phaser.Physics.Arcade.Body;
    body.setSize(34, 78);
    body.setOffset(-17, -46);
    body.setBounce(0.15);
    body.setDragX(60);
    // Frozen until the first throw — spawn settling must never topple the
    // pyramid on its own (bottles used to self-collapse for free points).
    body.setAllowGravity(false);
    body.setImmovable(true);
    c.setData('down', false);
    return c;
  }

  /** Let the pyramid react to physics once a ball is actually in the air. */
  private wakeBottles() {
    for (const bottle of this.bottles) {
      const body = bottle.body as Phaser.Physics.Arcade.Body;
      body.setAllowGravity(true);
      body.setImmovable(false);
    }
  }

  private buildPyramid(first = false) {
    for (const b of this.bottles) b.destroy();
    this.bottles = [];

    const rows = [3, 2, 1];
    const bw = 34;
    // Exact rest positions: stand top is STAND_Y-10; a bottle's body bottom
    // sits at container y+32, so the bottom row rests at STAND_Y-42 and each
    // row above is one 78px body-height up. No spawn-settling drop.
    const rowH = 78;
    rows.forEach((count, row) => {
      const y = this.STAND_Y - 42 - row * rowH;
      const startX = this.STAND_X - ((count - 1) * (bw + 12)) / 2;
      for (let i = 0; i < count; i++) {
        const bottle = this.makeBottle(startX + i * (bw + 12), y);
        // Pop-in: scale up with a bounce, staggered per bottle
        bottle.setScale(0);
        this.tweens.add({
          targets: bottle,
          scale: 1,
          duration: 260,
          delay: (first ? 200 : 80) + (row * 3 + i) * 70,
          ease: 'Back.easeOut',
        });
        this.bottles.push(bottle);
      }
    });

    this.physics.add.collider(this.bottles, this.stand);
    this.physics.add.collider(this.bottles, this.bottles);
  }

  // ── Ball ────────────────────────────────────────────────────────────────────

  private newBall() {
    if (this.ball) this.ball.destroy();
    this.ball = this.makeBaseballIcon(this.BALL_HOME.x, this.BALL_HOME.y, 17).setDepth(20);
    this.physics.add.existing(this.ball);
    this.ballBody = this.ball.body as Phaser.Physics.Arcade.Body;
    this.ballBody.setCircle(17, -17, -17);
    this.ballBody.setAllowGravity(false);
    this.ballThrown = false;

    // Arrive-on-counter bounce
    this.ball.setScale(0);
    this.tweens.add({ targets: this.ball, scale: 1, duration: 220, ease: 'Back.easeOut' });

    this.physics.add.collider(this.ball, this.bottles, (_ball, bottleObj) => {
      const bottle = bottleObj as Phaser.GameObjects.Container;
      const body = bottle.body as Phaser.Physics.Arcade.Body;
      // Carry real impact through: share the ball's momentum + tumble
      body.velocity.x += this.ballBody.velocity.x * 0.6;
      body.velocity.y += this.ballBody.velocity.y * 0.45;
      body.setAngularVelocity(Phaser.Math.Between(-260, 260));
      this.impactFx(bottle.x, bottle.y);
    });
  }

  /** Dotted projectile-arc preview of the shot. */
  private drawAim(p: Phaser.Input.Pointer) {
    const vx = (this.ball.x - p.worldX) * this.THROW_POWER;
    const vy = (this.ball.y - p.worldY) * this.THROW_POWER;
    const power = Math.min(Math.hypot(vx, vy) / 1400, 1);

    this.aimGfx.clear();
    // Pull-back tether
    this.aimGfx.lineStyle(2, 0xfff4e0, 0.25);
    this.aimGfx.lineBetween(this.ball.x, this.ball.y, p.worldX, p.worldY);
    // Trajectory dots (projectile motion under arcade gravity)
    const steps = 14;
    for (let i = 1; i <= steps; i++) {
      const t = i * 0.055;
      const x = this.ball.x + vx * t;
      const y = this.ball.y + vy * t + 0.5 * this.GRAVITY * t * t;
      if (y > 1000 || x < 0 || x > 600) break;
      const fade = 1 - i / (steps + 2);
      const color = power > 0.75 ? 0xff4d5e : power > 0.4 ? 0xffc64d : 0x2bd9c8;
      this.aimGfx.fillStyle(color, fade * 0.9);
      this.aimGfx.fillCircle(x, y, 5 - i * 0.22);
    }
    // Squash the ball back like a wind-up
    this.ball.setScale(1 + power * 0.15, 1 - power * 0.1);
  }

  private throwBall(p: Phaser.Input.Pointer) {
    // The ball sits ~140px above the canvas bottom, so the drag distance is
    // short — a high multiplier makes a full pull reach the pyramid.
    const vx = (this.ball.x - p.worldX) * this.THROW_POWER;
    const vy = (this.ball.y - p.worldY) * this.THROW_POWER;
    this.ball.setScale(1);
    if (Math.abs(vx) < 120 && Math.abs(vy) < 120) return; // too soft — not a throw

    this.ballThrown = true;
    this.ballsLeft -= 1;
    this.ballsUsedThisPyramid += 1;
    this.updateBallPips();
    this.wakeBottles();
    this.ballBody.setAllowGravity(true);
    this.ballBody.setVelocity(vx, vy);
    this.ballBody.setAngularVelocity(vx > 0 ? 620 : -620); // visible spin

    this.settleTimer = this.time.delayedCall(2200, () => this.resolveThrow());
  }

  // ── Juice ───────────────────────────────────────────────────────────────────

  /** Milk splash: white droplets burst from the impact point. */
  private impactFx(x: number, y: number) {
    this.cameras.main.shake(110, 0.006);
    for (let i = 0; i < 10; i++) {
      const drop = this.add.circle(x, y, Phaser.Math.Between(2, 5), 0xfff4e0).setDepth(24);
      const a = Math.random() * Math.PI * 2;
      const d = Phaser.Math.Between(30, 90);
      this.tweens.add({
        targets: drop,
        x: x + Math.cos(a) * d,
        y: y + Math.sin(a) * d - 30,
        alpha: 0,
        scale: 0.3,
        duration: Phaser.Math.Between(300, 550),
        ease: 'Quad.easeOut',
        onComplete: () => drop.destroy(),
      });
    }
  }

  private floatText(x: number, y: number, text: string, color: string) {
    const t = this.add
      .text(x, y, text, { fontSize: '26px', fontFamily: 'Georgia, serif', color, fontStyle: 'bold' })
      .setOrigin(0.5)
      .setDepth(28);
    this.tweens.add({ targets: t, y: y - 60, alpha: 0, duration: 700, onComplete: () => t.destroy() });
  }

  private strikeBanner() {
    const t = this.add
      .text(300, 380, '⭐ STRIKE! +60 ⭐', { fontSize: '48px', fontFamily: 'Georgia, serif', color: '#ffe08a', fontStyle: 'bold' })
      .setOrigin(0.5)
      .setDepth(35)
      .setScale(0.3);
    this.cameras.main.flash(150, 255, 198, 77);
    this.tweens.add({
      targets: t,
      scale: 1,
      duration: 250,
      ease: 'Back.easeOut',
      onComplete: () =>
        this.tweens.add({ targets: t, alpha: 0, delay: 650, duration: 300, onComplete: () => t.destroy() }),
    });
  }

  // ── Round flow ──────────────────────────────────────────────────────────────

  private resolveThrow() {
    if (this.over) return;

    const allDown = this.bottles.every((b) => b.getData('down'));
    if (allDown && this.ballsUsedThisPyramid === 1) {
      this.score += 60;
      this.scoreText.setText(String(this.score));
      this.game.events.emit('SCORE_UPDATE', this.score);
      this.strikeBanner();
    }

    if (allDown || this.ballsLeft <= 0) {
      this.nextPyramid();
    } else {
      this.newBall();
    }
  }

  private nextPyramid() {
    if (this.pyramid >= 3) {
      this.over = true;
      this.time.delayedCall(600, () => this.game.events.emit('GAME_OVER', this.score));
      return;
    }
    this.pyramid += 1;
    this.ballsLeft = 3;
    this.ballsUsedThisPyramid = 0;
    this.pyramidText.setText(`PYRAMID ${this.pyramid} / 3`);
    this.updateBallPips();
    this.floatText(300, 320, `PYRAMID ${this.pyramid}!`, '#9ff3ea');
    this.buildPyramid();
    this.newBall();
  }

  update() {
    if (this.over) return;

    // A bottle scores once it tumbles off the stand
    for (const bottle of this.bottles) {
      if (bottle.getData('down')) continue;
      const offStand =
        bottle.y > this.STAND_Y + 40 ||
        bottle.x < this.STAND_X - 170 ||
        bottle.x > this.STAND_X + 170;
      if (offStand) {
        bottle.setData('down', true);
        this.score += 20;
        this.scoreText.setText(String(this.score));
        this.game.events.emit('SCORE_UPDATE', this.score);
        this.floatText(bottle.x, bottle.y - 40, '+20', '#9ff3ea');
        this.tweens.add({ targets: bottle, alpha: 0.2, duration: 500 });
      }
    }

    // Ball left the world → resolve early
    if (
      this.ballThrown &&
      (this.ball.y > 1050 || this.ball.x < -60 || this.ball.x > 660 || this.ball.y < -300)
    ) {
      if (this.settleTimer) {
        this.settleTimer.remove();
        this.settleTimer = null;
        // Small grace so struck bottles finish falling
        this.time.delayedCall(700, () => this.resolveThrow());
      }
      this.ballThrown = false;
      this.ballBody.setEnable(false);
      this.ball.setVisible(false);
    }
  }
}

export const milkBottleConfig: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
    width: 600,
    height: 1000,
  },
  physics: {
    default: 'arcade',
    arcade: {
      gravity: { x: 0, y: 900 },
      debug: false,
    },
  },
  scene: MilkBottleScene,
  backgroundColor: '#1A0C24',
  audio: { noAudio: true },
};
