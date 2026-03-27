'use client';

import React, { useEffect, useState, useCallback, useRef } from 'react';
import { useSearchParams } from 'next/navigation';
import styles from './MaterialUploadPreview.module.css';
import { useWxMiniProgramPreview } from './WxMiniProgramPreview';
import { getMaterialRequirements, getMaterialName, type MaterialRequirement } from './materialRequirements.config';
import { INTELNET_BDCDJPT_URL } from '@/config';
import Toast from '@/app/components/base/toast'

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

interface ContractInfo {
  zl: string;
  htbh: string;
  qlrmc: string;
  ywrzjh: string;
  jyje: number;
  qlrzjh: string;
  ywrmc: string;
  qysj: number;
  fwlx: string;
  mj: number;
  bdcqzh?: string;
}

interface ContractFileResponse {
  result_code: string;
  result_msg: string;
  result: {
    ids: string[];
    fjid: string;
    filePath: string[];
    fileName: string;
  };
}

interface InputData {
  tzr?: { name: string; phone: string };
  gyfs?: { gyfs: string; sffbcz: string };
  htbh?: string;
  [key: string]: any;
}

interface UserInfo {
  no: string;
  name: string;
  mobile: string;
  usertype: string;
  isauth: string;
  token: string;
  [key: string]: any;
}

const baseUrl = location.href.startsWith('https') && INTELNET_BDCDJPT_URL || 'http://localhost:9000/';
const UPLOAD_API = `${baseUrl}bdcpt/a/json/fj/save`;
const PARSE_API = `${location.href.startsWith('https') && 'https://wnxai.esconsoft.com/' || 'http://localhost:9000/'}v1/workflows/run`;
const CONTRACT_INFO_API = `${baseUrl}bdcpt/a/json/ywbaseother/selfgqlrmsgbybdcdyhorhtbh`;
const CONTRACT_FILE_API = `${baseUrl}bdcpt/a/json/fj/getElecFjNotUrl`;
const ELECTRONIC_CERT_API = `${baseUrl}bdcpt/a/json/fj/getElecFjNotUrl`;
const SUBMIT_API = `${baseUrl}bdcpt/a/json/hlwywbase/info`;
const USER_INFO_API = `${baseUrl}bdcpt/a/json/user/getUserInfo`;
const FJID = '615fc82e0a294e95a841cd886006749b';
const CONTRACT_FILE_FJID = '120f43025672496a9b1236f15b0f54cf';
const PROPERTY_CERT_FJID: { [key: string]: string } = {
  '一手房转移': '1ccf126bda4d491fbad77f94be98f12d',
  '补证换证': '72b8b0d940234509bffd6ce693e4b5cc'
};
const ETICKET_URL = 'https://www.wnxbdcdjzx.com/eticket';
const CLOUD_SIGN_URL = 'https://www.wnxbdcdjzx.com/cloudsign';
const MINI_PROGRAM_PATH2 = '/pagesB/my/process/detail';
const MINI_PROGRAM_PATH = '/pagesB/my/preview/preview';

interface Props {
  data: string | Record<string, any>;
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
  // ✅ 恢复：提交确认弹框状态
  const [showSubmitConfirm, setShowSubmitConfirm] = useState(false);
  const [submitSuccess, setSubmitSuccess] = useState(false);

  const [inputData, setInputData] = useState<InputData | null>(null);
  const [contractInfo, setContractInfo] = useState<ContractInfo | null>(null);
  const [contractFiles, setContractFiles] = useState<FileInfo[]>([]);
  const [userInfo, setUserInfo] = useState<UserInfo | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  // ✅ 获取两个跳转方法
  const { openPreview, navigateToMiniProgramPage } = useWxMiniProgramPreview(MINI_PROGRAM_PATH);

  // 解析输入数据
  const parseInputData = useCallback(() => {
    try {
      if (typeof data === 'string') {
        const parsed = JSON.parse(data);
        return Array.isArray(parsed) ? parsed[0] : parsed;
      }
      return data;
    } catch (err) {
      console.error('Error parsing input data:', err);
      return null;
    }
  }, [data]);

  // 获取合同信息
  const fetchContractInfo = useCallback(async (htbh: string) => {
    try {
      const response = await fetch(CONTRACT_INFO_API, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: userToken,
        },
        body: JSON.stringify({
          htbh,
          type: 'spf',
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const result: { result_code: string; result: ContractInfo[] } = await response.json();

      if (result.result_code === '200' && result.result?.length > 0) {
        setContractInfo(result.result[0]);
        await fetchContractFiles(htbh);
      }
    } catch (err) {
      console.error('Error fetching contract info:', err);
    }
  }, [userToken]);

  // 获取合同文件
  const fetchContractFiles = useCallback(async (htbh: string) => {
    try {
      const response = await fetch(CONTRACT_FILE_API, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: userToken,
        },
        body: JSON.stringify({
          fjid: CONTRACT_FILE_FJID,
          htbh,
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const result: ContractFileResponse = await response.json();

      if (result.result_code === '200' && result.result?.filePath) {
        const files: FileInfo[] = result.result.filePath.map((path, index) => ({
          id: result.result.ids?.[index] || `contract-${index}`,
          materialId: '120f43025672496a9b1236f15b0f54cf',
          fileName: result.result.fileName || '商品房销售合同及备案证明书',
          filePath: `${INTELNET_BDCDJPT_URL}bdcpt${path}`,
          fileType: 'pdf',
          uploadTime: new Date().toLocaleString('zh-CN'),
          size: 0,
        }));
        setContractFiles(files);

        setMaterials((prevMaterials) =>
          prevMaterials.map((material) =>
            material.materialId === '120f43025672496a9b1236f15b0f54cf'
              ? { ...material, files }
              : material
          )
        );
      }
    } catch (err) {
      console.error('Error fetching contract files:', err);
    }
  }, [userToken]);

  // 获取电子不动产权证书
  const fetchElectronicCertificate = useCallback(async (bdcqzh: string) => {
    try {
      const response = await fetch(ELECTRONIC_CERT_API, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: userToken,
        },
        body: JSON.stringify({
          fjid: PROPERTY_CERT_FJID[type],
          cqzhzmh: bdcqzh,
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const result: ContractFileResponse = await response.json();

      if (result.result_code === '200' && result.result?.filePath) {
        const files: FileInfo[] = result.result.filePath.map((path, index) => ({
          id: result.result.ids?.[index] || `cert-${index}`,
          materialId: PROPERTY_CERT_FJID[type],
          fileName: result.result.fileName || '不动产权证书',
          filePath: `${INTELNET_BDCDJPT_URL}bdcpt${path}`,
          fileType: 'pdf',
          uploadTime: new Date().toLocaleString('zh-CN'),
          size: 0,
        }));

        setMaterials((prevMaterials) =>
          prevMaterials.map((material) =>
            material.materialId === PROPERTY_CERT_FJID[type]
              ? { ...material, files }
              : material
          )
        );
      }
    } catch (err) {
      console.error('Error fetching electronic certificate:', err);
    }
  }, [userToken]);

  useEffect(() => {
    const requirements = getMaterialRequirements(type);
    setMaterialRequirements(requirements);
    const parsed = parseInputData();
    setInputData(parsed);

    if (parsed?.htbh) {
      fetchContractInfo(parsed.htbh);
    }

    if (type === '补证换证' && parsed?.bdcqzh) {
      fetchElectronicCertificate(parsed?.bdcqzh);
    }

    setLoading(false);
  }, [type, parseInputData, fetchContractInfo]);

  useEffect(() => {
    if (contractInfo?.bdcqzh) {
      fetchElectronicCertificate(contractInfo.bdcqzh);
    }
  }, [contractInfo?.bdcqzh, fetchElectronicCertificate]);

  useEffect(() => {
    const initialMaterials: UploadedFile[] = materialRequirements.map((req) => ({
      materialId: req.id,
      files: [],
    }));
    setMaterials(initialMaterials);
  }, [materialRequirements]);

  const getFileType = useCallback((fileName: string): string => {
    const ext = fileName.split('.').pop()?.toLowerCase() || '';
    if (['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(ext)) return 'image';
    if (ext === 'pdf') return 'pdf';
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
        if (matchedRequirement) targetMaterialId = matchedRequirement.id;

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
          headers: { Authorization: userToken },
        });

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const data: UploadResponse = await response.json();
        if (data.result_code !== '200') {
          throw new Error(data.result_msg || '文件上传失败');
        }

        data.result.filePath = `${INTELNET_BDCDJPT_URL}bdcpt${data.result.filePath}`;
        return { file, response: data };
      } catch (err) {
        console.error('Error uploading single file:', err);
        return null;
      }
    },
    [userToken]
  );

  const parseUploadedFiles = useCallback(
    async (uploads: Array<{ file: File; response: UploadResponse }>) => {
      try {
        setParsing(true);
        const parsePromises = uploads.map(({ file, response }) => parseSingleFile(file, response));
        await Promise.all(parsePromises);
        setSuccessMessage(`成功上传 ${uploads.length} 个文件`);
        setTimeout(() => setSuccessMessage(null), 3000);
      } catch (err) {
        const msg = err instanceof Error ? err.message : '解析失败';
        setError(msg);
        Toast.notify({ type: 'error', message: msg });
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
      const uploadPromises = filesToUpload.map(file => uploadSingleFile(file));
      const uploadResults = await Promise.all(uploadPromises);
      const successful = uploadResults.filter(r => r !== null) as any[];

      if (successful.length === 0) {
        setError('上传失败，请重试');
        return;
      }
      await parseUploadedFiles(successful);
    } catch (err) {
      const msg = err instanceof Error ? err.message : '上传失败';
      setError(msg);
      Toast.notify({ type: 'error', message: msg });
    } finally {
      setUploading(false);
    }
  }, [uploadSingleFile, parseUploadedFiles]);

  const handleFileSelect = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = e.currentTarget.files;
      if (!files) return;
      await uploadFiles(Array.from(files));
      e.currentTarget.value = '';
    },
    [uploadFiles]
  );

  const handleDeleteFile = useCallback((materialId: string, fileId: string) => {
    setMaterials(prev =>
      prev.map(m =>
        m.materialId === materialId
          ? { ...m, files: m.files.filter(f => f.id !== fileId) }
          : m
      )
    );
    setError(null);
  }, []);

  const handlePreviewFile = useCallback((file: FileInfo) => {
    openPreview(file.filePath);
  }, [openPreview]);

  const handleGetETicket = useCallback(() => {
    window.open(ETICKET_URL, '_blank');
  }, []);

  const handleCloudSign = useCallback(() => {
    window.open(CLOUD_SIGN_URL, '_blank');
  }, []);

  // 判断证件类型
  const getIdCardType = useCallback((idCardNo: string): string => {
    if (!idCardNo) return '0';
    if (idCardNo.length === 18) {
      if (/^\d{17}[0-9X]$/.test(idCardNo.toUpperCase())) return '0';
      if (/[A-Za-z]/.test(idCardNo)) return '8';
      return '8';
    }
    if (idCardNo.length === 15) return '0';
    return idCardNo.length >= 18 ? '8' : '0';
  }, []);

  // 构建人员列表
  const buildPersonList = useCallback(() => {
    const ryxxVoList: any[] = [];
    if (contractInfo?.qlrmc) {
      const qlrNames = contractInfo.qlrmc.split('、');
      const qlrIds = contractInfo.qlrzjh?.split('、') || [];
      qlrNames.forEach((name, i) => {
        const id = qlrIds[i] || '';
        ryxxVoList.push({
          lx: getIdCardType(id),
          sfzh: id,
          lxfs: inputData?.tzr?.phone || '',
          gyfe: '',
          userName: name.trim(),
          ryfl: '0',
        });
      });
    }
    if (contractInfo?.ywrmc) {
      const ywrNames = contractInfo.ywrmc.split('、');
      const ywrIds = contractInfo.ywrzjh?.split('、') || [];
      ywrNames.forEach((name, i) => {
        const id = ywrIds[i] || '';
        ryxxVoList.push({
          lx: getIdCardType(id),
          sfzh: id,
          lxfs: '',
          gyfe: '',
          userName: name.trim(),
          ryfl: '999',
        });
      });
    }
    return ryxxVoList;
  }, [contractInfo, inputData, getIdCardType]);

  const buildPersonListByData = useCallback(() => {
    const ryxxVoList: any[] = [];
    if (inputData?.qlrmc) {
      const names = inputData.qlrmc.split('、');
      const ids = inputData.sfzh?.split('、') || [];
      names.forEach((name, i) => {
        const id = ids[i] || '';
        ryxxVoList.push({
          lx: getIdCardType(id),
          sfzh: id,
          lxfs: inputData?.mobile || '',
          gyfe: '',
          userName: name.trim(),
          ryfl: '0',
        });
      });
    }
    return ryxxVoList;
  }, [inputData, getIdCardType]);

  // ✅ 真正提交业务（用户确认后才执行）
  const handleSubmitBusiness = useCallback(async () => {
    try {
      setSubmitting(true);
      setError(null);
      setShowSubmitConfirm(false); // 关闭确认弹框

      const fjPath = materials.flatMap(m =>
        m.files.map(f => ({ path: f.filePath, id: m.materialId }))
      );

      let submitData;
      if (type === '一手房转移') {
        submitData = {
          id: '',
          usercolum: '9',
          ddmc: '3',
          xlmc: '4b09bf2d95d44dbe9624f39d9a613449',
          yhtype: '1',
          qlrsfdl: 0,
          ywrsfdl: 0,
          sffjwz: 1,
          cqType: '101',
          fjPath,
          flag: '',
          sfwq: '1',
          wqhtbh: inputData?.htbh || '',
          cqzhzmh: contractInfo?.zl || '',
          czorzmhend: '',
          czorzmhstr: '',
          data: {
            htbh: inputData?.htbh || '',
            wsbh: '',
            jyje: contractInfo?.jyje?.toString() || '',
            sffbcz: inputData?.gyfs?.sffbcz === '是' ? '1' : '0',
            gyfs: inputData?.gyfs?.gyfs === '共同共有' ? '1' : inputData?.gyfs?.gyfs === '按份共有' ? '2' : '0',
            qysj: contractInfo?.qysj ? new Date(contractInfo.qysj).toLocaleString('zh-CN') : '',
          },
          sendEms: [],
          slry: inputData?.tzr?.name || '',
          estatetag: 'YSFZY',
          tdzh: '',
          bdcdyh: '',
          gyrList: [],
          item: '4b09bf2d95d44dbe9624f39d9a613449',
          ryxxVoList: buildPersonList(),
          dlrxxVoList: [],
        };
      } else if (type === '补证换证') {
        submitData = {
          id: '',
          usercolum: '9',
          ddmc: '22',
          xlmc: '0bd8e2ebff6e4e9c8a022a44d98d00f8',
          yhtype: '1',
          qlrsfdl: 0,
          ywrsfdl: 0,
          sffjwz: 1,
          cqType: '107',
          fjPath,
          flag: '',
          sfwq: '1',
          wqhtbh: '',
          cqzhzmh: inputData?.bdcqzh,
          czorzmhend: '',
          czorzmhstr: '',
          data: {},
          sendEms: [],
          slry: '',
          estatetag: 'BZHZDJ',
          tdzh: '',
          bdcdyh: inputData?.bdcdyh,
          gyrList: [],
          item: '0bd8e2ebff6e4e9c8a022a44d98d00f8',
          ryxxVoList: buildPersonListByData(),
          dlrxxVoList: [],
        };
      }

      const res = await fetch(SUBMIT_API, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: userToken,
        },
        body: JSON.stringify(submitData),
      });

      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const result: SubmitResponse = await res.json();
      if (result.result_code !== '200') throw new Error(result.result_msg || '提交失败');

      // ✅ 提交成功 → 自动跳转小程序详情页
      setSuccessMessage('业务提交成功！');
      setSubmitSuccess(true);
      await navigateToMiniProgramPage(MINI_PROGRAM_PATH2);

    } catch (err) {
      const msg = err instanceof Error ? err.message : '提交失败，请重试';
      setError(msg);
      Toast.notify({ type: 'error', message: msg });
      console.error('提交失败', err);
    } finally {
      setSubmitting(false);
    }
  }, [
    materials,
    inputData,
    contractInfo,
    userToken,
    type,
    buildPersonList,
    buildPersonListByData,
    navigateToMiniProgramPage
  ]);

  // ✅ 点击“业务提交” → 只弹确认框，不直接提交
  const handleShowSubmitConfirm = useCallback(() => {
    setShowSubmitConfirm(true);
  }, []);

  // 获取用户信息
  const fetchUserInfo = useCallback(async (): Promise<UserInfo | null> => {
    try {
      const res = await fetch(USER_INFO_API, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          Authorization: userToken,
        },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const result = await res.json();
      if (result.result_code === '200' && result.result) {
        setUserInfo(result.result);
        return result.result;
      }
      throw new Error('获取用户信息失败');
    } catch (err) {
      console.error('fetchUserInfo', err);
      throw err;
    }
  }, [userToken]);

  // 验证一手房权利人
  const validateFirstHandTransfer = useCallback(async (): Promise<boolean> => {
    try {
      const user = userInfo || await fetchUserInfo();
      if (!user) {
        Toast.notify({ type: 'error', message: '无法获取用户信息' });
        return false;
      }
      if (!contractInfo?.qlrmc) {
        Toast.notify({ type: 'error', message: '权利人信息不存在' });
        return false;
      }
      const qlrs = contractInfo.qlrmc.split('、').map(n => n.trim());
      const qlrIds = contractInfo.qlrzjh?.split('、').map(id => id.trim()) || [];
      const isMe = qlrs.some((n, i) => n === user.name && qlrIds[i] === user.no);
      if (!isMe) {
        const msg = '只能申请自己的业务，当前用户与权利人不一致';
        setError(msg);
        Toast.notify({ type: 'error', message: msg });
      }
      return isMe;
    } catch (err) {
      const msg = err instanceof Error ? err.message : '验证失败';
      setError(msg);
      Toast.notify({ type: 'error', message: msg });
      return false;
    }
  }, [userInfo, contractInfo, fetchUserInfo]);

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
              {uploading || parsing ? '上传中...' : '点击上传（批量自动分类）'}
            </p>
            <p className={styles.uploadTip}>支持图片/PDF，单文件≤10MB</p>
          </div>
        </div>
      </div>

      <div className={styles.materialsSection}>
        <h2 className={styles.sectionTitle}>已上传材料</h2>
        {materials.length === 0 ? (
          <div className={styles.emptyState}><p>暂无上传材料</p></div>
        ) : (
          <div className={styles.materialsList}>
            {materials.map(material => {
              const req = materialRequirements.find(r => r.id === material.materialId);
              return (
                <div key={material.materialId} className={styles.materialGroup}>
                  <div className={styles.materialHeader}>
                    <h3 className={styles.materialName}>
                      {getMaterialName(type, material.materialId)}
                      {req?.required && <span className={styles.requiredTag}>必须</span>}
                    </h3>
                    <span className={styles.fileCount}>
                      {material.files.length}/{req?.maxFiles || '∞'}
                    </span>
                  </div>

                  {material.files.length === 0 ? (
                    <div className={styles.noFiles}><p>暂未上传</p></div>
                  ) : (
                    <div className={styles.filesList}>
                      {material.files.map(file => (
                        <div key={file.id} className={styles.fileItem}>
                          <div className={styles.fileItemContent}>
                            <div className={styles.fileIcon}>
                              {file.fileType === 'image' ? '🖼️' : '📄'}
                            </div>
                            <div className={styles.fileInfo}>
                              <p className={styles.fileName}>{file.fileName}</p>
                              <p className={styles.fileDetails}>
                                {(file.size / 1024).toFixed(2)} KB · {file.uploadTime}
                              </p>
                            </div>
                          </div>
                          <div className={styles.fileActions}>
                            <button
                              className={styles.actionButton}
                              onClick={() => handlePreviewFile(file)}
                              title="预览"
                            >👁️</button>
                            <button
                              className={styles.actionButton}
                              onClick={() => handleDeleteFile(material.materialId, file.id)}
                              title="删除"
                            >🗑️</button>
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
          // ✅ 点击只弹确认框
          onClick={handleShowSubmitConfirm}
          disabled={submitting || uploading || parsing || submitSuccess}
          title={submitSuccess ? '已提交，不可重复提交' : ''}
        >
          {submitting ? (
            <>
              <span className={styles.spinner2}></span>
              提交中...
            </>
          ) : submitSuccess ? (
            '✓ 已提交'
          ) : (
            '业务提交'
          )}
        </button>
      </div>

      {/* ✅ 提交确认弹框（恢复） */}
      {showSubmitConfirm && (
        <div className={styles.modal}>
          <div className={styles.modalContent}>
            <div className={styles.modalHeader}>
              <h2>确认提交</h2>
              <button
                className={styles.closeButton}
                onClick={() => setShowSubmitConfirm(false)}
              >✕</button>
            </div>
            <div className={styles.modalBody}>
              <div className={styles.confirmContent}>
                <p className={styles.confirmIcon}>?</p>
                <p className={styles.confirmMessage}>确定要提交该业务申请吗？</p>
                <p className={styles.confirmSubtext}>提交后将进入审核流程，无法修改</p>
              </div>
            </div>
            <div className={styles.modalFooter}>
              <button
                className={styles.secondaryButton}
                onClick={() => setShowSubmitConfirm(false)}
              >
                取消
              </button>
              <button
                className={styles.primaryButton}
                onClick={handleSubmitBusiness}
                disabled={submitting}
              >
                {submitting ? '提交中...' : '确认提交'}
              </button>
            </div>
          </div>
        </div>
      )}

      {(showPreview || showSubmitConfirm) && (
        <div
          className={styles.modalBackdrop}
          onClick={() => {
            setShowPreview(false);
            setShowSubmitConfirm(false);
          }}
        ></div>
      )}
    </div>
  );
}