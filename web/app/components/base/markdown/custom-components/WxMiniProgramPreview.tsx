// components/WxMiniProgramPreview.tsx
'use client';

import { useCallback } from 'react';

/**
 * 微信小程序 H5 跳转 Hook（最终版，支持 url + certType）
 */
export const useWxMiniProgramPreview = () => {
  const ua = navigator.userAgent.toLowerCase();

  // 等待微信JSSDK
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

  // 是否在小程序内
  const isInWechatMiniProgram = useCallback((): boolean => {
    return !!(
      typeof (window as any).wx !== 'undefined' &&
      (window as any).wx.miniProgram &&
      ua.includes('miniprogram')
    );
  }, [ua]);

  // 统一跳转执行
  const navigateToMiniProgram = useCallback(
    async (fullPath: string) => {
      const wx = await waitForWxReady();
      if (!wx) {
        alert('微信环境初始化失败，请刷新重试');
        return;
      }
      if (!wx.miniProgram) {
        alert('当前不在微信小程序环境');
        return;
      }

      console.log('🚀 跳转:', fullPath);

      if (wx.miniProgram.navigateTo) {
        wx.miniProgram.navigateTo({
          url: fullPath,
          success: () => console.log('✅ 跳转成功'),
          fail: (err: any) => {
            console.error('❌ 失败', err);
            wx.miniProgram.redirectTo?.({ url: fullPath });
          },
        });
      }
    },
    [waitForWxReady]
  );

  // ==============================================
  // 【核心方法 1】跳固定预览页（支持 url + certType）
  // ==============================================
  const navigateToFixedPreview = useCallback(
    async (fileUrl: string, certType: string = '') => {
      const url = encodeURIComponent(fileUrl);
      const type = encodeURIComponent(certType);
      const fullPath = `/pagesB/my/preview/preview?url=${url}&certType=${type}`;
      await navigateToMiniProgram(fullPath);
    },
    [navigateToMiniProgram]
  );

  // ==============================================
  // 【核心方法 2】跳任意页面（自由传参）
  // ==============================================
  const navigateToCustomPage = useCallback(
    async (route: string, params: Record<string, any> = {}) => {
      const paramsStr = new URLSearchParams(params).toString();
      const fullPath = paramsStr ? `${route}?${paramsStr}` : route;
      await navigateToMiniProgram(fullPath);
    },
    [navigateToMiniProgram]
  );

  return {
    isInWechatMiniProgram,
    navigateToFixedPreview,  // 跳预览页（主推）
    navigateToCustomPage,    // 跳任意页
  };
};