'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { useSearchParams } from 'next/navigation';
import styles from './app-yfwf-zm.module.css';
import { INTELNET_BDCDJPT_URL } from '@/config';
// 🔥 1. 导入通用Hook（同级路径）
import { useWxMiniProgramPreview } from './WxMiniProgramPreview';

interface PropertyInfo {
  id: string;
  cqzh: string;
  name: string;
  sfdy: string;
  sfcf: string;
  zl: string;
  createDate: string;
  filepath: string;
  remarks: string;
}

interface PropertyResult {
  cf: number;
  dy: number;
  zc: number;
  sum: number;
  infos: PropertyInfo[];
}

interface DictItem {
  label: string;
  value: string;
}

interface ApiResponse<T> {
  result_code: string;
  result_msg: string;
  result: T;
}

interface GenerateResponse {
  result_code: string;
  result_msg: string;
  result: string;
}

interface PreviewResponse {
  result_code: string;
  result_msg: string;
  result: {
    data: string;
  };
}

type CertificateType = 'owned' | 'unowned' | null;

const baseUrl = location.href.startsWith('https') && INTELNET_BDCDJPT_URL || 'http://localhost:9000/';

export function PropertyCertificate() {
  const searchParams = useSearchParams();
  const userToken = searchParams.get('userToken') || '';

  // 状态管理
  const [certificateType, setCertificateType] = useState<CertificateType>(null);
  const [propertyList, setPropertyList] = useState<PropertyInfo[]>([]);
  const [dictList, setDictList] = useState<DictItem[]>([]);

  const [selectedProperty, setSelectedProperty] = useState<string>('');
  const [selectedPurpose, setSelectedPurpose] = useState<string>('');

  const [loading, setLoading] = useState(true);
  const [dictLoading, setDictLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [showPreview, setShowPreview] = useState(false);

  // 🔥 2. 使用通用Hook，传入小程序预览页路径（注意路径和原逻辑一致）
  const { openPreview } = useWxMiniProgramPreview('/pagesB/my/preview/preview');

  // 获取房产信息
  const fetchPropertyInfo = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const response = await fetch(
        `${baseUrl}bdcpt/a/json/zssel/getCqzhList`,
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

      const data: ApiResponse<PropertyResult> = await response.json();

      if (data.result_code !== '200') {
        throw new Error(data.result_msg || '获取房产信息失败');
      }

      const result = data.result;
      setPropertyList(result.infos || []);

      // 判断证明类型
      if (result.infos && result.infos.length > 0) {
        setCertificateType('owned');
      } else {
        setCertificateType('unowned');
      }
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : '获取房产信息失败，请稍后重试';
      setError(errorMessage);
      console.error('Error fetching property info:', err);
    } finally {
      setLoading(false);
    }
  }, [userToken]);

  // 获取查档用途列表
  const fetchDictList = useCallback(async () => {
    try {
      setDictLoading(true);

      const response = await fetch(
        `${baseUrl}bdcpt/a/json/dict/getDictList?type=bdc_cdyt`,
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

      const data: ApiResponse<DictItem[]> = await response.json();

      if (data.result_code !== '200') {
        throw new Error(data.result_msg || '获取查档用途失败');
      }

      setDictList(data.result || []);
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : '获取查档用途失败，请稍后重试';
      setError(errorMessage);
      console.error('Error fetching dict list:', err);
    } finally {
      setDictLoading(false);
    }
  }, [userToken]);

  // 生成证明
  const handleGenerate = useCallback(async () => {
    if (certificateType === 'owned' && !selectedProperty) {
      setError('请选择一套房屋');
      return;
    }

    if (!selectedPurpose) {
      setError('请选择查档用途');
      return;
    }

    try {
      setGenerating(true);
      setError(null);
      setSuccessMessage(null);

      let url = `${baseUrl}bdcpt/a/json/archives/getdzarchive?`;
      const params = new URLSearchParams();

      params.append('sfyf', certificateType === 'owned' ? '1' : '0');
      params.append('cdyt', selectedPurpose);
      params.append('isedition', '1');

      if (certificateType === 'owned') {
        const property = propertyList.find((p) => p.id === selectedProperty);
        if (!property) {
          throw new Error('房产信息不存在');
        }
        params.append('bdcqzh', property.cqzh);
      }

      url += params.toString();

      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Authorization': userToken,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data: GenerateResponse = await response.json();

      if (data.result_code !== '200') {
        throw new Error(data.result_msg || '生成证明失败');
      }

      // 获取最终访问地址
      await fetchPreviewUrl(data.result);
      setSuccessMessage('证明生成成功！');
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : '生成证明失败，请稍后重试';
      setError(errorMessage);
      console.error('Error generating certificate:', err);
    } finally {
      setGenerating(false);
    }
  }, [certificateType, selectedProperty, selectedPurpose, propertyList, userToken]);

  // 获取预览URL
  const fetchPreviewUrl = useCallback(
    async (fileUrl: string) => {
      try {
        setPreviewLoading(true);

        setPreviewUrl(`https://www.wnxbdcdjzx.com/estate/${fileUrl}/?certType=zzlb'`);
        setShowPreview(true);
      } catch (err) {
        const errorMessage =
          err instanceof Error ? err.message : '获取预览链接失败';
        setError(errorMessage);
        console.error('Error fetching preview url:', err);
      } finally {
        setPreviewLoading(false);
      }
    },
    [userToken]
  );

  // 🔥 3. 简化打开预览逻辑：直接调用通用Hook的openPreview
  const handleOpenPreview = useCallback(async () => {
    if (!previewUrl) return;
    await openPreview(previewUrl); // 直接使用通用方法
  }, [previewUrl, openPreview]);

  // 🔥 4. 删除原组件内重复的以下方法：
  // - isInWechatMiniProgram
  // - isInWechatBrowser
  // - openInWechatMiniProgram
  // - openInWechatBrowser

  // 重置表单
  const handleReset = () => {
    setSelectedProperty('');
    setSelectedPurpose('');
    setError(null);
    setSuccessMessage(null);
    setPreviewUrl(null);
    setShowPreview(false);
  };

  // 初始化加载
  useEffect(() => {
    if (userToken) {
      fetchPropertyInfo();
      fetchDictList();
    } else {
      setError('未找到用户令牌，请检查URL参数');
      setLoading(false);
    }
  }, [userToken, fetchPropertyInfo, fetchDictList]);

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

  if (error && !successMessage) {
    return (
      <div className={styles.container}>
        <div className={styles.error}>
          <p className={styles.errorIcon}>⚠️</p>
          <p className={styles.errorMessage}>{error}</p>
          <button
            className={styles.retryButton}
            onClick={() => {
              setError(null);
              fetchPropertyInfo();
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
        <h1>房产证明</h1>
        <p className={styles.subheader}>
          {certificateType === 'owned' ? '有房证明' : '无房证明'}
        </p>
      </div>

      {successMessage && (
        <div className={styles.successBanner}>
          <span className={styles.successIcon}>✓</span>
          <span>{successMessage}</span>
        </div>
      )}

      {error && (
        <div className={styles.errorBanner}>
          <span className={styles.errorBannerIcon}>✕</span>
          <span>{error}</span>
        </div>
      )}

      <div className={styles.formContainer}>
        {/* 有房证明表单 */}
        {certificateType === 'owned' && (
          <>
            <div className={styles.formGroup}>
              <label className={styles.formLabel}>
                选择房屋 <span className={styles.required}>*</span>
              </label>
              <select
                className={styles.select}
                value={selectedProperty}
                onChange={(e) => setSelectedProperty(e.target.value)}
                disabled={generating}
              >
                <option value="">请选择房屋</option>
                {propertyList.map((property) => (
                  <option key={property.id} value={property.id}>
                    {property.cqzh} - {property.zl}
                  </option>
                ))}
              </select>
            </div>

            {selectedProperty && (
              <div className={styles.propertyInfo}>
                {(() => {
                  const prop = propertyList.find((p) => p.id === selectedProperty);
                  return prop ? (
                    <>
                      <div className={styles.infoRow}>
                        <span className={styles.infoLabel}>权利人：</span>
                        <span className={styles.infoValue}>{prop.name}</span>
                      </div>
                      <div className={styles.infoRow}>
                        <span className={styles.infoLabel}>坐落：</span>
                        <span className={styles.infoValue}>{prop.zl}</span>
                      </div>
                      <div className={styles.infoRow}>
                        <span className={styles.infoLabel}>登记时间：</span>
                        <span className={styles.infoValue}>{prop.createDate}</span>
                      </div>
                    </>
                  ) : null;
                })()}
              </div>
            )}
          </>
        )}

        {/* 无房证明表单 */}
        {certificateType === 'unowned' && (
          <div className={styles.unownedTip}>
            <p className={styles.unownedIcon}>📋</p>
            <p className={styles.unownedText}>
              根据查询，您名下暂无房产记录，可以生成无房证明。
            </p>
          </div>
        )}

        {/* 查档用途选择（通用） */}
        <div className={styles.formGroup}>
          <label className={styles.formLabel}>
            查档用途 <span className={styles.required}>*</span>
          </label>
          <select
            className={styles.select}
            value={selectedPurpose}
            onChange={(e) => setSelectedPurpose(e.target.value)}
            disabled={generating || dictLoading}
          >
            <option value="">
              {dictLoading ? '加载中...' : '请选择查档用途'}
            </option>
            {dictList.map((item) => (
              <option key={item.value} value={item.value}>
                {item.label}
              </option>
            ))}
          </select>
        </div>

        {/* 操作按钮 */}
        <div className={styles.buttonGroup}>
          <button
            className={styles.generateButton}
            onClick={handleGenerate}
            disabled={generating || dictLoading || !selectedPurpose}
          >
            {generating ? (
              <>
                <span className={styles.spinner2}></span>
                生成中...
              </>
            ) : (
              '生成证明'
            )}
          </button>
          <button
            className={styles.resetButton}
            onClick={handleReset}
            disabled={generating}
          >
            重置
          </button>
        </div>
      </div>

      {/* 预览模态框 */}
      {showPreview && previewUrl && (
        <div className={styles.modal}>
          <div className={styles.modalContent}>
            <div className={styles.modalHeader}>
              <h2>证明预览</h2>
              <button
                className={styles.closeButton}
                onClick={() => setShowPreview(false)}
              >
                ✕
              </button>
            </div>

            <div className={styles.modalBody}>
              <div className={styles.previewInfo}>
                <p>证明已生成，点击下方按钮在新标签页中打开预览。</p>
              </div>
            </div>

            <div className={styles.modalFooter}>
              <button
                className={styles.previewButton}
                onClick={handleOpenPreview}
                disabled={previewLoading}
              >
                {previewLoading ? '加载中...' : '打开预览'}
              </button>
              <button
                className={styles.closeModalButton}
                onClick={() => setShowPreview(false)}
              >
                关闭
              </button>
            </div>
          </div>
        </div>
      )}

      {showPreview && (
        <div
          className={styles.modalBackdrop}
          onClick={() => setShowPreview(false)}
        ></div>
      )}
    </div>
  );
}