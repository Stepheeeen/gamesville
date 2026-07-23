import * as Phaser from 'phaser';

/**
 * Milk Bottle Smash — the classic booth throw. Drag back from the ball
 * and release to hurl it at a pyramid of six milk bottles on a stand.
 * A bottle scores once it tumbles off the stand. 3 balls per pyramid,
 * 3 pyramids per run; a first-ball clean sweep pays a STRIKE bonus.
 */
export default class MilkBottleScene extends Phaser.Scene {
  private score = 0;
  private pyramid = 1;
  private ballsLeft = 3;
  private ballsUsedThisPyramid = 0;
  private over = false;

  private ball!: Phaser.GameObjects.Arc;
  private ballBody!: Phaser.Physics.Arcade.Body;
  private ballThrown = false;
  private settleTimer: Phaser.Time.TimerEvent | null = null;

  private bottles: Phaser.GameObjects.Rectangle[] = [];
  private stand!: Phaser.GameObjects.Rectangle;
  private aimLine!: Phaser.GameObjects.Graphics;
  private dragging = false;

  private scoreText!: Phaser.GameObjects.Text;
  private ballsText!: Phaser.GameObjects.Text;
  private pyramidText!: Phaser.GameObjects.Text;

  private readonly STAND_Y = 520;
  private readonly STAND_X = 300;
  private readonly BALL_HOME = { x: 300, y: 870 };

  constructor() {
    super({ key: 'MilkBottleScene' });
  }

  create() {
    this.score = 0;
    this.pyramid = 1;
    this.ballsLeft = 3;
    this.ballsUsedThisPyramid = 0;
    this.over = false;

    // Booth backdrop
    const g = this.add.graphics();
    for (let i = 0; i < 12; i++) {
      g.fillStyle(i % 2 === 0 ? 0x2bd9c8 : 0xf4e8d8, 0.35);
      g.fillRect(i * 50, 130, 50, 30);
    }

    // Stand (static physics platform)
    this.stand = this.add.rectangle(this.STAND_X, this.STAND_Y, 280, 22, 0x3a2158).setStrokeStyle(3, 0xffc64d, 0.7);
    this.physics.add.existing(this.stand, true);
    this.add.rectangle(this.STAND_X, this.STAND_Y + 90, 34, 160, 0x281540); // pedestal

    // UI
    this.scoreText = this.add
      .text(300, 60, '0', { fontSize: '56px', fontFamily: 'Arial', color: '#fff4e0', fontStyle: 'bold' })
      .setOrigin(0.5);
    this.ballsText = this.add
      .text(30, 50, '⚾⚾⚾', { fontSize: '24px' })
      .setOrigin(0, 0.5);
    this.pyramidText = this.add
      .text(570, 50, 'PYRAMID 1/3', { fontSize: '20px', fontFamily: 'Arial', color: '#2bd9c8', fontStyle: 'bold' })
      .setOrigin(1, 0.5);
    this.add
      .text(300, 950, 'DRAG BACK & RELEASE TO THROW', { fontSize: '17px', fontFamily: 'Arial', color: '#a98fb8' })
      .setOrigin(0.5);

    this.aimLine = this.add.graphics().setDepth(9);

    this.buildPyramid();
    this.newBall();

    // Drag-anywhere slingshot
    this.input.on('pointerdown', () => {
      if (!this.over && !this.ballThrown) this.dragging = true;
    });
    this.input.on('pointermove', (p: Phaser.Input.Pointer) => {
      if (!this.dragging) return;
      this.drawAim(p);
    });
    this.input.on('pointerup', (p: Phaser.Input.Pointer) => {
      if (!this.dragging) return;
      this.dragging = false;
      this.aimLine.clear();
      this.throwBall(p);
    });
  }

  private buildPyramid() {
    for (const b of this.bottles) b.destroy();
    this.bottles = [];

    const rows = [3, 2, 1];
    const bw = 34;
    const bh = 62;
    rows.forEach((count, row) => {
      const y = this.STAND_Y - 11 - bh / 2 - row * (bh + 2);
      const startX = this.STAND_X - ((count - 1) * (bw + 10)) / 2;
      for (let i = 0; i < count; i++) {
        const bottle = this.add
          .rectangle(startX + i * (bw + 10), y, bw, bh, 0xf4e8d8)
          .setStrokeStyle(3, 0xa98fb8);
        this.physics.add.existing(bottle);
        const body = bottle.body as Phaser.Physics.Arcade.Body;
        body.setBounce(0.15);
        body.setDragX(60);
        bottle.setData('down', false);
        this.bottles.push(bottle);
      }
    });

    // Bottles rest on the stand and on each other
    this.physics.add.collider(this.bottles, this.stand);
    this.physics.add.collider(this.bottles, this.bottles);
  }

  private newBall() {
    if (this.ball) this.ball.destroy();
    this.ball = this.add.circle(this.BALL_HOME.x, this.BALL_HOME.y, 17, 0xff4d5e).setStrokeStyle(3, 0xfff4e0);
    this.physics.add.existing(this.ball);
    this.ballBody = this.ball.body as Phaser.Physics.Arcade.Body;
    this.ballBody.setCircle(17, -17, -17);
    this.ballBody.setAllowGravity(false);
    this.ballThrown = false;

    // Straight-on booth view: the ball travels "into" the booth, so it passes
    // the stand plane (no ball↔stand collider) and smashes the bottles.
    this.physics.add.collider(this.ball, this.bottles, (_ball, bottleObj) => {
      const bottle = bottleObj as Phaser.GameObjects.Rectangle;
      const body = bottle.body as Phaser.Physics.Arcade.Body;
      // Carry real impact through: share the ball's momentum + tumble
      body.velocity.x += this.ballBody.velocity.x * 0.6;
      body.velocity.y += this.ballBody.velocity.y * 0.45;
      body.setAngularVelocity(Phaser.Math.Between(-240, 240));
    });
  }

  private drawAim(p: Phaser.Input.Pointer) {
    const dx = this.ball.x - p.worldX;
    const dy = this.ball.y - p.worldY;
    this.aimLine.clear();
    this.aimLine.lineStyle(3, 0xffc64d, 0.8);
    this.aimLine.lineBetween(this.ball.x, this.ball.y, this.ball.x + dx * 3, this.ball.y + dy * 3);
    this.aimLine.fillStyle(0xffe08a, 1);
    this.aimLine.fillCircle(this.ball.x + dx * 3, this.ball.y + dy * 3, 5);
  }

  private throwBall(p: Phaser.Input.Pointer) {
    // The ball sits ~130px above the canvas bottom, so the drag distance is
    // short — a high multiplier makes a full pull reach the pyramid.
    const vx = (this.ball.x - p.worldX) * 8;
    const vy = (this.ball.y - p.worldY) * 8;
    if (Math.abs(vx) < 120 && Math.abs(vy) < 120) return; // too soft — not a throw

    this.ballThrown = true;
    this.ballsLeft -= 1;
    this.ballsUsedThisPyramid += 1;
    this.ballsText.setText('⚾'.repeat(Math.max(0, this.ballsLeft)));
    this.ballBody.setAllowGravity(true);
    this.ballBody.setVelocity(vx, vy);

    // Settle window: after 2.2s the throw is resolved.
    this.settleTimer = this.time.delayedCall(2200, () => this.resolveThrow());
  }

  private resolveThrow() {
    if (this.over) return;

    // Clean sweep on the first ball of a pyramid?
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

  private strikeBanner() {
    const t = this.add
      .text(300, 400, 'STRIKE! +60', { fontSize: '52px', fontFamily: 'Arial', color: '#ffe08a', fontStyle: 'bold' })
      .setOrigin(0.5)
      .setDepth(15)
      .setScale(0.3);
    this.cameras.main.flash(150, 255, 198, 77);
    this.tweens.add({
      targets: t,
      scale: 1,
      duration: 250,
      ease: 'Back.easeOut',
      onComplete: () =>
        this.tweens.add({ targets: t, alpha: 0, delay: 600, duration: 300, onComplete: () => t.destroy() }),
    });
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
    this.pyramidText.setText(`PYRAMID ${this.pyramid}/3`);
    this.ballsText.setText('⚾⚾⚾');
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
        const t = this.add
          .text(bottle.x, bottle.y - 40, '+20', { fontSize: '24px', fontFamily: 'Arial', color: '#2bd9c8', fontStyle: 'bold' })
          .setOrigin(0.5);
        this.tweens.add({ targets: t, y: t.y - 50, alpha: 0, duration: 600, onComplete: () => t.destroy() });
        this.tweens.add({ targets: bottle, alpha: 0.25, duration: 500 });
      }
    }

    // Ball left the world → resolve early
    if (this.ballThrown && (this.ball.y > 1050 || this.ball.x < -60 || this.ball.x > 660 || this.ball.y < -300)) {
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
