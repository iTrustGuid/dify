"use client";

import type { FC, PropsWithChildren } from 'react';
import { useState, useRef, useEffect } from 'react';
import WebAppStoreProvider from '@/context/web-app-context';
import Splash from './components/splash';

// 视频地址
const DIGITAL_HUMAN_VIDEO_URL = "https://ai.wnxbdcdjzx.com:31546/wannian.mp4";

const Layout: FC<PropsWithChildren> = ({ children }) => {
  // 状态控制
  const [showVideo, setShowVideo] = useState(true);
  const [enableDigitalHuman, setEnableDigitalHuman] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  // 10秒未操作 → 自动进入聊天
  useEffect(() => {
    timerRef.current = setTimeout(() => {
      if (!enableDigitalHuman) {
        setShowVideo(false);
      }
    }, 10000);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [enableDigitalHuman]);

  // 开启数字人 → 自动播放有声视频
  useEffect(() => {
    if (enableDigitalHuman && videoRef.current) {
      videoRef.current.play().catch(err => console.log('视频播放失败：', err));
    }
  }, [enableDigitalHuman]);

  // 视频播放完毕 → 自动进入聊天
  const handleVideoEnd = () => {
    setShowVideo(false);
  };

  // 开启数字人
  const handleEnable = () => {
    setEnableDigitalHuman(true);
  };

  // 不开启 → 直接进入聊天
  const handleSkip = () => {
    setShowVideo(false);
  };

  return (
    <div className="h-full min-w-[300px] pb-[env(safe-area-inset-bottom)] relative overflow-hidden">
      <WebAppStoreProvider>
        <Splash>
          {showVideo ? (
            <div className="fixed inset-0 z-50 bg-black flex items-center justify-center">
              {/* 全屏视频 */}
              <video
                ref={videoRef}
                src={DIGITAL_HUMAN_VIDEO_URL}
                className="w-full h-full object-cover"
                muted={false}
                playsInline
                loop={false}
                onEnded={handleVideoEnd}
              />

              {/* 双按钮：开启数字人 + 不开启 */}
              {!enableDigitalHuman && (
                <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-60 flex gap-4 flex-col sm:flex-row">
                  {/* 不开启按钮 */}
                  <button
                    onClick={handleSkip}
                    className="px-6 py-3 bg-gray-500/80 text-white rounded-xl text-lg font-semibold backdrop-blur-sm hover:bg-gray-500 transition-all min-w-[140px]"
                  >
                    不开启
                  </button>

                  {/* 开启数字人（蓝色主题） */}
                  <button
                    onClick={handleEnable}
                    className="px-7 py-3 bg-gradient-to-r from-blue-500 to-blue-600 text-white rounded-xl text-lg font-semibold shadow-xl hover:shadow-blue-500/30 hover:scale-105 transition-all min-w-[160px]"
                  >
                    开启数字人
                  </button>
                </div>
              )}
            </div>
          ) : (
            <div className="h-full w-full">{children}</div>
          )}
        </Splash>
      </WebAppStoreProvider>
    </div>
  );
};

export default Layout