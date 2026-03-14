import { Howl, Howler } from 'howler';

// 音效配置
const soundConfig = {
  mow: {
    src: ["data:audio/wav;base64,UklGRl9vT19XQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YTdvT18AZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAABfX19f"],
    volume: 1.0,
    poolSize: 10 // 最多10个实例
  },
  levelUp: {
    src: ["data:audio/wav;base64,UklGRl9vT19XQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YTdvT18AZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAABfX19f"],
    volume: 1.0,
    poolSize: 5 // 最多5个实例
  }
};

// 音效池项接口
interface SoundPoolItem {
  sound: Howl;
  isPlaying: boolean;
}

// 音效池接口
interface SoundPool {
  [key: string]: SoundPoolItem[];
}

export class SoundManager {
  private static instance: SoundManager;
  private soundPool: SoundPool = {};
  private masterVolume: number = 1.0;

  // 私有构造函数
  private constructor() {
    // 从 localStorage 加载音量偏好
    const savedVolume = localStorage.getItem('gameVolume');
    if (savedVolume) {
      this.masterVolume = parseFloat(savedVolume);
      Howler.volume(this.masterVolume);
    }

    // 初始化音效池
    this.initSoundPool();
  }

  // 获取单例实例
  public static getInstance(): SoundManager {
    if (!SoundManager.instance) {
      SoundManager.instance = new SoundManager();
    }
    return SoundManager.instance;
  }

  // 初始化音效池
  private initSoundPool() {
    Object.keys(soundConfig).forEach(key => {
      const config = soundConfig[key as keyof typeof soundConfig];
      this.soundPool[key] = [];

      // 创建指定数量的音效实例
      for (let i = 0; i < config.poolSize; i++) {
        const sound = new Howl({
          src: config.src,
          volume: config.volume,
          html5: false
        });

        // 监听播放结束事件
        sound.on('end', () => {
          const poolItem = this.soundPool[key].find(item => item.sound === sound);
          if (poolItem) {
            poolItem.isPlaying = false;
          }
        });

        this.soundPool[key].push({ sound, isPlaying: false });
      }
    });
  }

  // 播放音效
  public playSound(key: string) {
    const pool = this.soundPool[key];
    if (!pool) {
      console.warn(`Sound ${key} not found`);
      return;
    }

    // 找到第一个未在播放的音效实例
    let availableItem = pool.find(item => !item.isPlaying);

    // 如果没有可用实例，使用第一个实例（循环利用）
    if (!availableItem) {
      availableItem = pool[0];
      // 停止当前播放
      if (availableItem.isPlaying) {
        availableItem.sound.stop();
      }
    }

    // 播放音效
    availableItem.sound.play();
    availableItem.isPlaying = true;
  }

  // 设置主音量
  public setVolume(volume: number) {
    this.masterVolume = Math.max(0, Math.min(1, volume));
    Howler.volume(this.masterVolume);
    // 保存到 localStorage
    localStorage.setItem('gameVolume', this.masterVolume.toString());
  }

  // 获取主音量
  public getVolume(): number {
    return this.masterVolume;
  }

  // 静音
  public mute() {
    Howler.mute(true);
  }

  // 取消静音
  public unmute() {
    Howler.mute(false);
  }

  // 获取静音状态
  public isMuted(): boolean {
    return Howler.mute();
  }
}

// 导出单例实例
export const soundManager = SoundManager.getInstance();
