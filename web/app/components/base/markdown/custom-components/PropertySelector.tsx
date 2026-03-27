'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { useSearchParams } from 'next/navigation';
import styles from './PropertySelector.module.css';

interface UserInfo {
  no: string;           // 身份证号
  name: string;         // 用户名
  yhid?: string;        // 用户ID
  token?: string;       // 令牌
}

interface PropertyItem {
  zl: string;           // 房产坐落
  bdcqzh: string;       // 不动产权证号
  sfdy: string;         // 是否抵押（0/1）
  sfcf: string;         // 是否查封（0/1）
  bdcdyh: string;       // 不动产单元号
  yt: string;           // 用途
  mj: string;           // 面积
  qlrmc: string;        // 权利人名称
  ywh?: string;         // 业务号
  mobile?: string
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

const BASE_URL = location.href.startsWith('https') && INTELNET_BDCDJPT_URL || 'http://localhost:9000/';
const API_USER_INFO = `${BASE_URL}bdcpt/a/json/user/getUserInfo`;
const API_PROPERTY_LIST = `${BASE_URL}bdcpt/a/json/hlwywbase/selfwbyytjlist`;

export function PropertySelector({ onConfirm, onCancel }: Props) {
  const searchParams = useSearchParams();
  const userToken = searchParams.get('userToken') || '';

  const [userInfo, setUserInfo] = useState<UserInfo | null>(null);
  const [properties, setProperties] = useState<PropertyItem[]>([]);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);

  // 获取用户信息
  const fetchUserInfo = useCallback(async () => {
    try {
      const response = await fetch(API_USER_INFO, {
        method: 'GET',
        headers: {
          'Authorization': userToken,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error(`获取用户信息失败: HTTP ${response.status}`);
      }

      const data: ApiResponse<UserInfo> = await response.json();

      if (data.result_code !== '200') {
        throw new Error(data.result_msg || '获取用户信息失败');
      }

      setUserInfo(data.result);
      return data.result;
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : '获取用户信息失败';
      setError(errorMessage);
      console.error('Error fetching user info:', err);
      return null;
    }
  }, [userToken]);

  // 获取房产列表
  const fetchProperties = useCallback(async (user: UserInfo) => {
    try {
      setError(null);

      const params = new URLSearchParams({
        name: user.name,
        no: user.no,
        yhid: user.yhid || 'e595775e25664452ac080bcce088e14b',
        basis: '1',
      });

      const response = await fetch(`${API_PROPERTY_LIST}?${params.toString()}`, {
        method: 'GET',
        headers: {
          'Authorization': userToken,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error(`获取房产列表失败: HTTP ${response.status}`);
      }

      const data: ApiResponse<PropertyItem[]> = await response.json();

      if (data.result_code !== '200') {
        throw new Error(data.result_msg || '获取房产列表失败');
      }

      setProperties(Array.isArray(data.result) ? data.result : []);
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : '获取房产列表失败，请稍后重试';
      setError(errorMessage);
      console.error('Error fetching properties:', err);
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
      onConfirm?.({ ...selectedProperty, mobile: userInfo.mobile });
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

  // 初始化加载：先获取用户信息，再获取房产列表
  useEffect(() => {
    const initialize = async () => {
      try {
        setLoading(true);

        if (!userToken) {
          setError('未找到用户令牌，请检查URL参数');
          setLoading(false);
          return;
        }

        const user = await fetchUserInfo();
        if (user) {
          await fetchProperties(user);
        }
      } finally {
        setLoading(false);
      }
    };

    initialize();
  }, [userToken, fetchUserInfo, fetchProperties]);

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
            onClick={async () => {
              setError(null);
              const user = await fetchUserInfo();
              if (user) {
                await fetchProperties(user);
              }
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
                    <p className={styles.bdcqzh}>{property.bdcqzh}</p>
                    <p className={styles.zl}>{property.zl}</p>
                  </div>
                </div>

                <div className={styles.itemFooter}>
                  <span
                    className={`${styles.badge} ${property.sfdy === '0次' || property.sfdy === '0' ? styles.badgeSuccess : styles.badgeDanger
                      }`}
                  >
                    抵押: {property.dyqk}
                  </span>
                  <span
                    className={`${styles.badge} ${property.sfcf === '0次' || property.sfcf === '0' ? styles.badgeSuccess : styles.badgeDanger
                      }`}
                  >
                    查封: {property.sfcf}
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
