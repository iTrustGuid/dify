"use client"

import type { FC, PropsWithChildren } from 'react'
import { useState, useEffect, useRef } from 'react'
import WebAppStoreProvider from '@/context/web-app-context'
import Splash from './components/splash'

// 定义视频相关的类型
interface VideoAvatarProps {
  videoSrc: string;
  onVideoEnd: () => void;
}

// 判断是否是WebView环境（核心逻辑：PC端隐藏，仅WebView显示）
const isWebView = () => {
  // 1. 先排除PC端（仅移动端才可能是WebView）
  const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
  if (!isMobile) return false;

  // 2. 再判断是否是WebView（排除普通移动端浏览器）
  const userAgent = navigator.userAgent;
  // 常见WebView特征（可根据你的App实际UA调整，建议让原生加自定义标识）
  const isWebViewFlag = 
    userAgent.includes('WebView') || 
    userAgent.includes('wv') || // Android WebView 常见标识
    userAgent.includes('AppleWebKit') && !userAgent.includes('Safari') || // iOS WebView 特征
    // 替换为你的App自定义UA标识（最准确）
    userAgent.includes('YourAppName/1.0'); 

  return isWebViewFlag;
};

// 数字人视频组件（完全符合需求：全屏、无工具栏、自动播放、带声音）
const VideoAvatar: FC<VideoAvatarProps> = ({ videoSrc, onVideoEnd }) => {
  const videoRef = useRef<HTMLVideoElement>(null);

  // 视频加载失败兜底
  const handleError = () => {
    console.error('数字人视频加载失败，直接进入页面');
    onVideoEnd();
  };

  // 视频加载完成后自动播放兜底
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const handleCanPlay = () => {
      video.play().catch(err => {
        console.warn('自动播放兜底触发:', err);
      });
    };

    video.addEventListener('canplay', handleCanPlay);
    return () => video.removeEventListener('canplay', handleCanPlay);
  }, []);

  return (
    <div className="fixed inset-0 w-full h-full z-50 bg-transparent">
      <video
        ref={videoRef}
        src={videoSrc}
        autoPlay
        playsInline
        muted={false}
        controls={false}
        onEnded={onVideoEnd}
        onError={handleError}
        preload="auto"
        className="w-full h-full object-cover"
      >
        您的浏览器不支持视频播放
      </video>
    </div>
  );
};

const Layout: FC<PropsWithChildren> = ({ children }) => {
  const [showVideoAvatar, setShowVideoAvatar] = useState(false);

  // 页面初始化时判断环境，仅WebView显示视频
  useEffect(() => {
    const shouldShow = isWebView();
    setShowVideoAvatar(shouldShow);
  }, []);

  // 视频播放完成后隐藏视频，显示聊天页
  const handleVideoEnd = () => {
    setShowVideoAvatar(false);
  };

  return (
    <div className="h-full min-w-[300px] pb-[env(safe-area-inset-bottom)]">
      <WebAppStoreProvider>
        {/* 仅WebView环境渲染视频 */}
        {showVideoAvatar && (
          <VideoAvatar 
            videoSrc="/数字人开场白.mp4"
            onVideoEnd={handleVideoEnd} 
          />
        )}
        
        {/* 视频播放完成/PC端直接显示原页面 */}
        <div className={`${showVideoAvatar ? 'hidden' : 'block'}`}>
          <Splash>
            {children}
          </Splash>
        </div>
      </WebAppStoreProvider>
    </div>
  );
};

export default Layout