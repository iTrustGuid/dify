/**
 * 环境检测工具类
 * 专门用于判断当前运行环境是否为浏览器环境
 */
export class EnvUtils {
  /**
   * 判断当前环境是否为浏览器环境
   * @returns boolean 是浏览器返回 true，否则返回 false
   */
  public static isBrowser(): boolean {
    // 核心判断：window、document、navigator 是浏览器专属全局对象
    // 同时排除 Web Worker 环境（Worker 有 window 但无 document）
    return (
      typeof window !== 'undefined' &&
      typeof document !== 'undefined' &&
      typeof navigator !== 'undefined'
    );
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

// 也可以直接导出便捷方法（推荐）
export const isBrowser = (): boolean => EnvUtils.isBrowser();
export const isNode = (): boolean => EnvUtils.isNode();
export const isWebWorker = (): boolean => EnvUtils.isWebWorker();