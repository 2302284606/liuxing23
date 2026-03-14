import * as PIXI from 'pixi.js';
import nipplejs from 'nipplejs';
import { Howl, Howler } from 'howler';
import { LaserScanner } from './weapon';
import { soundManager } from './soundManager';

// 游戏配置
const config = {
  playerSpeed: 5,
  enemySpeed: 2,
  bulletSpeed: 10,
  grassSize: 50,
  spawnInterval: 1500, // 敌人每1.5秒生成一次
  shootInterval: 800,   // 每0.8秒射击一次
  grassColor: 0x81C784, // 淡绿色草
  mowedColor: 0x4CAF50, // 深绿色（割过的草）
  playerColor: 0x00FF00, // 绿色玩家
  enemyColor: 0xFF0000,  // 红色敌人
  bulletColor: 0xFFFFFF, // 白色子弹
  expColor: 0xFFFF00,    // 黄色经验豆
  swordColor: 0x00FFFF,  // 青色飞剑
  levelUpThreshold: 10,  // 升级阈值
};

// 游戏状态
const gameState = {
  experience: 0,
  level: 0,
  swords: [],
  swordCount: 0,
  swordSpeed: 0.05,
  swordRadius: 80,
  isPaused: false,
  isSettingsOpen: false,
  // 设置状态
  settings: {
    showDamageNumbers: true,
    lowQualityMode: false,
    mute: false,
    bgmVolume: 1.0,
    sfxVolume: 1.0
  }
};

// 游戏对象
let app: PIXI.Application;
let player: PIXI.Graphics;
let grass: PIXI.Graphics[][];
let enemies: PIXI.Graphics[] = [];
let bullets: PIXI.Graphics[] = [];
let expBeans: PIXI.Graphics[] = [];
let moveDirection = { x: 0, y: 0 };
let lastSpawnTime = 0;
let lastShootTime = 0;
let laserScanner: LaserScanner;

// 这是一个极短的 Base64 叮声，确保 100% 能响
const TING_BASE64 = "data:audio/wav;base64,UklGRl9vT19XQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YTdvT18AZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAABfX19f";

// 强制设置 HTML5 模式
Howler.html5 = false;

// 显式设置音量
Howler.volume(1.0);



// 飞剑类
class Sword {
  graphics: PIXI.Graphics;
  angle: number;

  constructor(angle: number) {
    this.angle = angle;
    this.graphics = new PIXI.Graphics();
    this.draw();
    this.graphics.zIndex = 15;
    app.stage.addChild(this.graphics);
    console.log('Sword created with angle:', angle);
  }

  draw() {
    this.graphics.clear();
    // 绘制青色长方形，带有透明度
    this.graphics.beginFill(config.swordColor, 0.8);
    this.graphics.drawRect(-20, -5, 40, 10);
    this.graphics.endFill();
  }

  update() {
    // 每一帧更新角度和位置
    this.angle += gameState.swordSpeed;
    const orbitRadius = gameState.swordRadius;
    
    // 计算飞剑位置
    this.graphics.x = player.x + Math.cos(this.angle) * orbitRadius;
    this.graphics.y = player.y + Math.sin(this.angle) * orbitRadius;
    
    // 让剑尖始终指向旋转方向
    this.graphics.rotation = this.angle;
  }

  checkCollision() {
    const bounds = this.graphics.getBounds();
    enemies.forEach((enemy, index) => {
      if (isColliding(this.graphics, enemy)) {
        // 移除敌人
        app.stage.removeChild(enemy);
        enemies.splice(index, 1);

        // 播放音效
        soundManager.playSound('mow');
        console.log('Sound Playing! - Mow');

        // 生成经验豆
        const expBean = new PIXI.Graphics();
        expBean.beginFill(config.expColor);
        expBean.drawRect(-5, -5, 10, 10);
        expBean.endFill();
        expBean.x = enemy.x;
        expBean.y = enemy.y;
        app.stage.addChild(expBean);
        expBeans.push(expBean);
      }
    });
  }
}

// 创建开始按钮
const createStartButton = () => {
  // 添加全局样式
  const style = document.createElement('style');
  style.textContent = `
    #start-button {
      position: fixed;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      padding: 20px 40px;
      font-size: 24px;
      backgroundColor: rgba(0, 255, 0, 0.8);
      color: white;
      border: none;
      border-radius: 10px;
      cursor: pointer;
      z-index: 10000;
    }
    
    canvas {
      position: fixed;
      top: 0;
      left: 0;
      z-index: 0;
    }
    
    .nipplejs-container {
      z-index: 1000;
    }
    
    #level-up-mask {
      z-index: 2000;
    }
    
    #audio-status {
      z-index: 1000;
    }
  `;
  document.head.appendChild(style);

  // 创建开始按钮
  const button = document.createElement('button');
  button.textContent = '点击开始游戏';
  button.id = 'start-button';
  
  button.addEventListener('click', async () => {
    // 解锁音频
    if (Howler.ctx && Howler.ctx.state === 'suspended') {
      Howler.ctx.resume().then(() => {
        console.log('Audio Context Resumed via Button!');
        // 播放测试音效
        soundManager.playSound('mow');
        console.log('Test sound played!');
      });
    } else {
      // 即使音频已激活，也播放测试音效
      soundManager.playSound('mow');
      console.log('Test sound played!');
    }

    // 隐藏开始按钮
    button.style.display = 'none';

    // 初始化 PixiJS
    await initPixi();
  });
  
  document.body.appendChild(button);
};

// 创建状态显示文本框
const createStatusDisplay = () => {
  const statusDiv = document.createElement('div');
  statusDiv.style.position = 'fixed';
  statusDiv.style.top = '10px';
  statusDiv.style.left = '10px';
  statusDiv.style.backgroundColor = 'rgba(0, 0, 0, 0.7)';
  statusDiv.style.color = 'white';
  statusDiv.style.padding = '10px';
  statusDiv.style.borderRadius = '5px';
  statusDiv.style.fontFamily = 'monospace';
  statusDiv.style.fontSize = '12px';
  statusDiv.style.zIndex = '1000';
  statusDiv.id = 'audio-status';
  document.body.appendChild(statusDiv);
  
  // 创建静音按钮
  const muteButton = document.createElement('button');
  muteButton.textContent = '🔊';
  muteButton.style.position = 'fixed';
  muteButton.style.top = '10px';
  muteButton.style.right = '10px';
  muteButton.style.width = '40px';
  muteButton.style.height = '40px';
  muteButton.style.borderRadius = '50%';
  muteButton.style.border = 'none';
  muteButton.style.backgroundColor = 'rgba(255, 255, 255, 0.2)';
  muteButton.style.color = 'white';
  muteButton.style.fontSize = '20px';
  muteButton.style.cursor = 'pointer';
  muteButton.style.zIndex = '1000';
  muteButton.style.display = 'flex';
  muteButton.style.alignItems = 'center';
  muteButton.style.justifyContent = 'center';
  document.body.appendChild(muteButton);
  
  // 静音状态
  let isMuted = false;
  
  // 静音按钮点击事件
  muteButton.addEventListener('click', () => {
    isMuted = !isMuted;
    Howler.volume(isMuted ? 0 : 1.0);
    muteButton.textContent = isMuted ? '🔇' : '🔊';
    console.log('Mute status:', isMuted);
  });
  
  // 更新状态
  const updateStatus = () => {
    const howlerState = Howler.ctx ? Howler.ctx.state : 'No Howler Context';
    const audioContextState = typeof AudioContext !== 'undefined' ? new AudioContext().state : 'No Audio Context';
    const muteStatus = isMuted ? 'Muted' : 'Unmuted';
    statusDiv.innerHTML = `
      Howler State: ${howlerState}<br>
      Audio Context State: ${audioContextState}<br>
      Mute: ${muteStatus}<br>
      Experience: ${gameState.experience}<br>
      Level: ${gameState.level}<br>
      Swords: ${gameState.swordCount}
    `;
  };
  
  updateStatus();
  setInterval(updateStatus, 1000);
};

// 初始化 PixiJS
async function initPixi() {
  // 初始化 PixiJS (适配 v7 和 v8)
  app = new PIXI.Application();
  await app.init({ background: '#2d5a27', resizeTo: window });
  
  // 添加 canvas 到 DOM
  document.body.appendChild(app.canvas);

  // 创建玩家
  createPlayer();

  // 创建草地
  createGrass();

  // 创建摇杆
  createJoystick();

  // 初始化状态显示
  createStatusDisplay();

  // 初始化激光武器
  laserScanner = new LaserScanner(app, player, enemies, expBeans);

  // 游戏主循环
  app.ticker.add(gameLoop);
  
  // 初始化测试按钮
  initTestButtons();
  
  // 创建设置菜单
  createSettingsMenu();
}

// 创建玩家
function createPlayer() {
  player = new PIXI.Graphics();
  player.beginFill(config.playerColor);
  player.drawRect(-25, -25, 50, 50); // 定义形状
  player.endFill();
  player.x = app.screen.width / 2;
  player.y = app.screen.height / 2;
  app.stage.sortableChildren = true;
  player.zIndex = 10;
  app.stage.addChild(player);
  console.log('Player created at:', player.x, player.y);
  console.log('Player color:', config.playerColor);
}

// 创建草地
function createGrass() {
  grass = [];
  const rows = Math.ceil(app.screen.height / config.grassSize);
  const cols = Math.ceil(app.screen.width / config.grassSize);

  for (let i = 0; i < rows; i++) {
    grass[i] = [];
    for (let j = 0; j < cols; j++) {
      const grassTile = new PIXI.Graphics();
      grassTile.beginFill(config.grassColor);
      grassTile.drawRect(j * config.grassSize, i * config.grassSize, config.grassSize, config.grassSize);
      grassTile.endFill();
      app.stage.addChildAt(grassTile, 0); // 放在最底层
      grass[i][j] = grassTile;
    }
  }
}

// 创建摇杆
function createJoystick() {
  const joystick = nipplejs.create({
    zone: document.body,
    mode: 'dynamic',
    size: 100,
    color: 'white',
    opacity: 0.5,
    dynamicPage: true,
  });

  // 初始隐藏摇杆
  const joystickElement = document.querySelector('.nipplejs-container');
  if (joystickElement) {
    joystickElement.style.display = 'none';
  }

  // 手指按下时显示摇杆并解锁音频
  joystick.on('start', () => {
    // 如果设置面板打开，不处理
    if (gameState.isSettingsOpen) return;
    
    // 解锁音频上下文
    if (Howler.ctx && Howler.ctx.state === 'suspended') {
      Howler.ctx.resume();
      console.log('Audio context resumed');
    }
    
    const joystickElement = document.querySelector('.nipplejs-container');
    if (joystickElement) {
      joystickElement.style.display = 'block';
    }
  });

  // 手指抬起时隐藏摇杆
  joystick.on('end', () => {
    // 如果设置面板打开，不处理
    if (gameState.isSettingsOpen) return;
    
    const joystickElement = document.querySelector('.nipplejs-container');
    if (joystickElement) {
      joystickElement.style.display = 'none';
    }
    moveDirection.x = 0;
    moveDirection.y = 0;
  });

  joystick.on('move', (_: any, data: any) => {
    // 如果设置面板打开，不处理
    if (gameState.isSettingsOpen) return;
    
    moveDirection.x = data.vector.x;
    moveDirection.y = data.vector.y;
  });
}

// 创建升级选择界面
const createLevelUpUI = () => {
  // 暂停游戏
  app.ticker.stop();
  gameState.isPaused = true;

  // 创建遮罩层
  const mask = document.createElement('div');
  mask.style.position = 'fixed';
  mask.style.top = '0';
  mask.style.left = '0';
  mask.style.width = '100%';
  mask.style.height = '100%';
  mask.style.backgroundColor = 'rgba(0, 0, 0, 0.8)';
  mask.style.display = 'flex';
  mask.style.justifyContent = 'center';
  mask.style.alignItems = 'center';
  mask.style.zIndex = '2000';
  mask.id = 'level-up-mask';

  // 创建技能卡容器
  const cardContainer = document.createElement('div');
  cardContainer.style.display = 'flex';
  cardContainer.style.gap = '20px';
  cardContainer.style.padding = '20px';

  // 创建技能卡
  const createCard = (title: string, description: string, effect: () => void) => {
    const card = document.createElement('div');
    card.style.backgroundColor = 'rgba(255, 255, 255, 0.9)';
    card.style.padding = '20px';
    card.style.borderRadius = '10px';
    card.style.width = '200px';
    card.style.textAlign = 'center';
    card.style.cursor = 'pointer';
    card.style.transition = 'transform 0.2s';

    card.innerHTML = `
      <h3 style="margin-top: 0;">${title}</h3>
      <p>${description}</p>
    `;

    card.addEventListener('mouseenter', () => {
      card.style.transform = 'scale(1.05)';
    });

    card.addEventListener('mouseleave', () => {
      card.style.transform = 'scale(1)';
    });

    card.addEventListener('click', () => {
      // 解锁音频
      if (Howler.ctx && Howler.ctx.state === 'suspended') {
        Howler.ctx.resume();
      }
      // 应用效果
      effect();
      // 播放升级音效
      soundManager.playSound('levelUp');
      console.log('Sound Playing! - Level Up');
      // 移除遮罩
      document.body.removeChild(mask);
      // 恢复游戏
      app.ticker.start();
      gameState.isPaused = false;
    });

    return card;
  };

  // 技能卡 A：增加飞剑
  const cardA = createCard(
    '增加飞剑',
    '添加一把环绕飞剑',
    () => {
      gameState.swordCount++;
      const angle = (gameState.swords.length * Math.PI * 2) / gameState.swordCount;
      gameState.swords.push(new Sword(angle));
    }
  );

  // 技能卡 B：飞剑增速
  const cardB = createCard(
    '飞剑增速',
    '提高飞剑旋转速度',
    () => {
      gameState.swordSpeed += 0.02;
    }
  );

  // 技能卡 C：扩大范围
  const cardC = createCard(
    '扩大范围',
    '增加飞剑旋转半径',
    () => {
      gameState.swordRadius += 20;
    }
  );

  // 添加卡片到容器
  cardContainer.appendChild(cardA);
  cardContainer.appendChild(cardB);
  cardContainer.appendChild(cardC);

  // 添加容器到遮罩
  mask.appendChild(cardContainer);

  // 添加遮罩到页面
  document.body.appendChild(mask);
};

// 游戏主循环
function gameLoop(delta: number) {
  if (gameState.isPaused || gameState.isSettingsOpen) return;

  // 调试日志
  if (Math.random() < 0.1) { // 每10帧打印一次
    console.log('Rendering...');
    if (player) {
      console.log('Player position:', player.x, player.y);
      console.log('Player visible:', player.visible);
    }
  }

  // 移动玩家
  movePlayer();

  // 割草
  mowGrass();

  // 生成敌人
  spawnEnemies();

  // 移动敌人
  moveEnemies();

  // 自动射击
  autoShoot();

  // 移动子弹
  moveBullets();

  // 移动飞剑
  moveSwords();

  // 碰撞检测
  checkCollisions();

  // 移动经验豆
  moveExpBeans();

  // 检查升级
  checkLevelUp();

  // 更新激光武器
  laserScanner.update();
}

// 移动玩家
function movePlayer() {
  // 考虑激光激活时的速度降低
  const speedModifier = laserScanner.getPlayerSpeedModifier();
  player.x += moveDirection.x * config.playerSpeed * speedModifier;
  player.y += moveDirection.y * config.playerSpeed * speedModifier;

  // 边界检查
  player.x = Math.max(25, Math.min(app.screen.width - 25, player.x));
  player.y = Math.max(25, Math.min(app.screen.height - 25, player.y));
}

// 割草
function mowGrass() {
  const rows = grass.length;
  const cols = grass[0].length;

  for (let i = 0; i < rows; i++) {
    for (let j = 0; j < cols; j++) {
      const grassTile = grass[i][j];
      const grassBounds = grassTile.getBounds();

      // 检查玩家是否与草块重叠
      if (player.getBounds().x < grassBounds.x + grassBounds.width &&
          player.getBounds().x + player.getBounds().width > grassBounds.x &&
          player.getBounds().y < grassBounds.y + grassBounds.height &&
          player.getBounds().y + player.getBounds().height > grassBounds.y) {
        grassTile.clear();
        grassTile.beginFill(config.mowedColor);
        grassTile.drawRect(j * config.grassSize, i * config.grassSize, config.grassSize, config.grassSize);
        grassTile.endFill();
      }
    }
  }
}

// 生成敌人
function spawnEnemies() {
  const now = Date.now();
  if (now - lastSpawnTime > config.spawnInterval) {
    lastSpawnTime = now;

    const enemy = new PIXI.Graphics();
enemy.beginFill(config.enemyColor);
enemy.drawRect(-20, -20, 40, 40);
enemy.endFill();
enemy.zIndex = 5;

    // 从屏幕外随机位置生成
    const side = Math.floor(Math.random() * 4); // 0: 上, 1: 右, 2: 下, 3: 左
    console.log('Spawning enemy from side:', side);
    
    switch (side) {
      case 0: // 上
        enemy.x = Math.random() * app.screen.width;
        enemy.y = -50;
        console.log('Enemy position:', enemy.x, enemy.y);
        break;
      case 1: // 右
        enemy.x = app.screen.width + 50;
        enemy.y = Math.random() * app.screen.height;
        console.log('Enemy position:', enemy.x, enemy.y);
        break;
      case 2: // 下
        enemy.x = Math.random() * app.screen.width;
        enemy.y = app.screen.height + 50;
        console.log('Enemy position:', enemy.x, enemy.y);
        break;
      case 3: // 左
        enemy.x = -50;
        enemy.y = Math.random() * app.screen.height;
        console.log('Enemy position:', enemy.x, enemy.y);
        break;
    }

    app.stage.addChild(enemy);
    enemies.push(enemy);
    console.log('Enemy added. Total enemies:', enemies.length);
  }
}

// 测试函数：生成一排敌人
function spawnTestEnemies() {
  // 清空现有敌人
  enemies.forEach(enemy => app.stage.removeChild(enemy));
  enemies = [];
  
  // 生成一排敌人
  const count = 10;
  const startX = 100;
  const startY = app.screen.height / 2;
  const spacing = 80;
  
  for (let i = 0; i < count; i++) {
    const enemy = new PIXI.Graphics();
enemy.beginFill(config.enemyColor);
enemy.drawRect(-20, -20, 40, 40);
enemy.endFill();
enemy.zIndex = 5;
    enemy.x = startX + i * spacing;
    enemy.y = startY;
    app.stage.addChild(enemy);
    enemies.push(enemy);
  }
  
  console.log('Test enemies spawned. Total:', enemies.length);
}

// 测试函数：生成大量敌人
function spawnManyEnemies() {
  // 清空现有敌人
  enemies.forEach(enemy => app.stage.removeChild(enemy));
  enemies = [];
  
  // 生成100个敌人
  const count = 100;
  
  for (let i = 0; i < count; i++) {
    const enemy = new PIXI.Graphics();
enemy.beginFill(config.enemyColor);
enemy.drawRect(-20, -20, 40, 40);
enemy.endFill();
enemy.zIndex = 5;
    enemy.x = Math.random() * app.screen.width;
    enemy.y = Math.random() * app.screen.height;
    app.stage.addChild(enemy);
    enemies.push(enemy);
  }
  
  console.log('Many enemies spawned. Total:', enemies.length);
}

// 添加测试按钮
function addTestButtons() {
  // 创建测试按钮容器
  const testContainer = document.createElement('div');
  testContainer.style.position = 'fixed';
  testContainer.style.top = '10px';
  testContainer.style.right = '10px';
  testContainer.style.zIndex = '1000';
  testContainer.style.display = 'flex';
  testContainer.style.flexDirection = 'column';
  testContainer.style.gap = '10px';
  
  // 生成测试敌人按钮
  const testButton = document.createElement('button');
  testButton.textContent = '生成测试敌人';
  testButton.style.padding = '10px';
  testButton.style.backgroundColor = 'rgba(255, 0, 0, 0.8)';
  testButton.style.color = 'white';
  testButton.style.border = 'none';
  testButton.style.borderRadius = '5px';
  testButton.style.cursor = 'pointer';
  testButton.addEventListener('click', spawnTestEnemies);
  
  // 生成大量敌人按钮
  const manyButton = document.createElement('button');
  manyButton.textContent = '生成100个敌人';
  manyButton.style.padding = '10px';
  manyButton.style.backgroundColor = 'rgba(255, 165, 0, 0.8)';
  manyButton.style.color = 'white';
  manyButton.style.border = 'none';
  manyButton.style.borderRadius = '5px';
  manyButton.style.cursor = 'pointer';
  manyButton.addEventListener('click', spawnManyEnemies);
  
  // 添加到容器
  testContainer.appendChild(testButton);
  testContainer.appendChild(manyButton);
  
  // 添加到页面
  document.body.appendChild(testContainer);
}

// 在游戏初始化时添加测试按钮
function initTestButtons() {
  setTimeout(addTestButtons, 1000);
}

// 移动敌人
function moveEnemies() {
  enemies.forEach(enemy => {
    // 计算敌人向玩家移动的方向
    const dx = player.x - enemy.x;
    const dy = player.y - enemy.y;
    const distance = Math.sqrt(dx * dx + dy * dy);

    if (distance > 0) {
      enemy.x += (dx / distance) * config.enemySpeed;
      enemy.y += (dy / distance) * config.enemySpeed;
    }
  });
}

// 自动射击
function autoShoot() {
  const now = Date.now();
  if (now - lastShootTime > config.shootInterval && enemies.length > 0) {
    lastShootTime = now;

    // 找到最近的敌人
    let closestEnemy = enemies[0];
    let closestDistance = Infinity;

    enemies.forEach(enemy => {
      const dx = enemy.x - player.x;
      const dy = enemy.y - player.y;
      const distance = Math.sqrt(dx * dx + dy * dy);

      if (distance < closestDistance) {
        closestDistance = distance;
        closestEnemy = enemy;
      }
    });

    // 向最近的敌人射击
    const bullet = new PIXI.Graphics();
    bullet.beginFill(config.bulletColor);
    bullet.drawCircle(0, 0, 5);
    bullet.endFill();
    bullet.x = player.x;
    bullet.y = player.y;

    // 计算子弹方向
    const dx = closestEnemy.x - player.x;
    const dy = closestEnemy.y - player.y;
    const distance = Math.sqrt(dx * dx + dy * dy);

    if (distance > 0) {
      bullet.direction = {
        x: (dx / distance) * config.bulletSpeed,
        y: (dy / distance) * config.bulletSpeed
      };
    }

    app.stage.addChild(bullet);
    bullets.push(bullet);
  }
}

// 移动子弹
function moveBullets() {
  bullets.forEach((bullet, index) => {
    if (bullet.direction) {
      bullet.x += bullet.direction.x;
      bullet.y += bullet.direction.y;
    }

    // 移除屏幕外的子弹
    if (bullet.x < 0 || bullet.x > app.screen.width || bullet.y < 0 || bullet.y > app.screen.height) {
      app.stage.removeChild(bullet);
      bullets.splice(index, 1);
    }
  });
}

// 移动飞剑
function moveSwords() {
  gameState.swords.forEach(sword => {
    sword.update();
    sword.checkCollision();
  });
  console.log('Swords updated. Total swords:', gameState.swords.length);
}

// 碰撞检测
function checkCollisions() {
  // 子弹与敌人碰撞
  bullets.forEach((bullet, bulletIndex) => {
    enemies.forEach((enemy, enemyIndex) => {
      if (isColliding(bullet, enemy)) {
        // 移除子弹和敌人
        app.stage.removeChild(bullet);
        app.stage.removeChild(enemy);
        bullets.splice(bulletIndex, 1);
        enemies.splice(enemyIndex, 1);

        // 播放割草音效
        soundManager.playSound('mow');
        console.log('Sound Playing! - Mow');

        // 生成经验豆
        const expBean = new PIXI.Graphics();
        expBean.beginFill(config.expColor);
        expBean.drawCircle(0, 0, 10);
        expBean.endFill();
        expBean.x = enemy.x;
        expBean.y = enemy.y;
        app.stage.addChild(expBean);
        expBeans.push(expBean);
      }
    });
  });

  // 玩家与经验豆碰撞
  expBeans.forEach((bean, index) => {
    if (isColliding(player, bean)) {
      // 移除经验豆
      app.stage.removeChild(bean);
      expBeans.splice(index, 1);

      // 增加经验值
      gameState.experience++;
      console.log(`经验值: ${gameState.experience}`);

      // 播放升级音效
      soundManager.playSound('levelUp');
      console.log('Sound Playing! - Level Up');
    }
  });
}

// 移动经验豆（可以添加一些简单的动画效果）
function moveExpBeans() {
  expBeans.forEach(bean => {
    // 简单的上下浮动效果
    bean.y += Math.sin(Date.now() * 0.005) * 0.5;
  });
}

// 检查升级
function checkLevelUp() {
  if (gameState.experience >= (gameState.level + 1) * config.levelUpThreshold) {
    gameState.level++;
    createLevelUpUI();
  }
}

// 碰撞检测函数
function isColliding(obj1: PIXI.Graphics, obj2: PIXI.Graphics) {
  const bounds1 = obj1.getBounds();
  const bounds2 = obj2.getBounds();

  return bounds1.x < bounds2.x + bounds2.width &&
         bounds1.x + bounds1.width > bounds2.x &&
         bounds1.y < bounds2.y + bounds2.height &&
         bounds1.y + bounds1.height > bounds2.y;
}

// 创建设置菜单
function createSettingsMenu() {
  // 创建设置按钮
  const settingsButton = document.createElement('button');
  settingsButton.innerHTML = '⚙️';
  settingsButton.style.cssText = `
    position: fixed;
    bottom: 20px;
    right: 20px;
    width: 50px;
    height: 50px;
    border-radius: 50%;
    border: none;
    background: rgba(255, 255, 255, 0.2);
    color: white;
    font-size: 24px;
    cursor: pointer;
    z-index: 1000;
    transition: transform 0.2s ease;
  `;
  
  // 鼠标悬停效果
  settingsButton.addEventListener('mouseenter', () => {
    settingsButton.style.transform = 'scale(1.1)';
  });
  
  settingsButton.addEventListener('mouseleave', () => {
    settingsButton.style.transform = 'scale(1)';
  });
  
  // 创建背景遮罩
  const overlay = document.createElement('div');
  overlay.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background: rgba(0, 0, 0, 0.5);
    z-index: 998;
    display: none;
  `;
  
  // 创建设置面板
  const settingsPanel = document.createElement('div');
  settingsPanel.style.cssText = `
    position: fixed;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    background: rgba(0, 0, 0, 0.9);
    padding: 25px;
    border-radius: 15px;
    color: white;
    font-family: Arial, sans-serif;
    z-index: 999;
    display: none;
    flex-direction: column;
    gap: 20px;
    min-width: 300px;
    max-width: 400px;
    box-shadow: 0 0 30px rgba(0, 255, 0, 0.3);
  `;
  settingsPanel.classList.add('settings-panel');
  
  // 面板标题
  const panelTitle = document.createElement('div');
  panelTitle.style.cssText = `
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 10px;
  `;
  
  const titleText = document.createElement('h3');
  titleText.innerText = '设置';
  titleText.style.margin = '0';
  titleText.style.fontSize = '18px';
  titleText.style.color = '#00FF00';
  
  // 关闭按钮
  const closeButton = document.createElement('button');
  closeButton.innerHTML = '✕';
  closeButton.style.cssText = `
    background: none;
    border: none;
    color: white;
    font-size: 20px;
    cursor: pointer;
    padding: 5px;
    border-radius: 50%;
    width: 30px;
    height: 30px;
    display: flex;
    align-items: center;
    justify-content: center;
  `;
  
  closeButton.addEventListener('click', (e) => {
    e.stopPropagation();
    closeSettingsPanel();
  });
  
  panelTitle.appendChild(titleText);
  panelTitle.appendChild(closeButton);
  settingsPanel.appendChild(panelTitle);
  
  // 游戏控制组
  const gameControlsSection = document.createElement('div');
  gameControlsSection.style.cssText = `
    border-top: 1px solid rgba(255, 255, 255, 0.2);
    padding-top: 15px;
  `;
  
  const gameControlsTitle = document.createElement('h4');
  gameControlsTitle.innerText = '游戏控制';
  gameControlsTitle.style.margin = '0 0 15px 0';
  gameControlsTitle.style.fontSize = '14px';
  gameControlsTitle.style.color = '#00FF00';
  gameControlsSection.appendChild(gameControlsTitle);
  
  // 暂停/恢复按钮
  const pauseButton = document.createElement('button');
  pauseButton.innerText = '暂停';
  pauseButton.style.cssText = `
    padding: 8px 16px;
    background: rgba(255, 255, 255, 0.2);
    border: 1px solid rgba(255, 255, 255, 0.3);
    color: white;
    border-radius: 5px;
    cursor: pointer;
    margin-right: 10px;
    transition: background 0.2s;
  `;
  
  pauseButton.addEventListener('click', () => {
    gameState.isPaused = !gameState.isPaused;
    pauseButton.innerText = gameState.isPaused ? '恢复' : '暂停';
    if (gameState.isPaused) {
      app.ticker.stop();
    } else {
      app.ticker.start();
    }
  });
  
  // 重新开始按钮
  const restartButton = document.createElement('button');
  restartButton.innerText = '重新开始';
  restartButton.style.cssText = `
    padding: 8px 16px;
    background: rgba(255, 0, 0, 0.3);
    border: 1px solid rgba(255, 0, 0, 0.5);
    color: white;
    border-radius: 5px;
    cursor: pointer;
    transition: background 0.2s;
  `;
  
  restartButton.addEventListener('click', () => {
    // 重置游戏状态
    gameState.experience = 0;
    gameState.level = 0;
    gameState.swords = [];
    gameState.swordCount = 0;
    gameState.swordSpeed = 0.05;
    gameState.swordRadius = 80;
    gameState.isPaused = false;
    
    // 清理敌人和子弹
    enemies.forEach(enemy => app.stage.removeChild(enemy));
    enemies = [];
    bullets.forEach(bullet => app.stage.removeChild(bullet));
    bullets = [];
    expBeans.forEach(bean => app.stage.removeChild(bean));
    expBeans = [];
    
    // 重置玩家位置
    player.x = app.screen.width / 2;
    player.y = app.screen.height / 2;
    
    // 重新创建草地
    grass.forEach(row => row.forEach(tile => app.stage.removeChild(tile)));
    createGrass();
    
    // 确保游戏循环运行
    if (!app.ticker.started) {
      app.ticker.start();
    }
    
    pauseButton.innerText = '暂停';
  });
  
  const controlButtons = document.createElement('div');
  controlButtons.style.cssText = 'display: flex; gap: 10px;';
  controlButtons.appendChild(pauseButton);
  controlButtons.appendChild(restartButton);
  gameControlsSection.appendChild(controlButtons);
  settingsPanel.appendChild(gameControlsSection);
  
  // 视觉优化组
  const graphicsSection = document.createElement('div');
  graphicsSection.style.cssText = `
    border-top: 1px solid rgba(255, 255, 255, 0.2);
    padding-top: 15px;
  `;
  
  const graphicsTitle = document.createElement('h4');
  graphicsTitle.innerText = '视觉优化';
  graphicsTitle.style.margin = '0 0 15px 0';
  graphicsTitle.style.fontSize = '14px';
  graphicsTitle.style.color = '#00FF00';
  graphicsSection.appendChild(graphicsTitle);
  
  // 显示/隐藏伤害数字
  const damageNumbersControl = document.createElement('div');
  damageNumbersControl.style.cssText = `
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 10px;
  `;
  
  const damageNumbersLabel = document.createElement('span');
  damageNumbersLabel.innerText = '显示伤害数字';
  damageNumbersLabel.style.fontSize = '13px';
  
  const damageNumbersCheckbox = document.createElement('input');
  damageNumbersCheckbox.type = 'checkbox';
  damageNumbersCheckbox.checked = gameState.settings.showDamageNumbers;
  damageNumbersCheckbox.style.cursor = 'pointer';
  
  damageNumbersCheckbox.addEventListener('change', (e: any) => {
    gameState.settings.showDamageNumbers = e.target.checked;
    localStorage.setItem('showDamageNumbers', e.target.checked.toString());
  });
  
  damageNumbersControl.appendChild(damageNumbersLabel);
  damageNumbersControl.appendChild(damageNumbersCheckbox);
  graphicsSection.appendChild(damageNumbersControl);
  
  // 低画质模式
  const lowQualityControl = document.createElement('div');
  lowQualityControl.style.cssText = `
    display: flex;
    align-items: center;
    justify-content: space-between;
  `;
  
  const lowQualityLabel = document.createElement('span');
  lowQualityLabel.innerText = '低画质模式';
  lowQualityLabel.style.fontSize = '13px';
  
  const lowQualityCheckbox = document.createElement('input');
  lowQualityCheckbox.type = 'checkbox';
  lowQualityCheckbox.checked = gameState.settings.lowQualityMode;
  lowQualityCheckbox.style.cursor = 'pointer';
  
  lowQualityCheckbox.addEventListener('change', (e: any) => {
    gameState.settings.lowQualityMode = e.target.checked;
    localStorage.setItem('lowQualityMode', e.target.checked.toString());
  });
  
  lowQualityControl.appendChild(lowQualityLabel);
  lowQualityControl.appendChild(lowQualityCheckbox);
  graphicsSection.appendChild(lowQualityControl);
  settingsPanel.appendChild(graphicsSection);
  
  // 高级声音设置
  const audioSection = document.createElement('div');
  audioSection.style.cssText = `
    border-top: 1px solid rgba(255, 255, 255, 0.2);
    padding-top: 15px;
  `;
  
  const audioTitle = document.createElement('h4');
  audioTitle.innerText = '声音设置';
  audioTitle.style.margin = '0 0 15px 0';
  audioTitle.style.fontSize = '14px';
  audioTitle.style.color = '#00FF00';
  audioSection.appendChild(audioTitle);
  
  // 一键静音按钮
  const muteButton = document.createElement('button');
  muteButton.innerHTML = soundManager.isMuted() ? '🔇' : '🔊';
  muteButton.style.cssText = `
    width: 40px;
    height: 40px;
    border-radius: 50%;
    border: none;
    background: rgba(255, 255, 255, 0.2);
    color: white;
    font-size: 20px;
    cursor: pointer;
    margin-bottom: 15px;
  `;
  
  muteButton.addEventListener('click', () => {
    const isMuted = soundManager.toggleMute();
    muteButton.innerHTML = isMuted ? '🔇' : '🔊';
  });
  
  audioSection.appendChild(muteButton);
  
  // BGM 音量控制
  const bgmControl = document.createElement('div');
  bgmControl.style.cssText = `
    display: flex;
    flex-direction: column;
    gap: 5px;
    margin-bottom: 10px;
  `;
  
  const bgmLabel = document.createElement('div');
  bgmLabel.style.cssText = `
    display: flex;
    justify-content: space-between;
    align-items: center;
  `;
  
  const bgmText = document.createElement('span');
  bgmText.innerText = '背景音乐';
  bgmText.style.fontSize = '13px';
  
  const bgmValue = document.createElement('span');
  bgmValue.innerText = `${Math.round(soundManager.getBgmVolume() * 100)}%`;
  bgmValue.style.fontSize = '12px';
  bgmValue.style.width = '40px';
  
  bgmLabel.appendChild(bgmText);
  bgmLabel.appendChild(bgmValue);
  
  const bgmSlider = document.createElement('input');
  bgmSlider.type = 'range';
  bgmSlider.min = '0';
  bgmSlider.max = '100';
  bgmSlider.value = soundManager.getBgmVolume() * 100;
  bgmSlider.style.cursor = 'pointer';
  
  bgmSlider.oninput = (e: any) => {
    const val = e.target.value;
    bgmValue.innerText = `${val}%`;
    soundManager.setBgmVolume(val / 100);
  };
  
  bgmControl.appendChild(bgmLabel);
  bgmControl.appendChild(bgmSlider);
  audioSection.appendChild(bgmControl);
  
  // SFX 音量控制
  const sfxControl = document.createElement('div');
  sfxControl.style.cssText = `
    display: flex;
    flex-direction: column;
    gap: 5px;
  `;
  
  const sfxLabel = document.createElement('div');
  sfxLabel.style.cssText = `
    display: flex;
    justify-content: space-between;
    align-items: center;
  `;
  
  const sfxText = document.createElement('span');
  sfxText.innerText = '音效';
  sfxText.style.fontSize = '13px';
  
  const sfxValue = document.createElement('span');
  sfxValue.innerText = `${Math.round(soundManager.getSfxVolume() * 100)}%`;
  sfxValue.style.fontSize = '12px';
  sfxValue.style.width = '40px';
  
  sfxLabel.appendChild(sfxText);
  sfxLabel.appendChild(sfxValue);
  
  const sfxSlider = document.createElement('input');
  sfxSlider.type = 'range';
  sfxSlider.min = '0';
  sfxSlider.max = '100';
  sfxSlider.value = soundManager.getSfxVolume() * 100;
  sfxSlider.style.cursor = 'pointer';
  
  sfxSlider.oninput = (e: any) => {
    const val = e.target.value;
    sfxValue.innerText = `${val}%`;
    soundManager.setSfxVolume(val / 100);
  };
  
  sfxControl.appendChild(sfxLabel);
  sfxControl.appendChild(sfxSlider);
  audioSection.appendChild(sfxControl);
  settingsPanel.appendChild(audioSection);
  
  // 添加到页面
  document.body.appendChild(settingsButton);
  document.body.appendChild(overlay);
  document.body.appendChild(settingsPanel);
  
  // 关闭设置面板的函数
  function closeSettingsPanel() {
    settingsPanel.style.display = 'none';
    overlay.style.display = 'none';
    gameState.isSettingsOpen = false;
    // 移除模糊效果
    if (app.canvas) {
      app.canvas.style.filter = 'none';
    }
  }
  
  // 切换设置面板显示/隐藏
  settingsButton.addEventListener('click', (e) => {
    e.stopPropagation();
    const isOpen = settingsPanel.style.display === 'flex';
    
    if (isOpen) {
      closeSettingsPanel();
    } else {
      // 打开设置面板
      settingsPanel.style.display = 'flex';
      overlay.style.display = 'block';
      gameState.isSettingsOpen = true;
      // 添加模糊效果
      if (app.canvas) {
        app.canvas.style.filter = 'blur(5px)';
      }
    }
  });
  
  // 点击遮罩层关闭面板
  overlay.addEventListener('click', () => {
    closeSettingsPanel();
  });
  
  // 阻止设置面板的事件穿透
  const preventEventPropagation = (e: Event) => {
    e.stopPropagation();
  };
  
  settingsPanel.addEventListener('pointerdown', preventEventPropagation);
  settingsPanel.addEventListener('mousedown', preventEventPropagation);
  settingsPanel.addEventListener('touchstart', preventEventPropagation);
  settingsPanel.addEventListener('click', preventEventPropagation);
  
  // 从 localStorage 加载设置
  const loadSettings = () => {
    const savedShowDamageNumbers = localStorage.getItem('showDamageNumbers');
    if (savedShowDamageNumbers) {
      gameState.settings.showDamageNumbers = savedShowDamageNumbers === 'true';
      damageNumbersCheckbox.checked = gameState.settings.showDamageNumbers;
    }
    
    const savedLowQualityMode = localStorage.getItem('lowQualityMode');
    if (savedLowQualityMode) {
      gameState.settings.lowQualityMode = savedLowQualityMode === 'true';
      lowQualityCheckbox.checked = gameState.settings.lowQualityMode;
    }
  };
  
  // 加载设置
  loadSettings();
}

// 启动游戏
createStartButton();
