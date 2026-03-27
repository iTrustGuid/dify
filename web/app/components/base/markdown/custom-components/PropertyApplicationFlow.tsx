'use client';

import React, { useState, useCallback } from 'react';
import { PropertySelector } from './PropertySelector';
import { MaterialUploadPreview } from './MaterialUploadPreview';

interface PropertyItem {
  zl: string;
  bdcqzh: string;
  dy: string;
  cf: string;
}

type FlowStep = 'property-select' | 'material-upload';

export function PropertyApplicationFlow({ type }: { type: string }) {
  console.log('PropertyApplicationFlow data:', 'type:', type);
  const [currentStep, setCurrentStep] = useState<FlowStep>('property-select');
  const [selectedProperty, setSelectedProperty] = useState<PropertyItem | null>(null);
  const [flowData, setFlowData] = useState<{ [key: string]: any }>();

  // 处理房产选择确认
  const handlePropertyConfirm = useCallback((property: PropertyItem) => {
    setSelectedProperty(property);
    setFlowData({
      ...property,
    })
    setCurrentStep('material-upload');
  }, []);

  // 处理房产选择取消
  const handlePropertyCancel = useCallback(() => {
    // 可以在这里处理取消逻辑，比如返回上一页
    console.log('用户取消了房产选择');
  }, []);

  // 处理返回房产选择
  const handleBackToPropertySelect = useCallback(() => {
    setCurrentStep('property-select');
    setSelectedProperty(null);
  }, []);

  // 处理材料上传完成
  const handleMaterialUploadComplete = useCallback(() => {
    console.log('材料上传完成，选中的房产:', selectedProperty);
  }, [selectedProperty]);

  return (
    <>
      {currentStep === 'property-select' && (
        <PropertySelector
          onConfirm={handlePropertyConfirm}
          onCancel={handlePropertyCancel}
        />
      )}

      {currentStep === 'material-upload' && selectedProperty && (
        <MaterialUploadPreviewWrapper
          data={selectedProperty}
          type={type}
          onBack={handleBackToPropertySelect}
          onComplete={handleMaterialUploadComplete}
        />
      )}
    </>
  );
}

interface MaterialUploadPreviewWrapperProps {
  data: Record<string, unknown>;
  type: string;
  onBack?: () => void;
  onComplete?: () => void;
}

function MaterialUploadPreviewWrapper({
  data,
  type,
  onBack,
  onComplete,
}: MaterialUploadPreviewWrapperProps) {
  return (
    <div style={{ position: 'relative' }}>
      {onBack && (
        <div
          style={{
            padding: '12px 16px',
            background: 'white',
            borderBottom: '1px solid #e0e0e0',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
          }}
        >
          <button
            onClick={onBack}
            style={{
              background: 'none',
              border: 'none',
              fontSize: '20px',
              cursor: 'pointer',
              padding: '0',
              color: '#667eea',
            }}
            title="返回房产选择"
          >
            ←
          </button>
          <span style={{ fontSize: '14px', color: '#666' }}>返回房产选择</span>
        </div>
      )}
      <MaterialUploadPreview data={data} type={type} />
    </div>
  );
}
