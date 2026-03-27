"use client";

import type { FC, PropsWithChildren } from 'react';
import { useState, useRef, useEffect } from 'react';
import WebAppStoreProvider from '@/context/web-app-context';
import Splash from './components/splash';

const DIGITAL_HUMAN_VIDEO_URL = "https://ai.wnxbdcdjzx.com:31546/katong.mp4";
const VIDEO_COVER_URL = "https://ai.wnxbdcdjzx.com:31546/bg.jpg";

const Layout: FC<PropsWithChildren> = ({ children }) => {
  const [showVideo, setShowVideo] = useState(true);
  const [enableDigitalHuman, setEnableDigitalHuman] = useState(false);
  const [isPC, setIsPC] = useState(false);
  // 新增：记录视频是否正在播放
  const [isVideoPlaying, setIsVideoPlaying] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    const checkIsPC = () => {
      const userAgent = navigator.userAgent.toLowerCase();
      const isMobile = /iphone|ipad|android|ipod/.test(userAgent);
      return !isMobile;
    };
    const pc = checkIsPC();
    setIsPC(pc);
    if (pc) setShowVideo(false);
  }, []);

  useEffect(() => {
    if (isPC) return;
    timerRef.current = setTimeout(() => {
      if (!enableDigitalHuman) setShowVideo(false);
    }, 10000);
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [enableDigitalHuman, isPC]);

  useEffect(() => {
    if (isPC) return;
    if (videoRef.current) videoRef.current.load();
  }, [isPC]);

  useEffect(() => {
    if (isPC) return;
    const video = videoRef.current;
    if (!video) return;

    // 视频开始播放
    const handlePlay = () => setIsVideoPlaying(true);
    // 视频暂停/结束
    const handlePause = () => setIsVideoPlaying(false);
    const handleEnd = () => setIsVideoPlaying(false);

    video.addEventListener('play', handlePlay);
    video.addEventListener('pause', handlePause);
    video.addEventListener('ended', handleEnd);

    return () => {
      video.removeEventListener('play', handlePlay);
      video.removeEventListener('pause', handlePause);
      video.removeEventListener('ended', handleEnd);
    };
  }, [enableDigitalHuman, isPC]);

  useEffect(() => {
    if (isPC) return;
    if (enableDigitalHuman && videoRef.current) {
      videoRef.current.muted = false;
      videoRef.current.play().catch(err => console.log("视频播放失败", err));
    }
  }, [enableDigitalHuman, isPC]);

  const handleVideoEnd = () => setShowVideo(false);
  const handleEnable = () => setEnableDigitalHuman(true);
  const handleSkip = () => setShowVideo(false);
  const handleClose = () => {
    // 关闭时停止视频
    if (videoRef.current) {
      videoRef.current.pause();
      videoRef.current.currentTime = 0;
    }
    setShowVideo(false);
  };

  if (isPC) {
    return (
      <div className="h-full w-full">
        <WebAppStoreProvider>
          <Splash>{children}</Splash>
        </WebAppStoreProvider>
      </div>
    );
  }

  return (
    <div className="w-screen h-screen overflow-hidden !p-0 !m-0">
      <WebAppStoreProvider>
        <Splash>
          {showVideo ? (
            <div className="fixed inset-0 w-screen h-screen m-0 p-0 z-50 bg-black">

              <img
                src={VIDEO_COVER_URL}
                className="fixed inset-0 w-full h-full object-cover"
                style={{ objectPosition: "center" }}
                alt="bg"
              />

              <video
                ref={videoRef}
                src={DIGITAL_HUMAN_VIDEO_URL}
                className="fixed inset-0 w-full h-full object-cover z-20"
                style={{ objectPosition: "center" }}
                preload="auto"
                playsInline
                loop={false}
                muted={false}
                onEnded={handleVideoEnd}
                poster={VIDEO_COVER_URL}
              />

              {/* 👇 只有视频播放时才显示关闭按钮 */}
              {isVideoPlaying && (
                <button
                  onClick={handleClose}
                  className="fixed top-4 right-4 z-[10000] w-10 h-10 rounded-full bg-black/50 backdrop-blur-sm 
                  flex items-center justify-center text-white text-xl font-bold hover:bg-black/70 active:scale-95 transition-all"
                >
                  ✕
                </button>
              )}

              {!enableDigitalHuman && (
                <div className="fixed inset-0 z-[9999] flex flex-col justify-between items-center px-6 py-12">
                  <button
                    onClick={handleSkip}
                    className="px-6 py-3 bg-gray-500/80 text-white rounded-xl text-lg font-semibold backdrop-blur-sm 
                               hover:bg-gray-700/90 active:bg-gray-800 transition-all min-w-[140px]"
                  >
                    不开启
                  </button>

                  <button
                    onClick={handleEnable}
                    className="px-7 py-3 bg-gradient-to-r from-blue-500 to-blue-600 text-white rounded-xl text-lg font-semibold shadow-xl 
                               hover:from-blue-700 hover:to-blue-800 active:from-blue-800 active:to-blue-900 transition-all min-w-[160px]"
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