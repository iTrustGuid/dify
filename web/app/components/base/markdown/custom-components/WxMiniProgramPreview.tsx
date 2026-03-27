// components/WxMiniProgramPreview.tsx
'use client';

import { useCallback } from 'react';

// 固定常量：小程序预览页面路由（你业务固定的地址）
const FIXED_PREVIEW_ROUTE = '/pagesB/my/preview/preview';

export const useWxMiniProgramPreview = () => {
  const ua = navigator.userAgent.toLowerCase();

  // 等待 wx 对象加载完成（最多等3秒）
  const waitForWxReady = useCallback(async (): Promise<any> => {
    return new Promise((resolve) => {
      let checkTimer: NodeJS.Timeout;
      const maxWaitTime = 3000;

      // 立即检查
      if ((window as any).wx) {
        resolve((window as any).wx);
        return;
      }

      // 轮询检查
      checkTimer = setInterval(() => {
        if ((window as any).wx) {
          clearInterval(checkTimer);
          resolve((window as any).wx);
        }
      }, 100);

      // 超时
      setTimeout(() => {
        clearInterval(checkTimer);
        resolve(null);
      }, maxWaitTime);
    });
  }, []);

  // 是否在微信小程序内
  const isInWechatMiniProgram = useCallback((): boolean => {
    return typeof (window as any).wx !== 'undefined' && !! (window as any).wx.miniProgram && ua.includes('miniprogram');
  }, [ua]);

  // 是否在微信浏览器
  const isInWechatBrowser = useCallback((): boolean => {
    return /micromessenger/.test(ua);
  }, [ua]);

  /**
   * 内部通用：小程序跳转方法（支持任意路由+参数）
   */
  const navigateToMiniProgram = useCallback(
    async (route: string, queryParams?: Record<string, string>) => {
      const wx = await waitForWxReady();

      if (!wx || !wx.miniProgram) {
        alert('请在微信小程序环境中使用');
        return;
      }

      // 拼接参数
      let targetUrl = route;
      if (queryParams && Object.keys(queryParams).length > 0) {
        const search = new URLSearchParams(queryParams).toString();
        targetUrl = `${route}?${search}`;
      }

      // 优先 navigateTo
      if (wx.miniProgram.navigateTo) {
        wx.miniProgram.navigateTo({
          url: targetUrl,
          success: () => console.log('✅ 小程序跳转成功'),
          fail: (err: any) => {
            console.error('❌ navigateTo 失败：', err);
            // 降级 redirectTo
            wx.miniProgram.redirectTo?.({ url: targetUrl });
          },
        });
      }
    },
    [waitForWxReady]
  );

  // ==============================================
  // 对外方法 1：跳转到【固定预览页】并传入文件 url
  // ==============================================
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

  // ==============================================
  // 对外方法 2：跳转到【自定义路由】（可传任意参数）
  // ==============================================
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
    // 核心对外方法
    openFilePreview, // 跳转固定预览页（传文件地址）
    navigateToCustomRoute, // 跳转自定义路由

    // 环境判断（可选保留）
    isInWechatMiniProgram,
    isInWechatBrowser,
  };
};