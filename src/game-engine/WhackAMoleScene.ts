import * as Phaser from 'phaser';

interface HoleSlot {
  x: number;
  y: number;
  occupant: Phaser.GameObjects.Container | null;
}

/**
 * Whack-a-Mole — critters pop from a 3×3 grid of holes, faster and in
 * bigger waves as time passes. Tap them for points (streak bonus);
 * dynamite decoys cost a life if tapped. 3 lives, 60-second round.
 * Decoys never spawn in the opening seconds and always linger at least
 * as long as critters, so mistakes are reads, not RNG.
 */
export default class WhackAMoleScene extends Phaser.Scene {
  private score = 0;
  private streak = 0;
  private lives = 3;
  private elapsed = 0;
  private spawnTimer = 0;
  private over = false;

  private holes: HoleSlot[] = [];
  private scoreText!: Phaser.GameObjects.Text;
  private livesText!: Phaser.GameObjects.Text;
  private timeText!: Phaser.GameObjects.Text;
  private streakText!: Phaser.GameObjects.Text;

  private readonly ROUND_MS = 60_000;

  constructor() {
    super({ key: 'WhackAMoleScene' });
  }

  create() {
    const { width } = this.scale;
    this.score = 0;
    this.streak = 0;
    this.lives = 3;
    this.elapsed = 0;
    this.spawnTimer = 600;
    this.over = false;
    this.holes = [];

    // Fairground lawn
    this.add.rectangle(width / 2, 620, width, 760, 0x241333);

    // 3×3 holes
    const startX = 140;
    const startY = 360;
    const gap = 160;
    for (let r = 0; r < 3; r++) {
      for (let c = 0; c < 3; c++) {
        const x = startX + c * gap;
        const y = startY + r * gap;
        this.add.ellipse(x, y + 26, 118, 48, 0x120818).setStrokeStyle(3, 0xffc64d, 0.35);
        this.holes.push({ x, y, occupant: null });
      }
    }

    // UI
    this.scoreText = this.add
      .text(width / 2, 60, '0', { fontSize: '56px', fontFamily: 'Arial', color: '#fff4e0', fontStyle: 'bold' })
      .setOrigin(0.5);
    this.livesText = this.add
      .text(30, 50, '❤️❤️❤️', { fontSize: '24px' })
      .setOrigin(0, 0.5);
    this.timeText = this.add
      .text(width - 30, 50, '60', { fontSize: '26px', fontFamily: 'Arial', color: '#2bd9c8', fontStyle: 'bold' })
      .setOrigin(1, 0.5);
    this.streakText = this.add
      .text(width / 2, 110, '', { fontSize: '20px', fontFamily: 'Arial', color: '#ff9aa4', fontStyle: 'bold' })
      .setOrigin(0.5);

    // Whiffed taps (background) break the streak.
    this.add
      .rectangle(width / 2, 500, width, 1000, 0x000000, 0.001)
      .setInteractive()
      .on('pointerdown', () => {
        this.streak = 0;
        this.streakText.setText('');
      });
  }

  /** Current mole up-time: 900ms shrinking to 450ms across the round. */
  private upTime(): number {
    return 900 - 450 * Math.min(this.elapsed / this.ROUND_MS, 1);
  }

  private spawn() {
    const empty = this.holes.filter((h) => !h.occupant);
    if (empty.length === 0) return;
    const hole = Phaser.Utils.Array.GetRandom(empty);

    // No decoys in the first 6 seconds; ratio rises to ~30% late-round.
    const decoyChance = this.elapsed < 6000 ? 0 : 0.1 + 0.2 * (this.elapsed / this.ROUND_MS);
    const isDecoy = Math.random() < decoyChance;

    const c = this.add.container(hole.x, hole.y + 40);
    if (isDecoy) {
      const stick = this.add.rectangle(0, 0, 34, 56, 0xc92a3d).setStrokeStyle(2, 0xff6b5e);
      const fuse = this.add.rectangle(0, -34, 4, 14, 0xffe08a);
      const label = this.add.text(0, 0, 'TNT', { fontSize: '13px', fontFamily: 'Arial', color: '#fff4e0', fontStyle: 'bold' }).setOrigin(0.5);
      c.add([stick, fuse, label]);
    } else {
      const body = this.add.circle(0, 0, 32, 0xd98e1f).setStrokeStyle(3, 0xffe08a);
      const eyeL = this.add.circle(-11, -8, 5, 0x120818);
      const eyeR = this.add.circle(11, -8, 5, 0x120818);
      const nose = this.add.circle(0, 4, 6, 0xff4d5e);
      c.add([body, eyeL, eyeR, nose]);
    }
    c.setSize(70, 70);
    c.setInteractive();
    c.setData('decoy', isDecoy);
    c.setScale(0);
    hole.occupant = c;

    this.tweens.add({ targets: c, scale: 1, y: hole.y, duration: 120, ease: 'Back.easeOut' });

    // Decoys linger ≥ critter up-time (fair reads).
    const lifetime = isDecoy ? this.upTime() * 1.4 : this.upTime();
    const hideTimer = this.time.delayedCall(lifetime, () => this.despawn(hole, false));
    c.setData('hideTimer', hideTimer);

    c.on('pointerdown', (_p: Phaser.Input.Pointer, _x: number, _y: number, ev: Phaser.Types.Input.EventData) => {
      ev.stopPropagation();
      if (this.over) return;
      hideTimer.remove();
      if (c.getData('decoy')) {
        this.loseLife(hole);
      } else {
        this.whack(hole);
      }
    });
  }

  private whack(hole: HoleSlot) {
    this.streak += 1;
    const bonus = Math.min(this.streak, 10) * 2;
    const gained = 10 + bonus;
    this.score += gained;
    this.scoreText.setText(String(this.score));
    this.streakText.setText(this.streak > 1 ? `STREAK ×${this.streak}` : '');
    this.game.events.emit('SCORE_UPDATE', this.score);
    this.floatText(hole.x, hole.y - 40, `+${gained}`, '#2bd9c8');
    this.despawn(hole, true);
  }

  private loseLife(hole: HoleSlot) {
    this.lives -= 1;
    this.streak = 0;
    this.streakText.setText('');
    this.livesText.setText('❤️'.repeat(Math.max(this.lives, 0)));
    this.cameras.main.shake(180, 0.012);
    this.cameras.main.flash(120, 255, 77, 94);
    this.floatText(hole.x, hole.y - 40, 'BOOM!', '#ff6b5e');
    this.despawn(hole, true);
    if (this.lives <= 0) this.endRound();
  }

  private despawn(hole: HoleSlot, fast: boolean) {
    const c = hole.occupant;
    if (!c) return;
    hole.occupant = null;
    c.disableInteractive();
    this.tweens.add({
      targets: c,
      scale: 0,
      y: hole.y + 40,
      duration: fast ? 90 : 150,
      onComplete: () => c.destroy(),
    });
  }

  private floatText(x: number, y: number, text: string, color: string) {
    const t = this.add
      .text(x, y, text, { fontSize: '26px', fontFamily: 'Arial', color, fontStyle: 'bold' })
      .setOrigin(0.5);
    this.tweens.add({ targets: t, y: y - 60, alpha: 0, duration: 700, onComplete: () => t.destroy() });
  }

  private endRound() {
    if (this.over) return;
    this.over = true;
    for (const hole of this.holes) this.despawn(hole, true);
    this.time.delayedCall(500, () => this.game.events.emit('GAME_OVER', this.score));
  }

  update(_time: number, delta: number) {
    if (this.over) return;
    this.elapsed += delta;
    this.timeText.setText(String(Math.max(0, Math.ceil((this.ROUND_MS - this.elapsed) / 1000))));
    if (this.elapsed >= this.ROUND_MS) {
      this.endRound();
      return;
    }

    this.spawnTimer -= delta;
    if (this.spawnTimer <= 0) {
      this.spawn();
      // Waves: spawn interval shrinks; late-round can double-spawn.
      const t = this.elapsed / this.ROUND_MS;
      if (t > 0.5 && Math.random() < 0.35) this.spawn();
      this.spawnTimer = 800 - 420 * t;
    }
  }
}

export const whackAMoleConfig: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
    width: 600,
    height: 1000,
  },
  scene: WhackAMoleScene,
  backgroundColor: '#1A0C24',
  audio: { noAudio: true },
};
