'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { useSearchParams } from 'next/navigation';
import styles from './app-yfwf-zm.module.css';
import { INTELNET_BDCDJPT_URL } from '@/config';
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

const baseUrl = typeof window !== 'undefined' && location.href.startsWith('https') && INTELNET_BDCDJPT_URL || 'http://localhost:9000/';

export function PropertyCertificate() {
  const searchParams = useSearchParams();
  const userToken = searchParams.get('userToken') || '';

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
  const [generateSuccess, setGenerateSuccess] = useState(false);

  // ✅ 使用修复后的 Hook
  const { openFilePreview } = useWxMiniProgramPreview();

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

      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data: ApiResponse<PropertyResult> = await response.json();
      if (data.result_code !== '200') throw new Error(data.result_msg);

      const result = data.result;
      setPropertyList(result.infos || []);
      setCertificateType(result.infos?.length ? 'owned' : 'unowned');
    } catch (err) {
      setError(err instanceof Error ? err.message : '获取失败');
    } finally {
      setLoading(false);
    }
  }, [userToken]);

  const fetchDictList = useCallback(async () => {
    try {
      setDictLoading(true);
      const response = await fetch(
        `${baseUrl}bdcpt/a/json/dict/getDictList?type=bdc_cdyt`,
        { headers: { Authorization: userToken } }
      );
      const data: ApiResponse<DictItem[]> = await response.json();
      setDictList(data.result || []);
    } catch (err) {
      setError('获取用途失败');
    } finally {
      setDictLoading(false);
    }
  }, [userToken]);

  const handleGenerate = useCallback(async () => {
    if (certificateType === 'owned' && !selectedProperty) {
      setError('请选择房屋');
      return;
    }
    if (!selectedPurpose) {
      setError('请选择用途');
      return;
    }

    try {
      setGenerating(true);
      setError(null);
      const params = new URLSearchParams();
      params.append('sfyf', certificateType === 'owned' ? '1' : '0');
      params.append('cdyt', selectedPurpose);
      params.append('isedition', '1');

      if (certificateType === 'owned') {
        const prop = propertyList.find(p => p.id === selectedProperty);
        if (prop) params.append('bdcqzh', prop.cqzh);
      }

      const url = `${baseUrl}bdcpt/a/json/archives/getdzarchive?${params}`;
      const res = await fetch(url, { headers: { Authorization: userToken } });
      const data = await res.json();

      if (data.result_code !== '200') throw new Error(data.result_msg);
      await fetchPreviewUrl(data.result);
      setSuccessMessage('生成成功！');
      setGenerateSuccess(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : '生成失败');
    } finally {
      setGenerating(false);
    }
  }, [certificateType, selectedProperty, selectedPurpose, propertyList, userToken]);

  const fetchPreviewUrl = useCallback(async (fileUrl: string) => {
    try {
      setPreviewLoading(true);
      const fullUrl = `https://www.wnxbdcdjzx.com/estate/${fileUrl}`;
      setPreviewUrl(fullUrl);
      setShowPreview(true);
    } catch {
      setError('预览链接失败');
    } finally {
      setPreviewLoading(false);
    }
  }, []);

  // ✅ 打开预览（无报错版）
  const handleOpenPreview = useCallback(async () => {
    if (!previewUrl) return;
    await openFilePreview(previewUrl);
  }, [previewUrl, openFilePreview]);

  const handleReset = () => {
    setSelectedProperty('');
    setSelectedPurpose('');
    setError(null);
    setSuccessMessage(null);
    setPreviewUrl(null);
    setShowPreview(false);
    setGenerateSuccess(false);
  };

  useEffect(() => {
    if (userToken) {
      fetchPropertyInfo();
      fetchDictList();
    } else {
      setError('缺少用户令牌');
      setLoading(false);
    }
  }, [userToken, fetchPropertyInfo, fetchDictList]);

  if (loading) {
    return <div className={styles.container}><div className={styles.loading}><div className={styles.spinner}></div><p>加载中...</p></div></div>;
  }

  if (error && !successMessage) {
    return <div className={styles.container}><div className={styles.error}><p className={styles.errorIcon}>⚠️</p><p className={styles.errorMessage}>{error}</p><button className={styles.retryButton} onClick={() => { setError(null); fetchPropertyInfo(); }}>重试</button></div></div>;
  }

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h1>房产证明</h1>
        <p className={styles.subheader}>{certificateType === 'owned' ? '有房证明' : '无房证明'}</p>
      </div>

      {successMessage && <div className={styles.successBanner}><span className={styles.successIcon}>✓</span><span>{successMessage}</span></div>}
      {error && <div className={styles.errorBanner}><span className={styles.errorBannerIcon}>✕</span><span>{error}</span></div>}

      <div className={styles.formContainer}>
        {certificateType === 'owned' && (
          <>
            <div className={styles.formGroup}>
              <label className={styles.formLabel}>选择房屋 <span className={styles.required}>*</span></label>
              <select className={styles.select} value={selectedProperty} onChange={(e) => setSelectedProperty(e.target.value)} disabled={generating}>
                <option value="">请选择房屋</option>
                {propertyList.map(p => <option key={p.id} value={p.id}>{p.cqzh} - {p.zl}</option>)}
              </select>
            </div>

            {selectedProperty && (
              <div className={styles.propertyInfo}>
                {propertyList.find(p => p.id === selectedProperty) && (
                  <>
                    <div className={styles.infoRow}><span className={styles.infoLabel}>权利人：</span><span className={styles.infoValue}>{propertyList.find(p => p.id === selectedProperty)!.name}</span></div>
                    <div className={styles.infoRow}><span className={styles.infoLabel}>坐落：</span><span className={styles.infoValue}>{propertyList.find(p => p.id === selectedProperty)!.zl}</span></div>
                    <div className={styles.infoRow}><span className={styles.infoLabel}>登记时间：</span><span className={styles.infoValue}>{propertyList.find(p => p.id === selectedProperty)!.createDate}</span></div>
                  </>
                )}
              </div>
            )}
          </>
        )}

        {certificateType === 'unowned' && (
          <div className={styles.unownedTip}><p className={styles.unownedIcon}>📋</p><p className={styles.unownedText}>暂无房产记录，可生成无房证明</p></div>
        )}

        <div className={styles.formGroup}>
          <label className={styles.formLabel}>查档用途 <span className={styles.required}>*</span></label>
          <select className={styles.select} value={selectedPurpose} onChange={(e) => setSelectedPurpose(e.target.value)} disabled={generating || dictLoading}>
            <option value="">{dictLoading ? '加载中...' : '请选择用途'}</option>
            {dictList.map(item => <option key={item.value} value={item.value}>{item.label}</option>)}
          </select>
        </div>

        <div className={styles.buttonGroup}>
          <button className={styles.generateButton} onClick={handleGenerate} disabled={generating || dictLoading || !selectedPurpose || generateSuccess}>
            {generating ? <><span className={styles.spinner2}></span>生成中...</> : generateSuccess ? '✓ 已生成' : '生成证明'}
          </button>
          <button className={styles.resetButton} onClick={handleReset} disabled={generating}>重置</button>
        </div>
      </div>

      {showPreview && previewUrl && (
        <div className={styles.modal}>
          <div className={styles.modalContent}>
            <div className={styles.modalHeader}><h2>证明预览</h2><button className={styles.closeButton} onClick={() => setShowPreview(false)}>✕</button></div>
            <div className={styles.modalBody}><div className={styles.previewInfo}><p>点击按钮在小程序内预览</p></div></div>
            <div className={styles.modalFooter}>
              <button className={styles.previewButton} onClick={handleOpenPreview} disabled={previewLoading}>{previewLoading ? '加载中...' : '打开预览'}</button>
              <button className={styles.closeModalButton} onClick={() => setShowPreview(false)}>关闭</button>
            </div>
          </div>
        </div>
      )}

      {showPreview && <div className={styles.modalBackdrop} onClick={() => setShowPreview(false)}></div>}
    </div>
  );
}