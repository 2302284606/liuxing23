import * as PIXI from 'pixi.js';

// 激光武器配置
const laserConfig = {
  damage: 5, // 普通子弹的5倍以上
  width: 3, // 核心激光宽度
  glowWidth: 8, // 发光层宽度
  color: 0xFFFFFF, // 核心激光颜色
  glowColor: 0x00FFFF, // 发光层颜色
  glowAlpha: 0.5, // 发光层透明度
  jitter: 2, // 激光抖动幅度
  playerSpeedReduction: 0.5, // 激光激活时移动速度降低比例
};

// 激光武器类
export class LaserScanner {
  private app: PIXI.Application;
  private player: PIXI.Graphics;
  private enemies: PIXI.Graphics[];
  private expBeans: PIXI.Graphics[];
  private isActive: boolean = false;
  private targetPosition: { x: number; y: number };
  private laserGraphics: PIXI.Graphics;
  private glowGraphics: PIXI.Graphics;
  private hitEffects: PIXI.Graphics[] = [];

  constructor(app: PIXI.Application, player: PIXI.Graphics, enemies: PIXI.Graphics[], expBeans: PIXI.Graphics[]) {
    this.app = app;
    this.player = player;
    this.enemies = enemies;
    this.expBeans = expBeans;
    this.targetPosition = { x: app.screen.width / 2, y: app.screen.height / 2 };

    // 创建激光图形
    this.laserGraphics = new PIXI.Graphics();
    this.laserGraphics.zIndex = 20;
    app.stage.addChild(this.laserGraphics);

    // 创建发光层
    this.glowGraphics = new PIXI.Graphics();
    this.glowGraphics.zIndex = 19;
    app.stage.addChild(this.glowGraphics);

    // 初始化鼠标/触摸事件
    this.initInput();
  }

  // 初始化输入事件
  private initInput() {
    // 获取canvas元素
    const canvas = this.app.canvas;
    
    // 鼠标移动事件
    canvas.addEventListener('mousemove', (e) => {
      const rect = canvas.getBoundingClientRect();
      this.targetPosition = {
        x: e.clientX - rect.left,
        y: e.clientY - rect.top
      };
    });

    // 触摸移动事件
    canvas.addEventListener('touchmove', (e) => {
      e.preventDefault();
      const rect = canvas.getBoundingClientRect();
      const touch = e.touches[0];
      this.targetPosition = {
        x: touch.clientX - rect.left,
        y: touch.clientY - rect.top
      };
    });

    // 鼠标/触摸按下事件 - 激活激光
    canvas.addEventListener('mousedown', () => {
      this.activate();
    });

    canvas.addEventListener('touchstart', (e) => {
      e.preventDefault();
      this.activate();
    });

    // 鼠标/触摸释放事件 - 禁用激光
    canvas.addEventListener('mouseup', () => {
      this.deactivate();
    });

    canvas.addEventListener('touchend', () => {
      this.deactivate();
    });
  }

  // 激活激光
  public activate() {
    this.isActive = true;
  }

  // 禁用激光
  public deactivate() {
    this.isActive = false;
    this.clearLaser();
  }

  // 清除激光
  private clearLaser() {
    this.laserGraphics.clear();
    this.glowGraphics.clear();
  }

  // 更新激光
  public update() {
    if (!this.isActive) {
      this.clearLaser();
      return;
    }

    // 绘制激光
    this.drawLaser();

    // 检测碰撞
    this.checkCollisions();

    // 更新击中效果
    this.updateHitEffects();
  }

  // 绘制激光
  private drawLaser() {
    // 添加抖动效果
    const jitterX = (Math.random() - 0.5) * laserConfig.jitter;
    const jitterY = (Math.random() - 0.5) * laserConfig.jitter;

    const endX = this.targetPosition.x + jitterX;
    const endY = this.targetPosition.y + jitterY;

    // 绘制发光层
    this.glowGraphics.clear();
    this.glowGraphics.lineStyle(laserConfig.glowWidth, laserConfig.glowColor, laserConfig.glowAlpha);
    this.glowGraphics.moveTo(this.player.x, this.player.y);
    this.glowGraphics.lineTo(endX, endY);

    // 绘制核心激光
    this.laserGraphics.clear();
    this.laserGraphics.lineStyle(laserConfig.width, laserConfig.color, 1);
    this.laserGraphics.moveTo(this.player.x, this.player.y);
    this.laserGraphics.lineTo(endX, endY);
  }

  // 检测碰撞
  private checkCollisions() {
    const startX = this.player.x;
    const startY = this.player.y;
    const endX = this.targetPosition.x;
    const endY = this.targetPosition.y;

    // 线段对敌人的碰撞检测
    this.enemies.forEach((enemy, index) => {
      const enemyBounds = enemy.getBounds();
      const enemyCenterX = enemyBounds.x + enemyBounds.width / 2;
      const enemyCenterY = enemyBounds.y + enemyBounds.height / 2;
      const enemyRadius = Math.min(enemyBounds.width, enemyBounds.height) / 2;

      if (this.lineCircleIntersection(startX, startY, endX, endY, enemyCenterX, enemyCenterY, enemyRadius)) {
        // 移除敌人
        this.app.stage.removeChild(enemy);
        this.enemies.splice(index, 1);

        // 生成经验豆
        const expBean = new PIXI.Graphics();
        expBean.beginFill(0xFFFF00);
        expBean.drawCircle(0, 0, 10);
        expBean.endFill();
        expBean.x = enemyCenterX;
        expBean.y = enemyCenterY;
        this.app.stage.addChild(expBean);
        this.expBeans.push(expBean);

        // 创建击中效果
        this.createHitEffect(enemyCenterX, enemyCenterY);
      }
    });
  }

  // 线段与圆的碰撞检测
  private lineCircleIntersection(x1: number, y1: number, x2: number, y2: number, cx: number, cy: number, radius: number): boolean {
    // 计算线段的向量
    const dx = x2 - x1;
    const dy = y2 - y1;

    // 计算线段的长度
    const length = Math.sqrt(dx * dx + dy * dy);

    // 归一化向量
    const ux = dx / length;
    const uy = dy / length;

    // 计算线段上离圆心最近的点
    const t = Math.max(0, Math.min(length, (cx - x1) * ux + (cy - y1) * uy));

    // 计算最近点的坐标
    const closestX = x1 + ux * t;
    const closestY = y1 + uy * t;

    // 计算最近点到圆心的距离
    const distance = Math.sqrt((closestX - cx) ** 2 + (closestY - cy) ** 2);

    // 检查距离是否小于半径
    return distance <= radius;
  }

  // 创建击中效果
  private createHitEffect(x: number, y: number) {
    const effect = new PIXI.Graphics();
    effect.x = x;
    effect.y = y;
    effect.zIndex = 25;
    effect.scale.set(1);
    effect.alpha = 1;
    this.app.stage.addChild(effect);
    this.hitEffects.push(effect);
  }

  // 更新击中效果
  private updateHitEffects() {
    this.hitEffects.forEach((effect, index) => {
      effect.clear();
      effect.lineStyle(2, 0xFFFFFF, effect.alpha);
      effect.drawCircle(0, 0, 20 * effect.scale.x);

      // 缩小并淡出
      effect.scale.set(effect.scale.x * 0.95);
      effect.alpha *= 0.9;

      // 移除完成的效果
      if (effect.alpha < 0.1) {
        this.app.stage.removeChild(effect);
        this.hitEffects.splice(index, 1);
      }
    });
  }

  // 获取激光激活状态
  public getIsActive(): boolean {
    return this.isActive;
  }

  // 获取玩家速度修正值
  public getPlayerSpeedModifier(): number {
    return this.isActive ? laserConfig.playerSpeedReduction : 1;
  }

  // 获取激光伤害值
  public getDamage(): number {
    return laserConfig.damage;
  }

  // 设置激光伤害值
  public setDamage(damage: number) {
    laserConfig.damage = damage;
  }
}
