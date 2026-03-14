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
  energyConsumption: 20, // 每秒能量消耗
  energyRecovery: 10, // 每秒能量恢复
  maxEnergy: 100, // 最大能量
  damageInterval: 100, // 伤害判定间隔（毫秒）
  gridSize: 100, // 网格大小
};

// 网格接口
interface Grid {
  [key: string]: PIXI.Graphics[];
}

// 敌人接口
interface Enemy extends PIXI.Graphics {
  isPendingDestroy?: boolean;
  lastDamageTime?: number;
}

// 激光能量管理器类
export class LaserManager {
  private energy: number = laserConfig.maxEnergy;
  private isOverheated: boolean = false;
  private lastEnergyUpdate: number = Date.now();
  private energyBarElement: HTMLElement | null;
  private energyFillElement: HTMLElement | null;

  constructor() {
    // 获取能量条元素
    this.energyBarElement = document.querySelector('.energy-bar');
    this.energyFillElement = document.querySelector('.energy-fill');
    this.updateEnergyBar();
  }

  // 更新能量
  public update() {
    const now = Date.now();
    const deltaTime = (now - this.lastEnergyUpdate) / 1000; // 转换为秒
    this.lastEnergyUpdate = now;

    if (this.isOverheated) {
      // 检查是否恢复到满能量
      if (this.energy >= laserConfig.maxEnergy) {
        this.isOverheated = false;
      } else {
        // 恢复能量
        this.energy += laserConfig.energyRecovery * deltaTime;
        if (this.energy > laserConfig.maxEnergy) {
          this.energy = laserConfig.maxEnergy;
        }
      }
    }

    this.updateEnergyBar();
  }

  // 激活激光（消耗能量）
  public activate() {
    if (this.isOverheated || this.energy <= 0) {
      return false;
    }

    const now = Date.now();
    const deltaTime = (now - this.lastEnergyUpdate) / 1000;
    this.lastEnergyUpdate = now;

    // 消耗能量
    this.energy -= laserConfig.energyConsumption * deltaTime;
    if (this.energy <= 0) {
      this.energy = 0;
      this.isOverheated = true;
    }

    this.updateEnergyBar();
    return true;
  }

  // 恢复能量（不激活激光时）
  public recover() {
    if (this.isOverheated) {
      return;
    }

    const now = Date.now();
    const deltaTime = (now - this.lastEnergyUpdate) / 1000;
    this.lastEnergyUpdate = now;

    // 恢复能量
    this.energy += laserConfig.energyRecovery * deltaTime;
    if (this.energy > laserConfig.maxEnergy) {
      this.energy = laserConfig.maxEnergy;
    }

    this.updateEnergyBar();
  }

  // 更新能量条UI
  private updateEnergyBar() {
    if (this.energyFillElement) {
      const percentage = (this.energy / laserConfig.maxEnergy) * 100;
      this.energyFillElement.style.width = `${percentage}%`;
      
      // 处理过热状态
      if (this.isOverheated) {
        this.energyFillElement.classList.add('overheat');
      } else {
        this.energyFillElement.classList.remove('overheat');
      }
    }
  }

  // 获取能量值
  public getEnergy(): number {
    return this.energy;
  }

  // 获取是否过热
  public getIsOverheated(): boolean {
    return this.isOverheated;
  }

  // 获取玩家速度修正值
  public getPlayerSpeedModifier(): number {
    return 0.5; // 激光激活时移动速度降低
  }
}

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
  private laserManager: LaserManager;
  private grid: Grid = {};

  constructor(app: PIXI.Application, player: PIXI.Graphics, enemies: PIXI.Graphics[], expBeans: PIXI.Graphics[]) {
    this.app = app;
    this.player = player;
    this.enemies = enemies;
    this.expBeans = expBeans;
    this.targetPosition = { x: app.screen.width / 2, y: app.screen.height / 2 };
    this.laserManager = new LaserManager();

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
    // 更新激光能量
    if (this.isActive) {
      this.laserManager.activate();
    } else {
      this.laserManager.recover();
    }

    // 检查是否过热
    if (this.laserManager.getIsOverheated()) {
      this.clearLaser();
      return;
    }

    if (!this.isActive) {
      this.clearLaser();
      return;
    }

    // 绘制激光
    this.drawLaser();

    // 构建网格
    this.buildGrid();

    // 检测碰撞
    this.checkCollisions();

    // 更新击中效果
    this.updateHitEffects();
  }

  // 构建网格
  private buildGrid() {
    // 清空网格
    this.grid = {};

    // 将敌人分配到网格
    this.enemies.forEach(enemy => {
      const bounds = enemy.getBounds();
      const centerX = bounds.x + bounds.width / 2;
      const centerY = bounds.y + bounds.height / 2;

      // 计算网格坐标
      const gridX = Math.floor(centerX / laserConfig.gridSize);
      const gridY = Math.floor(centerY / laserConfig.gridSize);
      const gridKey = `${gridX},${gridY}`;

      // 将敌人添加到网格
      if (!this.grid[gridKey]) {
        this.grid[gridKey] = [];
      }
      this.grid[gridKey].push(enemy);
    });
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

    // 获取激光路径经过的网格
    const gridKeys = this.getGridKeysAlongLine(startX, startY, endX, endY);

    // 收集需要检测的敌人
    const enemiesToCheck: { enemy: PIXI.Graphics; index: number }[] = [];

    gridKeys.forEach(gridKey => {
      const gridEnemies = this.grid[gridKey];
      if (gridEnemies) {
        gridEnemies.forEach(enemy => {
          const index = this.enemies.indexOf(enemy);
          if (index !== -1) {
            enemiesToCheck.push({ enemy, index });
          }
        });
      }
    });

    // 逆序遍历敌人（从后往前）
    for (let i = enemiesToCheck.length - 1; i >= 0; i--) {
      const { enemy, index } = enemiesToCheck[i];
      const enemyBounds = enemy.getBounds();
      const enemyCenterX = enemyBounds.x + enemyBounds.width / 2;
      const enemyCenterY = enemyBounds.y + enemyBounds.height / 2;
      const enemyRadius = Math.min(enemyBounds.width, enemyBounds.height) / 2;

      // 检查是否在伤害间隔内
      const now = Date.now();
      const lastDamageTime = (enemy as Enemy).lastDamageTime || 0;
      if (now - lastDamageTime < laserConfig.damageInterval) {
        continue;
      }

      if (this.raycast(startX, startY, endX, endY, enemyCenterX, enemyCenterY, enemyRadius)) {
        // 标记敌人为待销毁
        (enemy as Enemy).isPendingDestroy = true;
        (enemy as Enemy).lastDamageTime = now;

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
    }

    // 统一清理待销毁的敌人
    this.cleanupEnemies();
  }

  // 获取激光路径经过的网格
  private getGridKeysAlongLine(x1: number, y1: number, x2: number, y2: number): string[] {
    const gridKeys = new Set<string>();
    
    const dx = Math.abs(x2 - x1);
    const dy = Math.abs(y2 - y1);
    const sx = x1 < x2 ? 1 : -1;
    const sy = y1 < y2 ? 1 : -1;
    let err = dx - dy;
    
    let x = x1;
    let y = y1;
    
    while (true) {
      const gridX = Math.floor(x / laserConfig.gridSize);
      const gridY = Math.floor(y / laserConfig.gridSize);
      gridKeys.add(`${gridX},${gridY}`);
      
      if (x === x2 && y === y2) break;
      
      const e2 = 2 * err;
      if (e2 > -dy) {
        err -= dy;
        x += sx;
      }
      if (e2 < dx) {
        err += dx;
        y += sy;
      }
    }
    
    return Array.from(gridKeys);
  }

  // 射线投射碰撞检测
  private raycast(x1: number, y1: number, x2: number, y2: number, cx: number, cy: number, radius: number): boolean {
    // 计算射线方向向量
    const dirX = x2 - x1;
    const dirY = y2 - y1;
    
    // 计算从射线起点到圆心的向量
    const distX = cx - x1;
    const distY = cy - y1;
    
    // 计算射线长度的平方
    const rayLengthSq = dirX * dirX + dirY * dirY;
    
    // 计算点积
    const dotProduct = distX * dirX + distY * dirY;
    
    // 计算投影点到射线起点的距离
    const t = Math.max(0, Math.min(dotProduct / rayLengthSq, 1));
    
    // 计算投影点
    const closestX = x1 + t * dirX;
    const closestY = y1 + t * dirY;
    
    // 计算投影点到圆心的距离
    const distanceSq = (closestX - cx) ** 2 + (closestY - cy) ** 2;
    
    return distanceSq <= radius * radius;
  }

  // 清理待销毁的敌人
  private cleanupEnemies() {
    for (let i = this.enemies.length - 1; i >= 0; i--) {
      const enemy = this.enemies[i];
      if ((enemy as Enemy).isPendingDestroy) {
        // 释放资源
        enemy.destroy({ children: true, texture: true });
        // 从数组中移除
        this.enemies.splice(i, 1);
      }
    }
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

  // 获取激光管理器
  public getLaserManager(): LaserManager {
    return this.laserManager;
  }
}
