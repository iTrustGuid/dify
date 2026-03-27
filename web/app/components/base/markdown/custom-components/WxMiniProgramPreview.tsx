'use client';
import { useCallback } from 'react';

export const useWxMiniProgramPreview = () => {
  const ua = navigator.userAgent.toLowerCase();

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

  const isInWechatMiniProgram = useCallback((): boolean => {
    return !!(
      typeof (window as any).wx !== 'undefined' &&
      (window as any).wx.miniProgram &&
      ua.includes('miniprogram')
    );
  }, [ua]);

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

  const navigateToFixedPreview = useCallback(
    async (fileUrl: string, certType: string = '') => {
      const url = encodeURIComponent(fileUrl);
      const type = encodeURIComponent(certType);
      const fullPath = `/pagesB/my/preview/preview?url=${url}&certType=${type}`;
      await navigateToMiniProgram(fullPath);
    },
    [navigateToMiniProgram]
  );

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
    navigateToFixedPreview,
    navigateToCustomPage,
  };
};