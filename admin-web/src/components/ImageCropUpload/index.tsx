import { RedoOutlined, UndoOutlined, ZoomInOutlined, ZoomOutOutlined } from '@ant-design/icons';
import { Button, Modal, Slider, Space, message } from 'antd';
import { useRef, useState } from 'react';
import Cropper, { type Area, type Point } from 'react-easy-crop';
import { AuthButton } from '@/components/AuthButton';
import { getCroppedImageFile } from '@/utils/imageCrop';
import './image-crop-upload.css';

export interface ImageCropUploadProps {
  permission: string;
  buttonText: string;
  accept?: string;
  /** 裁剪宽高比，默认 1:1 */
  aspect?: number;
  /** 输出边长（像素），不传则保持裁剪区域原始尺寸 */
  outputSize?: number;
  outputFileName?: string;
  modalTitle?: string;
  onUpload: (file: File) => Promise<void>;
}

/**
 * 图片选择 + 裁剪弹窗，确认后上传裁剪结果。
 */
export function ImageCropUpload({
  permission,
  buttonText,
  accept = 'image/*',
  aspect = 1,
  outputSize,
  outputFileName = 'image.png',
  modalTitle = '裁剪图片',
  onUpload,
}: ImageCropUploadProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [imageSrc, setImageSrc] = useState<string>();
  const [crop, setCrop] = useState<Point>({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null);
  const [uploading, setUploading] = useState(false);

  const resetState = () => {
    setImageSrc(undefined);
    setCrop({ x: 0, y: 0 });
    setZoom(1);
    setRotation(0);
    setCroppedAreaPixels(null);
    if (inputRef.current) inputRef.current.value = '';
  };

  const handleSelectFile = (file: File) => {
    if (!file.type.startsWith('image/')) {
      message.error('请选择图片文件');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      setImageSrc(reader.result as string);
      setOpen(true);
    };
    reader.readAsDataURL(file);
  };

  const handleConfirm = async () => {
    if (!imageSrc || !croppedAreaPixels) return;
    setUploading(true);
    try {
      const file = await getCroppedImageFile(imageSrc, croppedAreaPixels, {
        rotation,
        outputSize,
        fileName: outputFileName,
      });
      await onUpload(file);
      setOpen(false);
      resetState();
    } catch (err) {
      message.error(err instanceof Error ? err.message : '裁剪上传失败');
    } finally {
      setUploading(false);
    }
  };

  return (
    <>
      <span className="image-crop-upload">
        <input
          ref={inputRef}
          className="image-crop-upload-input"
          type="file"
          accept={accept}
          tabIndex={-1}
          aria-hidden
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) handleSelectFile(file);
          }}
        />
        <AuthButton permission={permission} onClick={() => inputRef.current?.click()}>
          {buttonText}
        </AuthButton>
      </span>

      <Modal
        title={modalTitle}
        open={open}
        width={560}
        centered
        destroyOnHidden
        styles={{ body: { paddingTop: 12 } }}
        onCancel={() => {
          setOpen(false);
          resetState();
        }}
        footer={
          <Space>
            <Button
              onClick={() => {
                setOpen(false);
                resetState();
              }}
            >
              取消
            </Button>
            <Button type="primary" loading={uploading} onClick={handleConfirm}>
              确认上传
            </Button>
          </Space>
        }
      >
        {imageSrc && (
          <>
            <div className="image-crop-upload-cropper">
              <Cropper
                image={imageSrc}
                crop={crop}
                zoom={zoom}
                rotation={rotation}
                aspect={aspect}
                onCropChange={setCrop}
                onZoomChange={setZoom}
                onRotationChange={setRotation}
                onCropComplete={(_, pixels) => setCroppedAreaPixels(pixels)}
              />
            </div>
            <div className="image-crop-upload-controls">
              <ZoomOutOutlined className="image-crop-upload-controls-icon" />
              <Slider
                className="image-crop-upload-controls-slider"
                min={1}
                max={3}
                step={0.1}
                value={zoom}
                onChange={setZoom}
              />
              <ZoomInOutlined className="image-crop-upload-controls-icon" />
            </div>
            <div className="image-crop-upload-rotate">
              <Button icon={<UndoOutlined />} onClick={() => setRotation((v) => v - 90)}>
                左转
              </Button>
              <Button icon={<RedoOutlined />} onClick={() => setRotation((v) => v + 90)}>
                右转
              </Button>
            </div>
          </>
        )}
      </Modal>
    </>
  );
}
