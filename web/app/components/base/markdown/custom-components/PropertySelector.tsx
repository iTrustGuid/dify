'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { useSearchParams } from 'next/navigation';
import styles from './PropertySelector.module.css';
import { INTELNET_BDCDJPT_URL } from '@/config';

interface PropertyItem {
  zl: string;           // 房产坐落
  bdcqzh: string;       // 不动产权证号
  dy: string;           // 是否抵押（是/否）
  cf: string;           // 是否查封（是/否）
}

interface ApiResponse<T> {
  result_code: string;
  result_msg: string;
  result: T;
}

interface Props {
  onConfirm?: (property: PropertyItem) => void;
  onCancel?: () => void;
}

const baseUrl = location.href.startsWith('https') && INTELNET_BDCDJPT_URL || 'http://localhost:9000/';
const API_URL = `${baseUrl}bdcpt/a/json/zssel/getCqzhList`;

export function PropertySelector({ onConfirm, onCancel }: Props) {
  const searchParams = useSearchParams();
  const userToken = searchParams.get('userToken') || '';

  const [properties, setProperties] = useState<PropertyItem[]>([]);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);

  // 获取房产列表
  const fetchProperties = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const response = await fetch(API_URL, {
        method: 'GET',
        headers: {
          'Authorization': userToken,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data: ApiResponse<PropertyItem[]> = await response.json();

      if (data.result_code !== '200') {
        throw new Error(data.result_msg || '获取房产列表失败');
      }

      setProperties(data.result.infos || []);
      // setProperties([{
      //   zl: '示例房产坐落地址',
      //   bdcqzh: '赣2025万年县不动产权第0001566号',
      //   dy: '否',
      //   cf: '否',
      // },
      // {
      //   zl: '示例房产坐落地址1',
      //   bdcqzh: '赣2025万年县不动产权第0001567号',
      //   dy: '否',
      //   cf: '否',
      // }]);
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : '获取房产列表失败，请稍后重试';
      setError(errorMessage);
      console.error('Error fetching properties:', err);
    } finally {
      setLoading(false);
    }
  }, [userToken]);

  // 确认选择
  const handleConfirm = useCallback(async () => {
    if (selectedIndex === null) {
      setError('请选择一套房产');
      return;
    }

    try {
      setConfirming(true);
      const selectedProperty = properties[selectedIndex];
      onConfirm?.(selectedProperty);
      // window.postMessage({ type: 'dify-chatbot-append-message', message: `您选择的不动产权证号为: ${selectedProperty.bdcqzh}` }, '*');
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : '确认失败，请重试';
      setError(errorMessage);
    } finally {
      setConfirming(false);
    }
  }, [selectedIndex, properties, onConfirm]);

  // 取消
  const handleCancel = useCallback(() => {
    onCancel?.();
  }, [onCancel]);

  // 初始化加载
  useEffect(() => {
    if (userToken) {
      fetchProperties();
    } else {
      setError('未找到用户令牌，请检查URL参数');
      setLoading(false);
    }
  }, [userToken, fetchProperties]);

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

  if (error && properties.length === 0) {
    return (
      <div className={styles.container}>
        <div className={styles.errorContainer}>
          <p className={styles.errorIcon}>⚠️</p>
          <p className={styles.errorMessage}>{error}</p>
          <button
            className={styles.retryButton}
            onClick={() => {
              setError(null);
              fetchProperties();
            }}
          >
            重试
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h1>选择房产</h1>
        <p className={styles.subheader}>请选择要办理的房产</p>
      </div>

      {error && (
        <div className={styles.errorBanner}>
          <span className={styles.errorIcon}>✕</span>
          <span>{error}</span>
        </div>
      )}

      <div className={styles.content}>
        {properties.length === 0 ? (
          <div className={styles.emptyState}>
            <p className={styles.emptyIcon}>📭</p>
            <p className={styles.emptyText}>暂无房产记录</p>
          </div>
        ) : (
          <div className={styles.propertyList}>
            {properties.map((property, index) => (
              <div
                key={index}
                className={`${styles.propertyItem} ${selectedIndex === index ? styles.selected : ''
                  }`}
                onClick={() => setSelectedIndex(index)}
              >
                <div className={styles.itemHeader}>
                  <div className={styles.checkbox}>
                    {selectedIndex === index && (
                      <div className={styles.checkmark}>✓</div>
                    )}
                  </div>
                  <div className={styles.itemContent}>
                    <p className={styles.bdcqzh}>{property.cqzh}</p>
                    <p className={styles.zl}>{property.zl}</p>
                  </div>
                </div>

                <div className={styles.itemFooter}>
                  <span
                    className={`${styles.badge} ${property.sfdy === '1' ? styles.badgeDanger : styles.badgeSuccess
                      }`}
                  >
                    抵押: {property.sfdy === '1' ? '是' : '否'}
                  </span>
                  <span
                    className={`${styles.badge} ${property.sfcf === '1' ? styles.badgeDanger : styles.badgeSuccess
                      }`}
                  >
                    查封: {property.sfcf === '1' ? '是' : '否'}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className={styles.footer}>
        <button
          className={styles.cancelButton}
          onClick={handleCancel}
          disabled={confirming}
        >
          取消
        </button>
        <button
          className={styles.confirmButton}
          onClick={handleConfirm}
          disabled={selectedIndex === null || confirming}
        >
          {confirming ? (
            <>
              <span className={styles.spinner2}></span>
              确定中...
            </>
          ) : (
            '确定'
          )}
        </button>
      </div>
    </div>
  );
}
