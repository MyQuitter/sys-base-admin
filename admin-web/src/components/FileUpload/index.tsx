import { UploadOutlined } from '@ant-design/icons';
import { Button, Upload, message } from 'antd';
import type { UploadFile, UploadProps } from 'antd/es/upload';
import { useState } from 'react';
import { uploadFiles, type FileItem } from '@/api/file';

export interface FileUploadProps {
  maxCount?: number;
  accept?: string;
  /** 单文件最大字节数，默认 10MB */
  maxSize?: number;
  onSuccess?: (file: FileItem | FileItem[]) => void;
}

const DEFAULT_MAX_SIZE = 10 * 1024 * 1024;

/**
 * 通用文件上传：customRequest 调用后端 multipart 接口。
 */
export function FileUpload({
  maxCount = 5,
  accept,
  maxSize = DEFAULT_MAX_SIZE,
  onSuccess,
}: FileUploadProps) {
  const [fileList, setFileList] = useState<UploadFile[]>([]);
  const [uploading, setUploading] = useState(false);

  const beforeUpload: UploadProps['beforeUpload'] = (file) => {
    if (file.size > maxSize) {
      message.error(`文件大小不能超过 ${Math.round(maxSize / 1024 / 1024)}MB`);
      return Upload.LIST_IGNORE;
    }
    return false;
  };

  const handleUpload = async () => {
    const pending = fileList.filter((f) => f.originFileObj).map((f) => f.originFileObj as File);
    if (!pending.length) {
      message.warning('请选择文件');
      return;
    }
    setUploading(true);
    try {
      const result = await uploadFiles(pending);
      message.success('上传成功');
      setFileList([]);
      onSuccess?.(result);
    } catch (err) {
      message.error(err instanceof Error ? err.message : '上传失败');
    } finally {
      setUploading(false);
    }
  };

  return (
    <div>
      <Upload
        multiple={maxCount > 1}
        maxCount={maxCount}
        accept={accept}
        fileList={fileList}
        beforeUpload={beforeUpload}
        onChange={({ fileList: next }) => setFileList(next)}
        onRemove={(file) => {
          setFileList((prev) => prev.filter((item) => item.uid !== file.uid));
        }}
      >
        <Button icon={<UploadOutlined />}>选择文件</Button>
      </Upload>
      <Button
        type="primary"
        onClick={handleUpload}
        loading={uploading}
        disabled={!fileList.length}
        style={{ marginTop: 12 }}
      >
        开始上传
      </Button>
    </div>
  );
}
