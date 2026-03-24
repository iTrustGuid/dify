// 材料要求配置文件
export interface MaterialRequirement {
  id: string;
  name: string;
  required: boolean;
  maxFiles?: number;
  acceptedFormats?: string[];
}

export interface ProcessTypeConfig {
  [key: string]: MaterialRequirement[];
}

const materialRequirements: ProcessTypeConfig = {
  // 一手房转移
  '一手房转移': [
    {
      id: '1ccf126bda4d491fbad77f94be98f12d',
      name: '不动产权证书（首次登记）',
      required: true,
      maxFiles: 1,
      acceptedFormats: ['pdf', 'jpg', 'jpeg', 'png'],
    },
    {
      id: '181c5834c88f421c9227cbf94fe6ff6c',
      name: '不动产登记纳税信息表',
      required: true,
      maxFiles: 2,
      acceptedFormats: ['pdf', 'jpg', 'jpeg', 'png'],
    },
    {
      id: '187e6c6db76b4e9e8af40f868207c7ee',
      name: '身份证',
      required: false,
      maxFiles: 2,
      acceptedFormats: ['pdf', 'jpg', 'jpeg', 'png'],
    },
    {
      id: '1536c4b546174db1a958de2390ef2b30',
      name: '户口本',
      required: true,
      maxFiles: 5,
      acceptedFormats: ['pdf', 'jpg', 'jpeg', 'png'],
    },
    {
      id: '120f43025672496a9b1236f15b0f54cf',
      name: '备案合同及备案证明书',
      required: true,
      maxFiles: 2,
      acceptedFormats: ['pdf'],
    },
    {
      id: '125a2fe3b5284691912af7cbab7723d5',
      name: '结婚证',
      required: false,
      maxFiles: 1,
      acceptedFormats: ['pdf'],
    },
    {
      id: '1b88a1c32b094f90b14ed6ce9a504f2c',
      name: '离婚证',
      required: false,
      maxFiles: 1,
      acceptedFormats: ['pdf'],
    },
    {
      id: '1c4f9cabaab9483ea76b38c7e4e7c9b0',
      name: '江西增值税普通发票',
      required: false,
      maxFiles: 1,
      acceptedFormats: ['pdf'],
    },
    {
      id: 'other',
      name: '其他',
      required: false,
      maxFiles: 20,
      acceptedFormats: ['pdf', 'jpg', 'jpeg', 'png'],
    },
  ],
  // 补证换证
  'reissue_replacement': [
    {
      id: 'application_form',
      name: '申请表',
      required: true,
      maxFiles: 1,
      acceptedFormats: ['pdf', 'jpg', 'jpeg', 'png'],
    },
    {
      id: 'id_card',
      name: '身份证',
      required: true,
      maxFiles: 2,
      acceptedFormats: ['pdf', 'jpg', 'jpeg', 'png'],
    },
    {
      id: 'original_certificate',
      name: '原证件',
      required: false,
      maxFiles: 1,
      acceptedFormats: ['pdf', 'jpg', 'jpeg', 'png'],
    },
    {
      id: 'loss_certificate',
      name: '遗失声明',
      required: false,
      maxFiles: 1,
      acceptedFormats: ['pdf', 'jpg', 'jpeg', 'png'],
    },
  ],
  // 二手房转移
  'second_hand_transfer': [
    {
      id: 'application_form',
      name: '申请表',
      required: true,
      maxFiles: 1,
      acceptedFormats: ['pdf', 'jpg', 'jpeg', 'png'],
    },
    {
      id: 'id_card',
      name: '身份证',
      required: true,
      maxFiles: 2,
      acceptedFormats: ['pdf', 'jpg', 'jpeg', 'png'],
    },
    {
      id: 'property_certificate',
      name: '不动产权证',
      required: true,
      maxFiles: 1,
      acceptedFormats: ['pdf', 'jpg', 'jpeg', 'png'],
    },
    {
      id: 'sales_contract',
      name: '买卖合同',
      required: true,
      maxFiles: 1,
      acceptedFormats: ['pdf'],
    },
    {
      id: 'tax_receipt',
      name: '税收凭证',
      required: false,
      maxFiles: 1,
      acceptedFormats: ['pdf', 'jpg', 'jpeg', 'png'],
    },
  ],
};

export const getMaterialRequirements = (type: string): MaterialRequirement[] => {
  return materialRequirements[type] || [];
};

export const getMaterialName = (type: string, materialId: string): string => {
  const materials = getMaterialRequirements(type);
  const material = materials.find((m) => m.id === materialId);
  return material?.name || materialId;
};