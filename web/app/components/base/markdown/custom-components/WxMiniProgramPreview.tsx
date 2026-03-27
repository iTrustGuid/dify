// components/WxMiniProgramPreview.tsx
'use client';

import { useCallback } from 'react';

// 固定常量：小程序预览页面路由
const FIXED_PREVIEW_ROUTE = '/pagesB/my/preview/preview';

export const useWxMiniProgramPreview = () => {

  // ==============================================
  // ✅ 修复：安全获取 userAgent（防止SSR报错）
  // ==============================================
  const getUA = useCallback(() => {
    if (typeof window === 'undefined') return '';
    return navigator.userAgent.toLowerCase();
  }, []);

  // 等待 wx 对象加载完成
  const waitForWxReady = useCallback(async (): Promise<any> => {
    return new Promise((resolve) => {
      let checkTimer: NodeJS.Timeout;
      const maxWaitTime = 3000;

      if (typeof window === 'undefined' || !(window as any).wx) {
        setTimeout(() => resolve(null), maxWaitTime);
        return;
      }

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

  // 是否在微信小程序内
  const isInWechatMiniProgram = useCallback((): boolean => {
    const ua = getUA();
    if (typeof window === 'undefined') return false;
    return !!(
      (window as any).wx &&
      (window as any).wx.miniProgram &&
      ua.includes('miniprogram')
    );
  }, [getUA]);

  // 是否在微信浏览器
  const isInWechatBrowser = useCallback((): boolean => {
    const ua = getUA();
    return /micromessenger/.test(ua);
  }, [getUA]);

  /**
   * 内部通用：小程序跳转方法
   */
  const navigateToMiniProgram = useCallback(
    async (route: string, queryParams?: Record<string, string>) => {
      if (typeof window === 'undefined') return;

      const wx = await waitForWxReady();
      if (!wx || !wx.miniProgram) {
        alert('请在微信小程序环境中使用');
        return;
      }

      let targetUrl = route;
      if (queryParams) {
        const search = new URLSearchParams(queryParams).toString();
        targetUrl = `${route}?${search}`;
      }

      if (wx.miniProgram.navigateTo) {
        wx.miniProgram.navigateTo({
          url: targetUrl,
          success: () => console.log('✅ 跳转成功'),
          fail: (err: any) => {
            console.error('❌ navigateTo 失败', err);
            wx.miniProgram.redirectTo?.({ url: targetUrl });
          },
        });
      }
    },
    [waitForWxReady]
  );

  // 跳转到固定预览页
  const openFilePreview = useCallback(
    async (fileUrl: string) => {
      if (!isInWechatMiniProgram()) {
        alert('仅支持在微信小程序内预览文件');
        return;
      }
      await navigateToMiniProgram(FIXED_PREVIEW_ROUTE, {
        url: encodeURIComponent(fileUrl),
      });
    },
    [isInWechatMiniProgram, navigateToMiniProgram]
  );

  // 跳转到自定义路由
  const navigateToCustomRoute = useCallback(
    async (route: string, params?: Record<string, string>) => {
      if (!isInWechatMiniProgram()) {
        alert('仅支持在微信小程序内跳转');
        return;
      }
      await navigateToMiniProgram(route, params);
    },
    [isInWechatMiniProgram, navigateToMiniProgram]
  );

  return {
    openFilePreview,
    navigateToCustomRoute,
    isInWechatMiniProgram,
    isInWechatBrowser,
  };
};