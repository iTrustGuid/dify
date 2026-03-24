"use client";

import type { FC, PropsWithChildren } from 'react';
import { useState, useRef, useEffect } from 'react';
import WebAppStoreProvider from '@/context/web-app-context';
import Splash from './components/splash';

const DIGITAL_HUMAN_VIDEO_URL = "https://ai.wnxbdcdjzx.com:31546/wannian.mp4";
const VIDEO_COVER_URL = "https://ai.wnxbdcdjzx.com:31546/bg1.png";

const Layout: FC<PropsWithChildren> = ({ children }) => {
  const [showVideo, setShowVideo] = useState(true);
  const [enableDigitalHuman, setEnableDigitalHuman] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  // 10秒未操作自动进入聊天
  useEffect(() => {
    timerRef.current = setTimeout(() => {
      if (!enableDigitalHuman) setShowVideo(false);
    }, 10000);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [enableDigitalHuman]);

  // 预加载视频
  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.load();
    }
  }, []);

  // 点击开启 → 播放视频
  useEffect(() => {
    if (enableDigitalHuman && videoRef.current) {
      videoRef.current.muted = false;
      videoRef.current.play().catch(err => console.log("视频播放失败", err));
    }
  }, [enableDigitalHuman]);

  // 视频播放完进入聊天
  const handleVideoEnd = () => setShowVideo(false);

  // 开启数字人
  const handleEnable = () => setEnableDigitalHuman(true);

  // 不开启
  const handleSkip = () => setShowVideo(false);

  return (
    <div className="w-screen h-screen overflow-hidden !p-0 !m-0">
      <WebAppStoreProvider>
        <Splash>
          {showVideo ? (
            <div className="fixed inset-0 w-screen h-screen m-0 p-0 overflow-hidden z-50">

              {/* 背景图 */}
              <img
                src={VIDEO_COVER_URL}
                className="fixed inset-0 w-screen h-screen m-0 p-0 block object-cover object-center"
                style={{ objectFit: 'cover', objectPosition: 'center' }}
                alt="bg"
              />

              {/* 视频 */}
              <video
                ref={videoRef}
                src={DIGITAL_HUMAN_VIDEO_URL}
                className="fixed inset-0 w-screen h-screen m-0 p-0 block object-cover object-center z-20"
                style={{
                  objectFit: 'cover',
                  objectPosition: 'center',
                  display: 'block',
                  border: 'none',
                  margin: 0,
                  padding: 0
                }}
                preload="auto"
                playsInline
                loop={false}
                muted={false}
                onEnded={handleVideoEnd}
                poster={VIDEO_COVER_URL}
              />

              {/* 🔥 按钮：未开启才显示，开启后自动隐藏 */}
              {!enableDigitalHuman && (
                <div
                  className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-[9999] flex flex-col sm:flex-row gap-4"
                >
                  <button
                    onClick={handleSkip}
                    className="px-6 py-3 bg-gray-500/80 text-white rounded-xl text-lg font-semibold backdrop-blur-sm hover:bg-gray-500 transition-all min-w-[140px]"
                  >
                    不开启
                  </button>

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
            <div className="w-screen h-screen">{children}</div>
          )}
        </Splash>
      </WebAppStoreProvider>
    </div>
  );
};

export default Layout;