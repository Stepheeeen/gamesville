import * as Phaser from 'phaser';

type DuckKind = 'standard' | 'fast' | 'golden' | 'sign';

interface Target {
  container: Phaser.GameObjects.Container;
  kind: DuckKind;
  speed: number;
  radius: number;
  dead: boolean;
}

/**
 * Duck Gallery — a carnival shooting gallery. Three lanes of tin ducks
 * glide in alternating directions at different speeds. 20 shots: tap to
 * shoot at that point. Standard duck 10, small fast duck 25, rare golden
 * duck 50; hitting a NO-SHOOT sign voids 2 extra shots. Run ends when
 * the ammo is spent.
 */
export default class DuckGalleryScene extends Phaser.Scene {
  private score = 0;
  private shots = 20;
  private over = false;
  private targets: Target[] = [];
  private laneTimers = [0, 0, 0];

  private scoreText!: Phaser.GameObjects.Text;
  private shotsText!: Phaser.GameObjects.Text;

  private readonly LANES = [380, 530, 680];
  private readonly LANE_DIR = [1, -1, 1];
  private readonly LANE_SPEED = [90, 140, 200];

  constructor() {
    super({ key: 'DuckGalleryScene' });
  }

  create() {
    const { width } = this.scale;
    this.score = 0;
    this.shots = 20;
    this.over = false;
    this.targets = [];
    this.laneTimers = [400, 900, 1400];

    // Booth backdrop: striped awning top + painted wave rails per lane
    const g = this.add.graphics();
    for (let i = 0; i < 12; i++) {
      g.fillStyle(i % 2 === 0 ? 0xff4d5e : 0xf4e8d8, 1);
      g.fillRect(i * 50, 150, 50, 40);
    }
    for (const y of this.LANES) {
      g.fillStyle(0x281540, 1);
      g.fillRect(0, y + 30, width, 26);
      g.lineStyle(2, 0x2bd9c8, 0.5);
      for (let x = 0; x < width; x += 40) {
        g.beginPath();
        g.arc(x + 20, y + 30, 20, Math.PI, 0, false);
        g.strokePath();
      }
    }

    this.add
      .text(width / 2, 230, '🎯 DUCK GALLERY', { fontSize: '26px', fontFamily: 'Arial', color: '#ffe08a', fontStyle: 'bold' })
      .setOrigin(0.5);

    this.scoreText = this.add
      .text(width / 2, 70, '0', { fontSize: '56px', fontFamily: 'Arial', color: '#fff4e0', fontStyle: 'bold' })
      .setOrigin(0.5);
    this.shotsText = this.add
      .text(width - 30, 60, '● 20', { fontSize: '26px', fontFamily: 'Arial', color: '#2bd9c8', fontStyle: 'bold' })
      .setOrigin(1, 0.5);

    this.input.on('pointerdown', this.shoot, this);
  }

  private spawn(lane: number) {
    const { width } = this.scale;
    const dir = this.LANE_DIR[lane];
    const baseSpeed = this.LANE_SPEED[lane];

    const roll = Math.random();
    let kind: DuckKind = 'standard';
    if (roll < 0.08) kind = 'golden';
    else if (roll < 0.2) kind = 'sign';
    else if (roll < 0.45) kind = 'fast';

    const radius = kind === 'fast' ? 20 : 28;
    const speed = dir * baseSpeed * (kind === 'fast' ? 1.7 : 1);
    const x = dir > 0 ? -60 : width + 60;
    const c = this.add.container(x, this.LANES[lane]);

    if (kind === 'sign') {
      const board = this.add.rectangle(0, 0, 96, 52, 0xfff4e0).setStrokeStyle(3, 0xc92a3d);
      const label = this.add.text(0, 0, 'NO\nSHOOT', {
        fontSize: '15px',
        fontFamily: 'Arial',
        color: '#c92a3d',
        fontStyle: 'bold',
        align: 'center',
      }).setOrigin(0.5);
      c.add([board, label]);
    } else {
      const tint = kind === 'golden' ? 0xffc64d : kind === 'fast' ? 0x2bd9c8 : 0xf4e8d8;
      const body = this.add.circle(0, 0, radius, tint).setStrokeStyle(3, 0x120818, 0.5);
      const head = this.add.circle(dir * radius * 0.8, -radius * 0.7, radius * 0.55, tint).setStrokeStyle(2, 0x120818, 0.5);
      const beak = this.add.triangle(dir * radius * 1.4, -radius * 0.7, 0, -7, 0, 7, dir * 16, 0, 0xff4d5e);
      const eye = this.add.circle(dir * radius * 0.9, -radius * 0.85, 3.5, 0x120818);
      c.add([body, head, beak, eye]);
      if (kind === 'golden') {
        this.tweens.add({ targets: c, alpha: 0.65, duration: 260, yoyo: true, repeat: -1 });
      }
    }

    this.targets.push({ container: c, kind, speed, radius: kind === 'sign' ? 50 : radius + 8, dead: false });
  }

  private shoot(pointer: Phaser.Input.Pointer) {
    if (this.over || this.shots <= 0) return;
    this.shots -= 1;

    // Crosshair flash
    const cross = this.add.container(pointer.worldX, pointer.worldY);
    const ring = this.add.circle(0, 0, 18, 0x000000, 0).setStrokeStyle(3, 0xffe08a);
    const dotV = this.add.rectangle(0, 0, 2, 26, 0xffe08a);
    const dotH = this.add.rectangle(0, 0, 26, 2, 0xffe08a);
    cross.add([ring, dotV, dotH]);
    this.tweens.add({ targets: cross, alpha: 0, scale: 1.6, duration: 260, onComplete: () => cross.destroy() });
    this.cameras.main.shake(50, 0.002);

    // Hit test — nearest live target under the shot
    const hit = this.targets.find(
      (t) =>
        !t.dead &&
        Phaser.Math.Distance.Between(pointer.worldX, pointer.worldY, t.container.x, t.container.y) <= t.radius,
    );

    if (hit) {
      hit.dead = true;
      if (hit.kind === 'sign') {
        this.shots = Math.max(0, this.shots - 2);
        this.cameras.main.flash(120, 255, 77, 94);
        this.floatText(hit.container.x, hit.container.y - 50, '-2 SHOTS!', '#ff6b5e');
        this.tweens.add({ targets: hit.container, angle: 25, alpha: 0, duration: 400, onComplete: () => hit.container.destroy() });
      } else {
        const points = hit.kind === 'golden' ? 50 : hit.kind === 'fast' ? 25 : 10;
        this.score += points;
        this.scoreText.setText(String(this.score));
        this.game.events.emit('SCORE_UPDATE', this.score);
        this.floatText(hit.container.x, hit.container.y - 50, `+${points}`, hit.kind === 'golden' ? '#ffe08a' : '#2bd9c8');
        // Tin duck keels over
        this.tweens.add({
          targets: hit.container,
          angle: 90,
          y: hit.container.y + 40,
          alpha: 0,
          duration: 350,
          ease: 'Quad.easeIn',
          onComplete: () => hit.container.destroy(),
        });
      }
    }

    this.shotsText.setText(`● ${this.shots}`);
    if (this.shots <= 0) {
      this.over = true;
      this.time.delayedCall(700, () => this.game.events.emit('GAME_OVER', this.score));
    }
  }

  private floatText(x: number, y: number, text: string, color: string) {
    const t = this.add
      .text(x, y, text, { fontSize: '26px', fontFamily: 'Arial', color, fontStyle: 'bold' })
      .setOrigin(0.5);
    this.tweens.add({ targets: t, y: y - 60, alpha: 0, duration: 700, onComplete: () => t.destroy() });
  }

  update(_time: number, delta: number) {
    if (this.over) return;
    const { width } = this.scale;

    // Glide + cull
    for (const t of this.targets) {
      if (t.dead) continue;
      t.container.x += (t.speed * delta) / 1000;
      if (t.container.x < -100 || t.container.x > width + 100) {
        t.dead = true;
        t.container.destroy();
      }
    }
    this.targets = this.targets.filter((t) => !t.dead || t.container.active);

    // Lane spawners
    for (let lane = 0; lane < 3; lane++) {
      this.laneTimers[lane] -= delta;
      if (this.laneTimers[lane] <= 0) {
        this.spawn(lane);
        this.laneTimers[lane] = Phaser.Math.Between(900, 1800);
      }
    }
  }
}

export const duckGalleryConfig: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
    width: 600,
    height: 1000,
  },
  scene: DuckGalleryScene,
  backgroundColor: '#1A0C24',
  audio: { noAudio: true },
};
