// app/WechatJSSDKInitializer.tsx
'use client'; // 必须标记为客户端组件

import { useEffect } from 'react';

/**
 * 微信 JS-SDK 全局初始化组件（仅在客户端执行）
 * 与 layout.tsx 同级，位于 app 目录下
 */
export default function WechatJSSDKInitializer() {
  // 仅在客户端执行 SDK 加载逻辑
  useEffect(() => {
    // 避免服务端渲染时访问 window
    if (typeof window === 'undefined') return;

    // 检查是否已加载，防止重复引入
    if ((window as any).wx) {
      console.log('✅ 微信 JS-SDK 已全局加载，无需重复引入');
      return;
    }

    // 动态创建并插入微信 JS-SDK 脚本
    const script = document.createElement('script');
    script.src = 'https://res.wx.qq.com/open/js/jweixin-1.6.0.js';
    script.type = 'text/javascript';
    script.charset = 'utf-8';
    
    // 脚本加载成功回调
    script.onload = () => {
      console.log('✅ 微信 JS-SDK 全局加载完成');
    };
    
    // 脚本加载失败回调
    script.onerror = () => {
      console.error('❌ 微信 JS-SDK 全局加载失败');
      alert('微信环境初始化失败，预览功能可能无法使用');
    };
    
    // 插入到 head 标签中
    document.head.appendChild(script);

    // 组件卸载时移除脚本（可选，防止内存泄漏）
    return () => {
      if (script.parentNode) {
        script.parentNode.removeChild(script);
      }
    };
  }, []);

  // 无UI渲染，仅执行逻辑
  return null;
}