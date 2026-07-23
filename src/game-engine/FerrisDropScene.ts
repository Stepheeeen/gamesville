import * as Phaser from 'phaser';

/**
 * Ferris Drop — a spinning ferris wheel with one lit "open" gondola.
 * Tap to drop the rider from the top platform; land in the open gondola
 * for +25 (+15 dead-center). Every catch speeds the wheel up and may
 * reverse it, and a new gondola opens. 3 misses end the run.
 * Landing check is a deterministic distance test at the gondola ring —
 * no physics overlap flakiness.
 */
export default class FerrisDropScene extends Phaser.Scene {
  private score = 0;
  private misses = 0;
  private over = false;

  private wheelAngle = 0; // radians
  private wheelSpeed = 0.8; // rad/s
  private openIndex = 0;

  private rider!: Phaser.GameObjects.Container;
  private riderVy = 0;
  private dropping = false;

  private gondolas: Phaser.GameObjects.Container[] = [];
  private spokes!: Phaser.GameObjects.Graphics;
  private scoreText!: Phaser.GameObjects.Text;
  private missText!: Phaser.GameObjects.Text;

  private readonly CX = 300;
  private readonly CY = 590;
  private readonly R = 210;
  private readonly SEATS = 8;
  private readonly RIDER_START = { x: 300, y: 150 };

  constructor() {
    super({ key: 'FerrisDropScene' });
  }

  create() {
    this.score = 0;
    this.misses = 0;
    this.over = false;
    this.wheelAngle = 0;
    this.wheelSpeed = 0.8;
    this.openIndex = Phaser.Math.Between(0, this.SEATS - 1);
    this.dropping = false;

    // Wheel hub + rim
    this.spokes = this.add.graphics();
    this.add.circle(this.CX, this.CY, 16, 0xffc64d).setStrokeStyle(3, 0xffe08a).setDepth(5);

    // Support legs
    const g = this.add.graphics();
    g.lineStyle(10, 0x332052, 1);
    g.lineBetween(this.CX, this.CY, this.CX - 130, 960);
    g.lineBetween(this.CX, this.CY, this.CX + 130, 960);

    // Gondolas
    for (let i = 0; i < this.SEATS; i++) {
      const c = this.add.container(0, 0);
      const cab = this.add.rectangle(0, 0, 56, 40, 0x281540).setStrokeStyle(3, 0xa98fb8);
      const roofArc = this.add.triangle(0, -26, -30, 0, 30, 0, 0, -16, 0x332052);
      c.add([roofArc, cab]);
      c.setDepth(4);
      this.gondolas.push(c);
    }
    this.styleGondolas();

    // Drop platform
    this.add.rectangle(this.RIDER_START.x, this.RIDER_START.y + 26, 130, 12, 0x332052).setStrokeStyle(2, 0xffc64d, 0.6);

    // Rider
    this.rider = this.buildRider();

    // UI
    this.scoreText = this.add
      .text(300, 60, '0', { fontSize: '56px', fontFamily: 'Arial', color: '#fff4e0', fontStyle: 'bold' })
      .setOrigin(0.5)
      .setDepth(10);
    this.missText = this.add
      .text(30, 50, '💛💛💛', { fontSize: '24px' })
      .setOrigin(0, 0.5)
      .setDepth(10);
    this.add
      .text(570, 50, 'TAP TO DROP', { fontSize: '18px', fontFamily: 'Arial', color: '#a98fb8' })
      .setOrigin(1, 0.5)
      .setDepth(10);

    this.input.on('pointerdown', () => {
      if (!this.over && !this.dropping) {
        this.dropping = true;
        this.riderVy = 0;
      }
    });
  }

  private buildRider(): Phaser.GameObjects.Container {
    const c = this.add.container(this.RIDER_START.x, this.RIDER_START.y);
    const body = this.add.circle(0, 0, 16, 0xff4d5e).setStrokeStyle(3, 0xfff4e0);
    const eyeL = this.add.circle(-5, -3, 2.5, 0x120818);
    const eyeR = this.add.circle(5, -3, 2.5, 0x120818);
    c.add([body, eyeL, eyeR]);
    c.setDepth(8);
    return c;
  }

  private styleGondolas() {
    this.gondolas.forEach((c, i) => {
      const cab = c.list[1] as Phaser.GameObjects.Rectangle;
      if (i === this.openIndex) {
        cab.setFillStyle(0xffc64d);
        cab.setStrokeStyle(3, 0xffe08a);
      } else {
        cab.setFillStyle(0x281540);
        cab.setStrokeStyle(3, 0xa98fb8);
      }
    });
  }

  private gondolaPos(i: number): { x: number; y: number } {
    const a = this.wheelAngle + (i * Math.PI * 2) / this.SEATS;
    return { x: this.CX + Math.cos(a) * this.R, y: this.CY + Math.sin(a) * this.R };
  }

  private catchRider(perfect: boolean) {
    const gained = 25 + (perfect ? 15 : 0);
    this.score += gained;
    this.scoreText.setText(String(this.score));
    this.game.events.emit('SCORE_UPDATE', this.score);
    const pos = this.gondolaPos(this.openIndex);
    this.floatText(pos.x, pos.y - 60, perfect ? `PERFECT +${gained}` : `+${gained}`, perfect ? '#ffe08a' : '#2bd9c8');
    this.cameras.main.flash(100, 255, 198, 77);

    // Speed up, maybe reverse, open a new gondola.
    const dir = Math.sign(this.wheelSpeed) * (Math.random() < 0.35 ? -1 : 1);
    this.wheelSpeed = dir * (Math.abs(this.wheelSpeed) + 0.18);
    let nextOpen = this.openIndex;
    while (nextOpen === this.openIndex) nextOpen = Phaser.Math.Between(0, this.SEATS - 1);
    this.openIndex = nextOpen;
    this.styleGondolas();
    this.resetRider();
  }

  private missRider() {
    this.misses += 1;
    this.missText.setText('💛'.repeat(Math.max(0, 3 - this.misses)));
    this.cameras.main.shake(160, 0.01);
    this.floatText(this.rider.x, Math.min(this.rider.y, 900), 'MISS!', '#ff6b5e');
    if (this.misses >= 3) {
      this.over = true;
      this.rider.setVisible(false);
      this.time.delayedCall(700, () => this.game.events.emit('GAME_OVER', this.score));
      return;
    }
    this.resetRider();
  }

  private resetRider() {
    this.dropping = false;
    this.riderVy = 0;
    this.rider.setPosition(this.RIDER_START.x, this.RIDER_START.y);
  }

  private floatText(x: number, y: number, text: string, color: string) {
    const t = this.add
      .text(x, y, text, { fontSize: '28px', fontFamily: 'Arial', color, fontStyle: 'bold' })
      .setOrigin(0.5)
      .setDepth(12);
    this.tweens.add({ targets: t, y: y - 70, alpha: 0, duration: 800, onComplete: () => t.destroy() });
  }

  update(_time: number, delta: number) {
    if (this.over) return;
    const dt = delta / 1000;

    // Spin the wheel
    this.wheelAngle += this.wheelSpeed * dt;
    this.spokes.clear();
    this.spokes.lineStyle(4, 0x3a2158, 1);
    this.spokes.strokeCircle(this.CX, this.CY, this.R);
    for (let i = 0; i < this.SEATS; i++) {
      const pos = this.gondolaPos(i);
      this.spokes.lineStyle(3, i === this.openIndex ? 0xffc64d : 0x3a2158, 1);
      this.spokes.lineBetween(this.CX, this.CY, pos.x, pos.y);
      this.gondolas[i].setPosition(pos.x, pos.y + 26); // hang below the joint
    }

    // Rider fall
    if (this.dropping) {
      this.riderVy += 1500 * dt;
      this.rider.y += this.riderVy * dt;

      // Deterministic landing: when crossing the open gondola's height band,
      // score by horizontal distance to its center.
      const open = this.gondolaPos(this.openIndex);
      const gy = open.y + 26;
      if (this.rider.y >= gy - 14 && this.rider.y <= gy + 26) {
        const dx = Math.abs(this.rider.x - open.x);
        if (dx <= 30) {
          this.catchRider(dx <= 10);
          return;
        }
      }
      if (this.rider.y > 1020) this.missRider();
    }
  }
}

export const ferrisDropConfig: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
    width: 600,
    height: 1000,
  },
  scene: FerrisDropScene,
  backgroundColor: '#1A0C24',
  audio: { noAudio: true },
};
