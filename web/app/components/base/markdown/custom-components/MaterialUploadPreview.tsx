'use client';

import React, { useEffect, useState, useCallback, useRef } from 'react';
import { useSearchParams } from 'next/navigation';
import styles from './MaterialUploadPreview.module.css';
import { useWxMiniProgramPreview } from './WxMiniProgramPreview';
import { getMaterialRequirements, getMaterialName, type MaterialRequirement } from './materialRequirements.config';
import { INTELNET_BDCDJPT_URL } from '@/config';

interface FileInfo {
  id: string;
  materialId: string;
  fileName: string;
  filePath: string;
  fileType: string;
  uploadTime: string;
  size: number;
}

interface UploadedFile {
  materialId: string;
  files: FileInfo[];
}

interface UploadResponse {
  result_code: string;
  result_msg: string;
  result: {
    ids: string[];
    fjid: string;
    filePath: string;
    fileName: string;
  };
}

interface SubmitResponse {
  result_code: string;
  result_msg: string;
  result: Record<string, unknown>;
}

const baseUrl = location.href.startsWith('https') && INTELNET_BDCDJPT_URL || 'http://localhost:9000/';
const UPLOAD_API = `${baseUrl}bdcpt/a/json/fj/save`;
const PARSE_API = `${location.href.startsWith('https') && 'https://wnxai.esconsoft.com/' || 'http://localhost:9000/'}v1/workflows/run`;
const SUBMIT_API = `${baseUrl}bdcpt/a/json/hlwywbase/kybsave`;
const FJID = '615fc82e0a294e95a841cd886006749b';
const ETICKET_URL = 'https://www.wnxbdcdjzx.com/eticket';
const CLOUD_SIGN_URL = 'https://www.wnxbdcdjzx.com/cloudsign';
const MINI_PROGRAM_PATH = '/pagesB/my/process/detail';

interface Props {
  data: string;
  type: string;
}

export function MaterialUploadPreview({ data, type }: Props) {
  const searchParams = useSearchParams();
  const userToken = searchParams.get('userToken') || '';

  const [materials, setMaterials] = useState<UploadedFile[]>([]);
  const [materialRequirements, setMaterialRequirements] = useState<MaterialRequirement[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [parsing, setParsing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const [previewFile, setPreviewFile] = useState<FileInfo | null>(null);
  const [showPreview, setShowPreview] = useState(false);
  const [showSubmitConfirm, setShowSubmitConfirm] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const { openPreview } = useWxMiniProgramPreview(MINI_PROGRAM_PATH);

  useEffect(() => {
    const requirements = getMaterialRequirements(type);
    setMaterialRequirements(requirements);
    setLoading(false);
  }, [type]);

  useEffect(() => {
    const initialMaterials: UploadedFile[] = materialRequirements.map((req) => ({
      materialId: req.id,
      files: [],
    }));
    setMaterials(initialMaterials);
  }, [materialRequirements]);

  const getFileType = useCallback((fileName: string): string => {
    const ext = fileName.split('.').pop()?.toLowerCase() || '';
    if (['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(ext)) {
      return 'image';
    }
    if (ext === 'pdf') {
      return 'pdf';
    }
    return 'unknown';
  }, []);

  const parseSingleFile = useCallback(
    async (file: File, response: UploadResponse): Promise<void> => {
      try {
        const parseResponse = await fetch(PARSE_API, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer app-AimbKPaMzo7jMUS1xFu6Ylnc`,
          },
          body: JSON.stringify({
            inputs: {
              uploadFiles: [
                {
                  type: "image",
                  transfer_method: "remote_url",
                  url: response.result.filePath,
                },
              ],
            },
            response_mode: 'blocking',
            user: 'appuser',
          }),
        });

        if (!parseResponse.ok) {
          throw new Error(`HTTP ${parseResponse.status}: ${parseResponse.statusText}`);
        }

        const parseData: any = await parseResponse.json();
        const fileCategory = parseData?.data?.outputs?.class_name || '其他';

        let targetMaterialId = 'other';
        const matchedRequirement = materialRequirements.find(
          (req) => req.name.toLowerCase() === fileCategory.toLowerCase()
        );
        if (matchedRequirement) {
          targetMaterialId = matchedRequirement.id;
        }

        const newFile: FileInfo = {
          id: response.result.ids[0],
          materialId: targetMaterialId,
          fileName: response.result.fileName,
          filePath: response.result.filePath,
          fileType: getFileType(file.name),
          uploadTime: new Date().toLocaleString('zh-CN'),
          size: file.size,
        };

        setMaterials((prevMaterials) =>
          prevMaterials.map((material) =>
            material.materialId === targetMaterialId
              ? { ...material, files: [...material.files, newFile] }
              : material
          )
        );
      } catch (err) {
        console.error('Error parsing single file:', err);
      }
    },
    [materialRequirements, getFileType]
  );

  const uploadSingleFile = useCallback(
    async (file: File): Promise<{ file: File; response: UploadResponse } | null> => {
      try {
        const formData = new FormData();
        formData.append('img', file);
        formData.append('fjid', FJID);

        const response = await fetch(UPLOAD_API, {
          method: 'POST',
          body: formData,
          headers: {
            Authorization: userToken,
          },
        });

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const data: UploadResponse = await response.json();

        if (data.result_code !== '200') {
          throw new Error(data.result_msg || '文件上传失败');
        }

        data.result.filePath = `${INTELNET_BDCDJPT_URL}bdcpt${data.result.filePath}`

        return { file, response: data };
      } catch (err) {
        console.error('Error uploading single file:', err);
        return null;
      }
    },
    [userToken]
  );

  const parseUploadedFiles = useCallback(
    async (
      uploads: Array<{ file: File; response: UploadResponse }>
    ) => {
      try {
        setParsing(true);

        const parsePromises = uploads.map(({ file, response }) =>
          parseSingleFile(file, response)
        );
        await Promise.all(parsePromises);

        setSuccessMessage(`成功上传 ${uploads.length} 个文件`);
        setTimeout(() => setSuccessMessage(null), 3000);
      } catch (err) {
        const errorMessage =
          err instanceof Error ? err.message : '文件解析失败，请稍后重试';
        setError(errorMessage);
        console.error('Error parsing files:', err);
      } finally {
        setParsing(false);
      }
    },
    [parseSingleFile]
  );

  const uploadFiles = useCallback(async (filesToUpload: File[]) => {
    try {
      setUploading(true);
      setError(null);

      const uploadPromises = filesToUpload.map((file) => uploadSingleFile(file));
      const uploadResults = await Promise.all(uploadPromises);

      const successfulUploads = uploadResults.filter(
        (result) => result !== null
      ) as Array<{ file: File; response: UploadResponse }>;

      if (successfulUploads.length === 0) {
        setError('文件上传失败，请重试');
        return;
      }

      await parseUploadedFiles(successfulUploads);
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : '文件上传失败，请稍后重试';
      setError(errorMessage);
      console.error('Error uploading files:', err);
    } finally {
      setUploading(false);
    }
  }, [uploadSingleFile, parseUploadedFiles]);

  const handleFileSelect = useCallback(
    async (event: React.ChangeEvent<HTMLInputElement>) => {
      const files = event.currentTarget.files;
      if (!files) return;

      await uploadFiles(Array.from(files));
      event.currentTarget.value = '';
    },
    [uploadFiles]
  );

  const handleDeleteFile = useCallback((materialId: string, fileId: string) => {
    setMaterials((prevMaterials) =>
      prevMaterials.map((material) =>
        material.materialId === materialId
          ? {
            ...material,
            files: material.files.filter((f) => f.id !== fileId),
          }
          : material
      )
    );
    setError(null);
  }, []);

  const handlePreviewFile = useCallback((file: FileInfo) => {
    setPreviewFile(file);
    setShowPreview(true);
  }, []);

  const handleGetETicket = useCallback(() => {
    window.open(ETICKET_URL, '_blank');
  }, []);

  const handleCloudSign = useCallback(() => {
    window.open(CLOUD_SIGN_URL, '_blank');
  }, []);

  const handleSubmitBusiness = useCallback(async () => {
    try {
      setSubmitting(true);
      setError(null);

      const filesList = materials
        .flatMap((material) =>
          material.files.map((file) => ({
            fileName: file.fileName,
            filePath: file.filePath,
            fjid: FJID,
          }))
        );

      const submitData = {
        ...data,
        files: filesList,
      };

      const response = await fetch(SUBMIT_API, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: userToken,
        },
        body: JSON.stringify(submitData),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const result: SubmitResponse = await response.json();

      if (result.result_code !== '200') {
        throw new Error(result.result_msg || '提交失败');
      }

      setSuccessMessage('业务提交成功！');
      setShowSubmitConfirm(true);
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : '提交失败，请稍后重试';
      setError(errorMessage);
      console.error('Error submitting business:', err);
    } finally {
      setSubmitting(false);
    }
  }, [data, materials, userToken]);

  const handleNavigateToDetail = useCallback(async () => {
    await openPreview('');
    setShowSubmitConfirm(false);
  }, [openPreview]);

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

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h1>材料上传</h1>
        <p className={styles.subheader}>请上传所需的申请材料</p>
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

      <div className={styles.uploadSection}>
        <div className={styles.uploadBox}>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept="image/*,.pdf"
            onChange={handleFileSelect}
            className={styles.fileInput}
            disabled={uploading || parsing}
          />
          <div
            className={styles.uploadContent}
            onClick={() => fileInputRef.current?.click()}
          >
            <span className={styles.uploadIcon}>📁</span>
            <p className={styles.uploadText}>
              {uploading || parsing ? '上传中...' : '点击或拖拽上传文件'}
            </p>
            <p className={styles.uploadTip}>支持图片和PDF格式，单个文件不超过10MB</p>
          </div>
        </div>

        {/* <div className={styles.actionButtons}>
          <button
            className={styles.secondaryButton}
            onClick={handleGetETicket}
            title="获取电子证照"
          >
            获取电子证照
          </button>
          <button
            className={styles.secondaryButton}
            onClick={handleCloudSign}
            title="云签"
          >
            云签
          </button>
        </div> */}
      </div>

      <div className={styles.materialsSection}>
        <h2 className={styles.sectionTitle}>已上传材料</h2>

        {materials.length === 0 ? (
          <div className={styles.emptyState}>
            <p>暂无上传材料</p>
          </div>
        ) : (
          <div className={styles.materialsList}>
            {materials.map((material) => {
              const requirement = materialRequirements.find(
                (req) => req.id === material.materialId
              );
              const isRequired = requirement?.required;

              return (
                <div key={material.materialId} className={styles.materialGroup}>
                  <div className={styles.materialHeader}>
                    <h3 className={styles.materialName}>
                      {getMaterialName(type, material.materialId)}
                      {isRequired && (
                        <span className={styles.requiredTag}>必须</span>
                      )}
                    </h3>
                    <span className={styles.fileCount}>
                      {material.files.length}/{requirement?.maxFiles || '∞'}
                    </span>
                  </div>

                  {material.files.length === 0 ? (
                    <div className={styles.noFiles}>
                      <p>暂未上传</p>
                    </div>
                  ) : (
                    <div className={styles.filesList}>
                      {material.files.map((file) => (
                        <div key={file.id} className={styles.fileItem}>
                          <div className={styles.fileIcon}>
                            {file.fileType === 'image' ? '🖼️' : '📄'}
                          </div>
                          <div className={styles.fileInfo}>
                            <p className={styles.fileName}>{file.fileName}</p>
                            <p className={styles.fileDetails}>
                              {(file.size / 1024).toFixed(2)} KB · {file.uploadTime}
                            </p>
                          </div>
                          <div className={styles.fileActions}>
                            <button
                              className={styles.actionButton}
                              onClick={() => handlePreviewFile(file)}
                              title="预览"
                            >
                              👁️
                            </button>
                            <button
                              className={styles.actionButton}
                              onClick={() => handleDeleteFile(material.materialId, file.id)}
                              title="删除"
                            >
                              🗑️
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className={styles.submitSection}>
        <button
          className={styles.submitButton}
          onClick={handleSubmitBusiness}
          disabled={submitting || uploading || parsing}
        >
          {submitting ? (
            <>
              <span className={styles.spinner2}></span>
              提交中...
            </>
          ) : (
            '提交业务'
          )}
        </button>
      </div>

      {showPreview && previewFile && (
        <div className={styles.modal}>
          <div className={styles.modalContent}>
            <div className={styles.modalHeader}>
              <h2>文件预览</h2>
              <button
                className={styles.closeButton}
                onClick={() => setShowPreview(false)}
              >
                ✕
              </button>
            </div>

            <div className={styles.modalBody}>
              {previewFile.fileType === 'image' ? (
                <img
                  src={previewFile.filePath}
                  alt={previewFile.fileName}
                  className={styles.previewImage}
                />
              ) : previewFile.fileType === 'pdf' ? (
                <div className={styles.pdfPreview}>
                  <p>PDF 文件预览</p>
                  <a
                    href={previewFile.filePath}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={styles.pdfLink}
                  >
                    点击下载查看
                  </a>
                </div>
              ) : (
                <div className={styles.unsupportedPreview}>
                  <p>暂不支持预览此文件类型</p>
                </div>
              )}
            </div>

            <div className={styles.modalFooter}>
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

      {showSubmitConfirm && (
        <div className={styles.modal}>
          <div className={styles.modalContent}>
            <div className={styles.modalHeader}>
              <h2>提交完成</h2>
              <button
                className={styles.closeButton}
                onClick={() => setShowSubmitConfirm(false)}
              >
                ✕
              </button>
            </div>

            <div className={styles.modalBody}>
              <div className={styles.confirmContent}>
                <p className={styles.confirmIcon}>✓</p>
                <p className={styles.confirmMessage}>业务已成功提交！</p>
                <p className={styles.confirmSubtext}>
                  是否跳转到流程详情页查看进展？
                </p>
              </div>
            </div>

            <div className={styles.modalFooter}>
              <button
                className={styles.secondaryButton}
                onClick={() => setShowSubmitConfirm(false)}
              >
                关闭
              </button>
              <button
                className={styles.primaryButton}
                onClick={handleNavigateToDetail}
              >
                查看详情
              </button>
            </div>
          </div>
        </div>
      )}

      {showPreview || showSubmitConfirm ? (
        <div
          className={styles.modalBackdrop}
          onClick={() => {
            setShowPreview(false);
            setShowSubmitConfirm(false);
          }}
        ></div>
      ) : null}
    </div>
  );
}
