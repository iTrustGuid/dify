// components/WxMiniProgramPreview.tsx
'use client';

import { useCallback } from 'react';

/**
 * 简化版：直接跳转到指定的微信小程序页面
 * @param miniProgramPath 要跳转的小程序路径（如 /pagesB/my/preview/preview）
 */
export const useWxMiniProgramPreview = (miniProgramPath: string) => {
  const ua = navigator.userAgent.toLowerCase();

  // 等待 wx 对象加载完成（最多等3秒）
  const waitForWxReady = useCallback(async (): Promise<any> => {
    return new Promise((resolve) => {
      let checkTimer: NodeJS.Timeout;
      const maxWaitTime = 3000;

      if ((window as any).wx) {
        resolve((window as any).wx);
        return;
      }

      checkTimer = setInterval(() => {
        if ((window as any).wx) {
          clearInterval(checkTimer);
          resolve((window as any).wx);
        }
      }, 100);

      setTimeout(() => {
        clearInterval(checkTimer);
        resolve(null);
      }, maxWaitTime);
    });
  }, []);

  // 检测是否在微信小程序webview中
  const isInWechatMiniProgram = useCallback((): boolean => {
    return typeof (window as any).wx !== 'undefined' && (window as any).wx.miniProgram && ua.includes('miniprogram');
  }, []);

  // 核心：直接跳转到小程序页面
  const openInWechatMiniProgram = useCallback(
    async () => {
      const wx = await waitForWxReady();

      if (!wx) {
        alert('微信环境初始化失败，请刷新页面重试');
        return;
      }

      if (!wx.miniProgram) {
        alert('当前未在微信小程序环境中');
        return;
      }

      // 直接使用传入的路径，不拼接参数
      const targetUrl = miniProgramPath;

      // 优先使用 navigateTo 跳转
      if (wx.miniProgram.navigateTo) {
        wx.miniProgram.navigateTo({
          url: targetUrl,
          success: () => {
            console.log('✅ 跳转小程序页面成功');
          },
          fail: (err: any) => {
            console.error('❌ navigateTo 跳转失败：', err);
            // 备选：redirectTo 重试
            if (wx.miniProgram.redirectTo) {
              wx.miniProgram.redirectTo({
                url: targetUrl,
              });
            } else {
              alert('跳转失败，请手动返回小程序重试');
            }
          },
        });
      }
    },
    [miniProgramPath, waitForWxReady]
  );

  // 统一入口：只保留小程序内跳转逻辑
  const openPreview = useCallback(
    async () => {
      if (isInWechatMiniProgram()) {
        await openInWechatMiniProgram();
      } else {
        alert('请在微信小程序内使用');
      }
    },
    [isInWechatMiniProgram, openInWechatMiniProgram]
  );

  return {
    openPreview, // 调用后直接跳转
    isInWechatMiniProgram,
  };
};