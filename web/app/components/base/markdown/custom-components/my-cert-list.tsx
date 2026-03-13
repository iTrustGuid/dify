'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { useSearchParams } from 'next/navigation';
import Image from 'next/image';
import styles from './CertificateList.module.css';
import { INTELNET_BDCDJPT_URL } from '@/config';

interface Certificate {
  id?: string;
  userid?: string;
  types: string;
  bdcqzh: string;
  zl: string;
  zt?: string;
  url: string;
  createdate?: string;
}

interface ApiResponse<T> {
  result_code: string;
  result_msg: string;
  result: T;
}

interface PreviewResponse {
  result_code: string;
  result_msg: string;
  result: {
    data: string;
  };
}

const baseUrl = location.href.startsWith('https') && INTELNET_BDCDJPT_URL || 'http://localhost:9000/';

export function AppMyCertList() {
  const searchParams = useSearchParams();
  const userToken = searchParams.get('userToken') || '';

  const [certificates, setCertificates] = useState<Certificate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [previewingId, setPreviewingId] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  // 获取证照列表
  const fetchCertificateList = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const response = await fetch(
        `${baseUrl}bdcpt/a/json/elec/eleclist`,
        {
          method: 'GET',
          headers: {
            'Authorization': userToken,
            'Content-Type': 'application/json',
          },
        }
      );

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data: ApiResponse<Certificate[]> = await response.json();

      if (data.result_code !== '200') {
        throw new Error(data.result_msg || '获取证照列表失败');
      }

      setCertificates(data.result || []);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : '获取证照列表失败，请稍后重试';
      setError(errorMessage);
      console.error('Error fetching certificates:', err);
    } finally {
      setLoading(false);
    }
  }, [userToken]);

  // 预览证照
  const handlePreview = useCallback(async (certificate: Certificate) => {
    try {
      setPreviewLoading(true);

      const response = await fetch(
        `${baseUrl}bdcpt/a/json/elec/getelecmsg?url=${encodeURIComponent(
          certificate.url
        )}`,
        {
          method: 'GET',
          headers: {
            'Authorization': userToken,
            'Content-Type': 'application/json',
          },
        }
      );

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data: PreviewResponse = await response.json();

      if (data.result_code !== '200') {
        throw new Error(data.result_msg || '获取预览链接失败');
      }

      const previewUrl = data.result_msg;

      // 检测环境并打开预览
      openPreview(previewUrl);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : '预览失败，请稍后重试';
      alert(errorMessage);
      console.error('Error previewing certificate:', err);
    } finally {
      setPreviewLoading(false);
    }
  }, [userToken]);

  // 打开预览链接 - 适配不同环境
  const openPreview = useCallback((url: string) => {
    // 检测是否在微信小程序中
    if (isInWechatMiniProgram()) {
      openInWechatMiniProgram(url);
    } else if (isInWechatBrowser()) {
      // 微信浏览器
      openInWechatBrowser(url);
    } else {
      // PC浏览器或其他环境
      window.open(url, '_blank', 'noopener,noreferrer');
    }
  }, []);

  // 检测是否在微信小程序webview中
  const isInWechatMiniProgram = (): boolean => {
    return typeof (window as any).wx !== 'undefined' && (window as any).wx.miniProgram;
  };

  // 检测是否在微信浏览器中
  const isInWechatBrowser = (): boolean => {
    const ua = navigator.userAgent.toLowerCase();
    return /micromessenger/.test(ua);
  };

  // 在微信小程序中打开
  const openInWechatMiniProgram = (url: string) => {
    const wx = (window as any).wx;
    if (wx?.miniProgram?.navigateTo) {
      // 如果是小程序环境，跳转到web-view页面
      wx.miniProgram.navigateTo({
        url: `/pages/preview/index?url=${encodeURIComponent(url)}`,
      });
    } else if (wx?.miniProgram?.postMessage) {
      // 或者通过postMessage通知小程序
      wx.miniProgram.postMessage({
        data: {
          action: 'openPreview',
          url: url,
        },
      });
      wx.miniProgram.navigateBack({delta: 1})
    }else if (wx?.miniProgram?.redirectTo) {
      // 或者通过postMessage通知小程序
      wx.miniProgram.redirectTo({
        data: {
          action: 'openPreview2',
          url: url,
        },
      });
    }
  };

  // 在微信浏览器中打开
  const openInWechatBrowser = (url: string) => {
    // 微信浏览器可能会限制某些操作，直接打开
    window.location.href = url;
  };

  // 格式化日期
  const formatDate = (dateString?: string): string => {
    if (!dateString) return '—';
    try {
      const date = new Date(dateString);
      return date.toLocaleDateString('zh-CN', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      });
    } catch {
      return dateString;
    }
  };

  // 初始化加载
  useEffect(() => {
    if (userToken) {
      fetchCertificateList();
    } else {
      setError('未找到用户令牌，请检查URL参数');
      setLoading(false);
    }
  }, [userToken, fetchCertificateList]);

  if (loading) {
    return (
      <div className={styles.container}>
        <div className={styles.loading}>
          <div className={styles.spinner}></div>
          <p>加载中...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className={styles.container}>
        <div className={styles.error}>
          <p className={styles.errorIcon}>⚠️</p>
          <p className={styles.errorMessage}>{error}</p>
          <button
            className={styles.retryButton}
            onClick={fetchCertificateList}
          >
            重试
          </button>
        </div>
      </div>
    );
  }

  if (certificates.length === 0) {
    return (
      <div className={styles.container}>
        <div className={styles.empty}>
          <p className={styles.emptyIcon}>📄</p>
          <p className={styles.emptyText}>暂无可用证照</p>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h1>我的证照</h1>
        <p className={styles.subheader}>共 {certificates.length} 份证照</p>
      </div>

      <div className={styles.listContainer}>
        {certificates.map((cert, index) => (
          <div key={cert.id || index} className={styles.certificateCard}>
            <div className={styles.cardHeader}>
              <span className={styles.type}>{cert.types}</span>
              {cert.createdate && (
                <span className={styles.date}>
                  {formatDate(cert.createdate)}
                </span>
              )}
            </div>

            <div className={styles.cardContent}>
              <div className={styles.infoGroup}>
                <label className={styles.label}>证件号</label>
                <p className={styles.value} title={cert.bdcqzh}>
                  {cert.bdcqzh}
                </p>
              </div>

              <div className={styles.infoGroup}>
                <label className={styles.label}>坐落</label>
                <p className={styles.value} title={cert.zl}>
                  {cert.zl}
                </p>
              </div>
            </div>

            <div className={styles.cardFooter}>
              <button
                className={styles.previewButton}
                onClick={() => handlePreview(cert)}
                disabled={previewLoading}
              >
                {previewLoading ? '加载中...' : '预览'}
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}