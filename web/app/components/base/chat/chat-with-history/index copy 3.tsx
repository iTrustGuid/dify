'use client'
import type { FC } from 'react'
import {
  useEffect,
  useState,
  useCallback,
} from 'react'
import { useThemeContext } from '../embedded-chatbot/theme/theme-context'
import {
  ChatWithHistoryContext,
  useChatWithHistoryContext,
} from './context'
import { useChatWithHistory } from './hooks'
import Sidebar from './sidebar'
import Header from './header'
import HeaderInMobile from './header-in-mobile'
import ChatWrapper from './chat-wrapper'
import type { InstalledApp } from '@/models/explore'
import Loading from '@/app/components/base/loading'
import useBreakpoints, { MediaType } from '@/hooks/use-breakpoints'
import cn from '@/utils/classnames'
import useDocumentTitle from '@/hooks/use-document-title'

type ChatWithHistoryProps = {
  className?: string
}
const ChatWithHistory: FC<ChatWithHistoryProps> = ({
  className,
}) => {
  const {
    appData,
    appChatListDataLoading,
    chatShouldReloadKey,
    isMobile,
    themeBuilder,
    sidebarCollapseState,
  } = useChatWithHistoryContext()
  const isSidebarCollapsed = sidebarCollapseState
  const customConfig = appData?.custom_config
  const site = appData?.site

  const [showSidePanel, setShowSidePanel] = useState(false)

  // ========== 原有：明文URL Scheme跳转逻辑（保留） ==========
  const jumpToMiniProgramB = useCallback(() => {
    try {
      // 拼接明文URL Scheme（替换成你的参数）
      const schemeParams = {
        appid: 'wxad0a1aff5f570168', // 【必填】小程序B的AppID
        path: 'pages/index/index',   // 【必填】小程序B的页面路径（不能带query）
        query: '',                   // 【选填】跳转参数（需URL编码）
        env_version: ''       // 【选填】版本：develop/trial/release
      }

      // 拼接明文Scheme链接
      const scheme = `weixin://dl/business/?appid=${schemeParams.appid}&path=${schemeParams.path}&query=${schemeParams.query}&env_version=${schemeParams.env_version}`
      
      // 执行跳转
      window.location.href = scheme

      // 兼容处理：部分浏览器需要延迟跳转
      setTimeout(() => {
        window.location.href = scheme
      }, 100)

      console.log('✅ 明文Scheme跳转触发：', scheme)
    } catch (err) {
      console.error('❌ 跳转失败', err)
      alert('❌ 跳转失败，请重试')
    }
  }, [])

  // ========== 新增：postMessage中转跳转逻辑（适配Android） ==========
  const jumpToMiniProgramBByPostMessage = useCallback(() => {
    try {
      // 1. 检测是否在微信小程序web-view环境
      const isWechatMiniProgram = /miniProgram/i.test(navigator.userAgent)
      if (!isWechatMiniProgram) {
        alert('请在微信小程序内操作！')
        return
      }

      // 2. 向小程序发送跳转指令（参数可自定义）
      window.wx?.miniProgram?.postMessage({
        data: {
          type: 'jumpToMiniProgram',
          appId: 'wxad0a1aff5f570168', // 目标小程序B的AppID
          path: 'pages/index/index',   // 目标页面路径
          envVersion: 'trial'       // 版本：develop/trial/release
        }
      })

      // 3. 友好提示
      alert('正在跳转小程序，请稍候...')
      console.log('✅ 已向小程序发送跳转指令')
    } catch (err) {
      console.error('❌ 中转跳转指令发送失败', err)
      alert('❌ 跳转指令发送失败，请重试')
    }
  }, [])

  // ========== 原有逻辑完全保留 ==========
  useEffect(() => {
    themeBuilder?.buildTheme(site?.chat_color_theme, site?.chat_color_theme_inverted)
  }, [site, customConfig, themeBuilder])

  useEffect(() => {
    if (!isSidebarCollapsed)
      setShowSidePanel(false)
  }, [isSidebarCollapsed])

  useDocumentTitle(site?.title || 'Chat')

  return (
    <div className={cn(
      'flex h-full bg-background-default-burn',
      isMobile && 'flex-col',
      className,
    )}>
      {/* ========== 原有：Scheme跳转按钮（保留） ========== */}
      <button
        onClick={jumpToMiniProgramB}
        disabled={appChatListDataLoading}
        className={cn(
          'fixed z-50 px-4 py-2 text-white bg-green-600 rounded-lg transition-all duration-200 hover:bg-green-700 disabled:bg-gray-400 disabled:cursor-not-allowed',
          isMobile ? 'bottom-20 right-4' : 'bottom-4 right-4'
        )}
      >
        办理业务（Scheme跳转）
      </button>

      {/* ========== 新增：postMessage中转跳转按钮 ========== */}
      <button
        onClick={jumpToMiniProgramBByPostMessage}
        disabled={appChatListDataLoading}
        className={cn(
          'fixed z-50 px-4 py-2 text-white bg-blue-600 rounded-lg transition-all duration-200 hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed',
          isMobile ? 'bottom-40 right-4' : 'bottom-16 right-4'
        )}
      >
        办理业务（中转跳转）
      </button>

      {/* ========== 原有页面结构完全保留 ========== */}
      {!isMobile && (
        <div className={cn(
          'flex w-[236px] flex-col p-1 pr-0 transition-all duration-200 ease-in-out',
          isSidebarCollapsed && 'w-0 overflow-hidden !p-0',
        )}>
          <Sidebar />
        </div>
      )}
      {isMobile && (
        <HeaderInMobile />
      )}
      <div className={cn('relative grow p-2', isMobile && 'h-[calc(100%_-_56px)] p-0')}>
        {isSidebarCollapsed && (
          <div
            className={cn(
              'absolute top-0 z-20 flex h-full w-[256px] flex-col p-2 transition-all duration-500 ease-in-out',
              showSidePanel ? 'left-0' : 'left-[-248px]',
            )}
            onMouseEnter={() => setShowSidePanel(true)}
            onMouseLeave={() => setShowSidePanel(false)}
          >
            <Sidebar isPanel panelVisible={showSidePanel} />
          </div>
        )}
        <div className={cn('flex h-full flex-col overflow-hidden border-[0,5px] border-components-panel-border-subtle bg-chatbot-bg', isMobile ? 'rounded-t-2xl' : 'rounded-2xl')}>
          {!isMobile && <Header />}
          {appChatListDataLoading && (
            <Loading type='app' />
          )}
          {!appChatListDataLoading && (
            <ChatWrapper key={chatShouldReloadKey} />
          )}
        </div>
      </div>
    </div>
  )
}

// ========== 原有Wrap组件完全保留 ==========
export type ChatWithHistoryWrapProps = {
  installedAppInfo?: InstalledApp
  className?: string
}
const ChatWithHistoryWrap: FC<ChatWithHistoryWrapProps> = ({
  installedAppInfo,
  className,
}) => {
  const media = useBreakpoints()
  const isMobile = media === MediaType.mobile
  const themeBuilder = useThemeContext()

  const {
    appData,
    appParams,
    appMeta,
    appChatListDataLoading,
    currentConversationId,
    currentConversationItem,
    appPrevChatTree,
    pinnedConversationList,
    conversationList,
    newConversationInputs,
    newConversationInputsRef,
    handleNewConversationInputsChange,
    inputsForms,
    handleNewConversation,
    handleStartChat,
    handleChangeConversation,
    handlePinConversation,
    handleUnpinConversation,
    handleDeleteConversation,
    conversationRenaming,
    handleRenameConversation,
    handleNewConversationCompleted,
    chatShouldReloadKey,
    isInstalledApp,
    appId,
    handleFeedback,
    currentChatInstanceRef,
    sidebarCollapseState,
    handleSidebarCollapse,
    clearChatList,
    setClearChatList,
    isResponding,
    setIsResponding,
    currentConversationInputs,
    setCurrentConversationInputs,
    allInputsHidden,
    initUserVariables,
  } = useChatWithHistory(installedAppInfo)

  return (
    <ChatWithHistoryContext.Provider value={{
      appData,
      appParams,
      appMeta,
      appChatListDataLoading,
      currentConversationId,
      currentConversationItem,
      appPrevChatTree,
      pinnedConversationList,
      conversationList,
      newConversationInputs,
      newConversationInputsRef,
      handleNewConversationInputsChange,
      inputsForms,
      handleNewConversation,
      handleStartChat,
      handleChangeConversation,
      handlePinConversation,
      handleUnpinConversation,
      handleDeleteConversation,
      conversationRenaming,
      handleRenameConversation,
      handleNewConversationCompleted,
      chatShouldReloadKey,
      isMobile,
      isInstalledApp,
      appId,
      handleFeedback,
      currentChatInstanceRef,
      themeBuilder,
      sidebarCollapseState,
      handleSidebarCollapse,
      clearChatList,
      setClearChatList,
      isResponding,
      setIsResponding,
      currentConversationInputs,
      setCurrentConversationInputs,
      allInputsHidden,
      initUserVariables,
    }}>
      <ChatWithHistory className={className} />
    </ChatWithHistoryContext.Provider>
  )
}

const ChatWithHistoryWrapWithCheckToken: FC<ChatWithHistoryWrapProps> = ({
  installedAppInfo,
  className,
}) => {
  return (
    <ChatWithHistoryWrap
      installedAppInfo={installedAppInfo}
      className={className}
    />
  )
}

export default ChatWithHistoryWrapWithCheckToken