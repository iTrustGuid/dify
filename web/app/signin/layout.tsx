'use client'
import Header from './_header'

import cn from '@/utils/classnames'
import { useGlobalPublicStore } from '@/context/global-public-context'
import useDocumentTitle from '@/hooks/use-document-title'

export default function SignInLayout({ children }: any) {
  const { systemFeatures } = useGlobalPublicStore()
  useDocumentTitle('')
  return <>
    <div className={cn('flex min-h-screen w-full justify-center bg-background-default-burn p-6')}   style={{
    backgroundImage: 'url(/logo/bg@2x.png)',
    backgroundSize: 'cover',
    backgroundPosition: 'center',
    backgroundRepeat: 'no-repeat',
  }}>
      <div className={cn('flex w-full shrink-0 flex-col items-center rounded-2xl')}>
        {/* <Header /> */}
        <div style={{
    width: '518px',
    height: '72px',
    fontFamily: 'PingFang SC, sans-serif', 
    fontWeight: 600,
    fontSize: '48px',
    color: '#005FA3',
    lineHeight: '72px',
    letterSpacing: '3px',
    textAlign: 'center',
    fontStyle: 'normal',
    textTransform: 'none',
    position: 'absolute',
    top: '90px'
  }}>智能体搭建平台</div>
        <div className={cn('flex w-full grow flex-col  justify-center px-6 md:px-[108px]')} style={{
    alignItems: 'flex-end',
    paddingRight: '260px'
  }}>
          <div className='flex flex-col md:w-[400px]'  style={{
    background: 'rgba(255, 255, 255, 0.9)',
    borderRadius: '16px',
    border: '8px solid rgba(255, 255, 255, 0.35)',
    width: '429px', // 固定宽度
    height: '394px', // 固定高度
    display: 'flex', // 启用 Flex 布局
    justifyContent: 'center', // 水平居中
    alignItems: 'center', // 垂直居中
    boxShadow: '0 10px 20px rgba(0, 0, 0, 0.1), 0 4px 6px rgba(0, 0, 0, 0.1)', // 柔和阴影
    // padding: '24px', 
  }}>
            {children}
          </div>
        </div>
        {systemFeatures.branding.enabled === false && <div className='system-xs-regular px-8 py-6 text-text-tertiary' style={{
fontWeight: '400',
fontSize: '18px',
color: '#FFFFFF'
  }}>
          {/* © {new Date().getFullYear()} LangGenius, Inc. All rights reserved. */}
          ©版权所有
        </div>}
      </div>
    </div>
  </>
}
