"use client";
import type { FC } from "react";
import { useEffect, useState, useCallback } from "react";
import { useThemeContext } from "../embedded-chatbot/theme/theme-context";
import { ChatWithHistoryContext, useChatWithHistoryContext } from "./context";
import { useChatWithHistory } from "./hooks";
import Sidebar from "./sidebar";
import Header from "./header";
import HeaderInMobile from "./header-in-mobile";
import ChatWrapper from "./chat-wrapper";
import type { InstalledApp } from "@/models/explore";
import Loading from "@/app/components/base/loading";
import useBreakpoints, { MediaType } from "@/hooks/use-breakpoints";
import cn from "@/utils/classnames";
import useDocumentTitle from "@/hooks/use-document-title";

type ChatWithHistoryProps = {
  className?: string;
};
const ChatWithHistory: FC<ChatWithHistoryProps> = ({ className }) => {
  const {
    appData,
    appChatListDataLoading,
    chatShouldReloadKey,
    isMobile,
    themeBuilder,
    sidebarCollapseState,
  } = useChatWithHistoryContext();
  const isSidebarCollapsed = sidebarCollapseState;
  const customConfig = appData?.custom_config;
  const site = appData?.site;

  const [showSidePanel, setShowSidePanel] = useState(false);
  // ========== 新增：安全区高度状态 ==========
  const [safeAreaBottom, setSafeAreaBottom] = useState(0);

  // ========== 初始化：加载微信JS-SDK + 计算安全区 ==========
  useEffect(() => {
    // 1. 动态加载微信JS-SDK（避免重复加载）
    if (!window.wx) {
      const script = document.createElement("script");
      script.src = "https://res.wx.qq.com/open/js/jweixin-1.6.0.js";
      script.onload = () => console.log("✅ 微信JS-SDK加载完成");
      script.onerror = (err) => console.error("❌ 微信JS-SDK加载失败", err);
      document.head.appendChild(script);
    }

    // 2. 计算iPhone安全区高度
    const calcSafeArea = () => {
      if (typeof window === "undefined") return 0;
      // 兼容不同浏览器的安全区API
      const bottom =
        window.safeAreaInsets?.bottom ||
        parseInt(
          getComputedStyle(document.documentElement).getPropertyValue(
            "--safe-area-inset-bottom",
          ),
        ) ||
        parseInt(
          getComputedStyle(document.documentElement).getPropertyValue(
            "env(safe-area-inset-bottom)",
          ),
        ) ||
        0;
      setSafeAreaBottom(bottom);

      // 给html/body添加内联样式（无需全局文件）
      document.documentElement.style.paddingBottom = `${bottom}px`;
      document.documentElement.style.boxSizing = "border-box";
      document.body.style.paddingBottom = `${bottom}px`;
      document.body.style.boxSizing = "border-box";
      document.body.style.height = "100%";
      document.body.style.margin = "0";
      document.body.style.overflowX = "hidden";
    };

    // 初始化计算 + 窗口变化时重新计算
    calcSafeArea();
    window.addEventListener("resize", calcSafeArea);
    return () => window.removeEventListener("resize", calcSafeArea);
  }, []);

  // 监听全局事件显示历史栏
  useEffect(() => {
    const handleShow = () => setShowSidePanel(true);
    window.addEventListener("force-show-sidebar", handleShow);
    return () => window.removeEventListener("force-show-sidebar", handleShow);
  }, []);
  
  // ========== 原有：明文URL Scheme跳转逻辑（保留） ==========
  const jumpToMiniProgramB = useCallback(() => {
    try {
      const schemeParams = {
        appid: "wxad0a1aff5f570168",
        path: "pages/index/index",
        query: "",
        env_version: "",
      };
      const scheme = `weixin://dl/business/?appid=${schemeParams.appid}&path=${schemeParams.path}&query=${schemeParams.query}&env_version=${schemeParams.env_version}`;
      window.location.href = scheme;
      setTimeout(() => {
        window.location.href = scheme;
      }, 100);
      console.log("✅ 明文Scheme跳转触发：", scheme);
    } catch (err) {
      console.error("❌ 跳转失败", err);
      alert("❌ 跳转失败，请重试");
    }
  }, []);

  // ========== 优化：postMessage中转跳转逻辑（强制触发） ==========
  const jumpToMiniProgramBByPostMessage = useCallback(() => {
    try {
      const isWechatMiniProgram = /miniProgram/i.test(navigator.userAgent);
      if (!isWechatMiniProgram) {
        alert("请在微信小程序内操作！");
        return;
      }
      if (!window.wx || !window.wx.miniProgram) {
        alert("微信环境初始化中，请稍候重试！");
        return;
      }
      window.wx.miniProgram.postMessage({
        data: {
          type: "jumpToMiniProgram",
          appId: "wxad0a1aff5f570168",
          path: "pages/index/index",
          envVersion: "trial",
        },
      });
      // 强制触发消息传递
      window.wx.miniProgram.navigateTo({ url: "/" });
      alert("正在跳转小程序，请稍候...");
      console.log("✅ 已向小程序发送跳转指令 + 强制触发");
    } catch (err) {
      console.error("❌ 中转跳转指令发送失败", err);
      alert("❌ 跳转指令发送失败，请重试");
    }
  }, []);

  // ========== 原有逻辑完全保留 ==========
  useEffect(() => {
    themeBuilder?.buildTheme(
      site?.chat_color_theme,
      site?.chat_color_theme_inverted,
    );
  }, [site, customConfig, themeBuilder]);

  useEffect(() => {
    if (!isSidebarCollapsed) setShowSidePanel(false);
  }, [isSidebarCollapsed]);

  useDocumentTitle(site?.title || "Chat");

  return (
    <div
      className={cn(
        "flex h-full bg-background-default-burn",
        isMobile && "flex-col",
        className,
      )}
      style={{
        // 核心：iPhone安全区适配（内联样式）
        height: "100vh",
        height: `calc(100vh - ${safeAreaBottom}px)`,
        paddingBottom: `${safeAreaBottom}px`,
        boxSizing: "border-box",
        position: "relative",
        overflow: "hidden",
        margin: "0",
      }}
    >
      {/* ========== 原有页面结构完全保留 ========== */}
      {!isMobile && (
        <div
          className={cn(
            "flex w-[236px] flex-col p-1 pr-0 transition-all duration-200 ease-in-out",
            isSidebarCollapsed && "w-0 overflow-hidden !p-0",
          )}
        >
          <Sidebar />
        </div>
      )}
      {isMobile && <HeaderInMobile />}
      <div
        className={cn(
          "relative grow p-2",
          isMobile && "h-[calc(100%_-_56px)] p-0",
        )}
      >
        {isSidebarCollapsed && (
          <div
            className={cn(
              "absolute top-0 z-20 flex h-full w-[256px] flex-col p-2 transition-all duration-500 ease-in-out",
              showSidePanel ? "left-0" : "left-[-248px]",
            )}
            onMouseEnter={() => setShowSidePanel(true)}
            onMouseLeave={() => setShowSidePanel(false)}
          >
            <Sidebar isPanel panelVisible={showSidePanel} />
          </div>
        )}
        <div
          className={cn(
            "flex h-full flex-col overflow-hidden border-[0,5px] border-components-panel-border-subtle bg-chatbot-bg",
            isMobile ? "rounded-t-2xl" : "rounded-2xl",
          )}
        >
          {!isMobile && <Header />}
          {appChatListDataLoading && <Loading type="app" />}
          {!appChatListDataLoading && <ChatWrapper key={chatShouldReloadKey} />}
        </div>
      </div>
    </div>
  );
};

// ========== 原有Wrap组件完全保留 ==========
export type ChatWithHistoryWrapProps = {
  installedAppInfo?: InstalledApp;
  className?: string;
};
const ChatWithHistoryWrap: FC<ChatWithHistoryWrapProps> = ({
  installedAppInfo,
  className,
}) => {
  const media = useBreakpoints();
  const isMobile = media === MediaType.mobile;
  const themeBuilder = useThemeContext();

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
  } = useChatWithHistory(installedAppInfo);
  // ==============================================
  // 👇👇👇 把这段 useEffect 粘贴到这里！！！
  // ==============================================
  useEffect(() => {
    const handleMessage = (e: MessageEvent) => {
      if (e.data.type === "OPEN_SIDEBAR") {
        window.dispatchEvent(new CustomEvent("force-show-sidebar"));
      }
      if (e.data.type === "NEW_CONVERSATION") {
        handleNewConversation();
      }
    };
    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [handleSidebarCollapse, handleNewConversation]);
  return (
    <ChatWithHistoryContext.Provider
      value={{
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
      }}
    >
      <ChatWithHistory className={className} />
    </ChatWithHistoryContext.Provider>
  );
};

const ChatWithHistoryWrapWithCheckToken: FC<ChatWithHistoryWrapProps> = ({
  installedAppInfo,
  className,
}) => {
  return (
    <ChatWithHistoryWrap
      installedAppInfo={installedAppInfo}
      className={className}
    />
  );
};

export default ChatWithHistoryWrapWithCheckToken;
