import * as Phaser from 'phaser';

/**
 * High Striker — the carnival strength hammer.
 * An oscillating power meter sweeps 0→100→0, faster every swing. Tap to
 * swing the mallet: the puck flies up the tower to a height proportional
 * to the meter. ≥92 rings the bell. Consecutive bells chain a multiplier.
 * 8 swings per run. Score = Σ power + 100 × chain per bell.
 */
export default class HighStrikerScene extends Phaser.Scene {
  private score = 0;
  private swingsLeft = 8;
  private chain = 0;
  private meterValue = 0;
  private meterDir = 1;
  private meterSpeed = 1.1; // value per frame-ish, scaled by delta
  private state: 'READY' | 'ANIM' | 'DONE' = 'READY';

  private meterFill!: Phaser.GameObjects.Rectangle;
  private puck!: Phaser.GameObjects.Arc;
  private mallet!: Phaser.GameObjects.Container;
  private bell!: Phaser.GameObjects.Arc;
  private scoreText!: Phaser.GameObjects.Text;
  private swingsText!: Phaser.GameObjects.Text;
  private chainText!: Phaser.GameObjects.Text;

  private readonly towerX = 400;
  private readonly towerTop = 150;
  private readonly towerBase = 800;

  constructor() {
    super({ key: 'HighStrikerScene' });
  }

  create() {
    const { width } = this.scale;
    this.score = 0;
    this.swingsLeft = 8;
    this.chain = 0;
    this.meterValue = 0;
    this.meterDir = 1;
    this.meterSpeed = 1.1;
    this.state = 'READY';

    // ── Tower ──
    const g = this.add.graphics();
    g.fillStyle(0x281540, 1);
    g.fillRect(this.towerX - 14, this.towerTop, 28, this.towerBase - this.towerTop);
    g.lineStyle(3, 0xffc64d, 0.6);
    g.strokeRect(this.towerX - 14, this.towerTop, 28, this.towerBase - this.towerTop);
    // Zone ticks + labels
    const zones: [number, string][] = [
      [0.25, 'WEAK'],
      [0.5, 'FAIR'],
      [0.75, 'MIGHTY'],
      [0.92, 'HERO'],
    ];
    for (const [frac, label] of zones) {
      const y = this.towerBase - (this.towerBase - this.towerTop) * frac;
      g.lineStyle(2, 0x2bd9c8, 0.7);
      g.lineBetween(this.towerX - 26, y, this.towerX + 26, y);
      this.add
        .text(this.towerX + 34, y, label, { fontSize: '16px', fontFamily: 'Arial', color: '#a98fb8' })
        .setOrigin(0, 0.5);
    }

    // Bell
    this.bell = this.add.circle(this.towerX, this.towerTop - 24, 22, 0xffc64d).setStrokeStyle(3, 0xffe08a);
    this.add.text(this.towerX, this.towerTop - 24, '🔔', { fontSize: '22px' }).setOrigin(0.5);

    // Puck
    this.puck = this.add.circle(this.towerX, this.towerBase - 10, 12, 0xff4d5e).setStrokeStyle(2, 0xfff4e0);

    // Strike pad + mallet
    this.add.ellipse(180, this.towerBase + 10, 90, 26, 0x332052).setStrokeStyle(2, 0xffc64d, 0.5);
    this.mallet = this.add.container(150, this.towerBase - 60);
    const handle = this.add.rectangle(0, 0, 10, 110, 0xd98e1f).setOrigin(0.5, 1);
    const head = this.add.rectangle(0, -110, 56, 34, 0xff4d5e).setStrokeStyle(2, 0xfff4e0);
    this.mallet.add([handle, head]);
    this.mallet.setRotation(-0.7);

    // ── Meter ──
    const meterY = 900;
    this.add.rectangle(width / 2, meterY, 440, 34, 0x120818).setStrokeStyle(2, 0xffc64d, 0.8);
    this.meterFill = this.add.rectangle(width / 2 - 218, meterY, 0, 26, 0x2bd9c8).setOrigin(0, 0.5);
    // Bell zone marker on the meter (≥92)
    this.add.rectangle(width / 2 - 218 + 436 * 0.92, meterY, 436 * 0.08, 26, 0xffc64d, 0.35).setOrigin(0, 0.5);
    this.add
      .text(width / 2, meterY + 34, 'TAP AT THE PEAK!', { fontSize: '18px', fontFamily: 'Arial', color: '#a98fb8' })
      .setOrigin(0.5);

    // ── UI ──
    this.scoreText = this.add
      .text(width / 2, 60, '0', { fontSize: '56px', fontFamily: 'Arial', color: '#fff4e0', fontStyle: 'bold' })
      .setOrigin(0.5);
    this.swingsText = this.add
      .text(30, 40, 'SWINGS: 8', { fontSize: '22px', fontFamily: 'Arial', color: '#ffc64d', fontStyle: 'bold' })
      .setOrigin(0, 0.5);
    this.chainText = this.add
      .text(30, 70, '', { fontSize: '20px', fontFamily: 'Arial', color: '#ff9aa4', fontStyle: 'bold' })
      .setOrigin(0, 0.5);

    this.input.on('pointerdown', this.swing, this);
  }

  private swing() {
    if (this.state !== 'READY') return;
    this.state = 'ANIM';
    const power = Math.round(this.meterValue);

    // Mallet slam
    this.tweens.add({
      targets: this.mallet,
      rotation: 0.5,
      duration: 110,
      ease: 'Quad.easeIn',
      yoyo: true,
      onYoyo: () => this.cameras.main.shake(90, 0.004),
    });

    // Puck flight
    const targetY = this.towerBase - 10 - ((this.towerBase - this.towerTop - 10) * power) / 100;
    const rang = power >= 92;
    this.tweens.add({
      targets: this.puck,
      y: targetY,
      duration: 320 + power * 2,
      ease: 'Cubic.easeOut',
      delay: 110,
      onComplete: () => {
        if (rang) {
          this.chain += 1;
          this.ringBell();
        } else {
          this.chain = 0;
          this.chainText.setText('');
        }
        this.score += power + (rang ? 100 * this.chain : 0);
        this.scoreText.setText(String(this.score));
        this.game.events.emit('SCORE_UPDATE', this.score);
        this.floatText(this.towerX, targetY, rang ? `DING! +${power + 100 * this.chain}` : `+${power}`, rang ? '#ffe08a' : '#2bd9c8');

        // Puck drops back
        this.tweens.add({
          targets: this.puck,
          y: this.towerBase - 10,
          duration: 380,
          ease: 'Bounce.easeOut',
          onComplete: () => this.nextSwing(),
        });
      },
    });
  }

  private ringBell() {
    this.chainText.setText(`CHAIN ×${this.chain}`);
    this.tweens.add({
      targets: this.bell,
      scale: 1.5,
      duration: 120,
      yoyo: true,
      repeat: 2,
    });
    this.cameras.main.flash(160, 255, 198, 77);
  }

  private nextSwing() {
    this.swingsLeft -= 1;
    this.swingsText.setText(`SWINGS: ${this.swingsLeft}`);
    if (this.swingsLeft <= 0) {
      this.state = 'DONE';
      this.time.delayedCall(600, () => this.game.events.emit('GAME_OVER', this.score));
      return;
    }
    this.meterSpeed += 0.28; // faster every swing
    this.meterValue = 0;
    this.meterDir = 1;
    this.state = 'READY';
  }

  private floatText(x: number, y: number, text: string, color: string) {
    const t = this.add
      .text(x, y, text, { fontSize: '28px', fontFamily: 'Arial', color, fontStyle: 'bold' })
      .setOrigin(0.5);
    this.tweens.add({ targets: t, y: y - 70, alpha: 0, duration: 900, onComplete: () => t.destroy() });
  }

  update(_time: number, delta: number) {
    if (this.state !== 'READY') return;
    // Triangle-wave sweep 0→100→0
    this.meterValue += this.meterDir * this.meterSpeed * (delta / 16.67) * 2.2;
    if (this.meterValue >= 100) {
      this.meterValue = 100;
      this.meterDir = -1;
    } else if (this.meterValue <= 0) {
      this.meterValue = 0;
      this.meterDir = 1;
    }
    this.meterFill.width = (436 * this.meterValue) / 100;
    this.meterFill.fillColor = this.meterValue >= 92 ? 0xffc64d : this.meterValue >= 70 ? 0xff4d5e : 0x2bd9c8;
  }
}

export const highStrikerConfig: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
    width: 600,
    height: 1000,
  },
  scene: HighStrikerScene,
  backgroundColor: '#1A0C24',
  audio: { noAudio: true },
};
