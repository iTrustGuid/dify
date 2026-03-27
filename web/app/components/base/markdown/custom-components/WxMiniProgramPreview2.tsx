// components/WxMiniProgramPreview.tsx
'use client';

import { useCallback } from 'react';

/**
 * 通用：H5 向微信小程序传递 URL 并跳转预览页的逻辑
 * @param miniProgramPreviewPath 小程序预览页路径（如 /pagesB/my/preview/preview）
 */
export const useWxMiniProgramPreview = (miniProgramPreviewPath: string) => {
  const ua = navigator.userAgent.toLowerCase();

  // 等待 wx 对象加载完成（最多等3秒）
  const waitForWxReady = useCallback(async (): Promise<any> => {
    return new Promise((resolve) => {
      let checkTimer: NodeJS.Timeout;
      const maxWaitTime = 3000; // 最大等待3秒

      // 立即检查一次
      if ((window as any).wx) {
        resolve((window as any).wx);
        return;
      }

      // 轮询检查 wx 是否加载完成
      checkTimer = setInterval(() => {
        if ((window as any).wx) {
          clearInterval(checkTimer);
          resolve((window as any).wx);
        }
      }, 100);

      // 超时未加载完成，返回 null
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

  // 检测是否在微信浏览器中
  const isInWechatBrowser = useCallback((): boolean => {
    const ua = navigator.userAgent.toLowerCase();
    return /micromessenger/.test(ua);
  }, []);

  // 微信浏览器中打开链接
  const openInWechatBrowser = useCallback((url: string) => {
    window.location.href = url;
  }, []);

  // PC/其他浏览器中打开链接
  const openInNormalBrowser = useCallback((url: string) => {
    window.open(url, '_blank', 'noopener,noreferrer');
  }, []);

  // 核心：跳转小程序并传递 URL 参数
  const openInWechatMiniProgram = useCallback(
    async (url: string) => {
      const wx = await waitForWxReady();

      if (!wx) {
        alert('微信环境初始化失败，请刷新页面重试');
        return;
      }

      if (!wx.miniProgram) {
        alert('当前未在微信小程序环境中');
        return;
      }

      // 拼接小程序预览页路径 + URL 参数
      const miniProgramPreviewUrl = `${miniProgramPreviewPath}?url=${encodeURIComponent(url)}`;

      // 优先使用 navigateTo 跳转
      if (wx.miniProgram.navigateTo) {
        wx.miniProgram.navigateTo({
          url: miniProgramPreviewUrl,
          success: () => {
            console.log('✅ 跳转小程序预览页成功');
          },
          fail: (err: any) => {
            console.error('❌ navigateTo 跳转失败：', err);
            // 备选：redirectTo 重试
            if (wx.miniProgram.redirectTo) {
              wx.miniProgram.redirectTo({
                url: miniProgramPreviewUrl,
              });
            } else {
              alert('跳转失败，请手动返回小程序重试');
            }
          },
        });
      }
      // 兜底：postMessage 传参
      else if (wx.miniProgram.postMessage) {
        wx.miniProgram.postMessage({
          data: {
            action: 'openPreview',
            url: url,
          },
        });
        alert('已发送预览请求，请返回小程序页面查看');
      }
    },
    [miniProgramPreviewPath, waitForWxReady]
  );

  // 统一入口：根据环境打开预览链接
  const openPreview = useCallback(
    async (url: string) => {
      if (isInWechatMiniProgram()) {
        await openInWechatMiniProgram(url);
      } else if (isInWechatBrowser()) {
        openInWechatBrowser(url);
      } else {
        openInNormalBrowser(url);
      }
    },
    [
      isInWechatMiniProgram,
      isInWechatBrowser,
      openInWechatMiniProgram,
      openInWechatBrowser,
      openInNormalBrowser,
    ]
  );

  return {
    openPreview, // 对外暴露的核心方法
    isInWechatMiniProgram,
    isInWechatBrowser,
  };
};