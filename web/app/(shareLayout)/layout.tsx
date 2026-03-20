"use client"

import type { FC, PropsWithChildren } from 'react'
import { useState, useRef, useEffect } from 'react'
import WebAppStoreProvider from '@/context/web-app-context'
import Splash from './components/splash'

interface VideoAvatarProps {
  videoSrc: string
  onVideoEnd: () => void
}

const VideoAvatar: FC<VideoAvatarProps> = ({ videoSrc, onVideoEnd }) => {
  const videoRef = useRef<HTMLVideoElement>(null)

  useEffect(() => {
    const video = videoRef.current
    if (!video) return

    // 强制自动播放
    const play = async () => {
      try {
        video.muted = false // 要声音
        await video.play()
      } catch (err) {
        console.warn('自动播放被浏览器限制，尝试静音播放', err)
        try {
          video.muted = true
          await video.play()
        } catch (e) {
          console.error('播放失败，直接进入页面', e)
          onVideoEnd()
        }
      }
    }

    video.addEventListener('canplay', play)
    return () => video.removeEventListener('canplay', play)
  }, [onVideoEnd])

  return (
    <div className="fixed inset-0 z-50 w-full h-full">
      <video
        ref={videoRef}
        src={videoSrc}
        autoPlay
        playsInline
        muted={false}
        controls={false}
        onEnded={onVideoEnd}
        onError={onVideoEnd}
        preload="auto"
        className="w-full h-full object-cover"
      />
    </div>
  )
}

const Layout: FC<PropsWithChildren> = ({ children }) => {
  // 一进来就显示视频
  const [showVideo, setShowVideo] = useState(true)

  // 视频播完 → 隐藏视频，显示聊天
  const handleVideoEnd = () => {
    setShowVideo(false)
  }

  return (
    <div className="h-full min-w-[300px] pb-[env(safe-area-inset-bottom)]">
      <WebAppStoreProvider>

        {showVideo && (
          <VideoAvatar
            videoSrc="https://ai.wnxbdcdjzx.com:31546/wannian.mp4"
            onVideoEnd={handleVideoEnd}
          />
        )}

        <div className={showVideo ? 'hidden' : 'block h-full'}>
          <Splash>{children}</Splash>
        </div>

      </WebAppStoreProvider>
    </div>
  )
}

export default Layout