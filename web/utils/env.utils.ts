/**
 * 环境检测工具类
 * 专门用于判断当前运行环境是否为浏览器环境 + 是PC端浏览器环境
 */
export class EnvUtils {
  /**
   * 判断当前环境是否为【PC端浏览器环境】
   * 整合了：浏览器环境判断 + PC设备判断
   * @returns boolean 是PC浏览器返回 true，否则返回 false
   */
  public static isBrowser(): boolean {
    // 第一步：先判断是不是浏览器环境（原版逻辑）
    const isBrowserEnv =
      typeof window !== 'undefined' &&
      typeof document !== 'undefined' &&
      typeof navigator !== 'undefined';

    // 不是浏览器 → 直接返回 false
    if (!isBrowserEnv) return false;

    // 第二步：是浏览器 → 再判断是不是 PC 端
    const userAgent = navigator.userAgent.toLowerCase();
    const isMobile = /iphone|ipad|android|ipod/.test(userAgent);
    
    // 最终：只有【是浏览器 + 是PC】才返回 true
    return !isMobile;
  }

  /**
   * 判断是否为 Node.js 环境
   */
  public static isNode(): boolean {
    return (
      typeof process !== 'undefined' &&
      process.versions != null &&
      process.versions.node != null
    );
  }

  /**
   * 判断是否为 Web Worker 环境
   */
  public static isWebWorker(): boolean {
    return (
      typeof self !== 'undefined' &&
      typeof importScripts === 'function' &&
      !this.isBrowser()
    );
  }
}

// 最终只抛出：isBrowser（方法名完全不变，符合你要求）
export const isBrowser = (): boolean => EnvUtils.isBrowser();
export const isNode = (): boolean => EnvUtils.isNode();
export const isWebWorker = (): boolean => EnvUtils.isWebWorker();