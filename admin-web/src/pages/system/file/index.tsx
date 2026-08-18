import { FileImageOutlined, FileOutlined, UploadOutlined } from '@ant-design/icons';
import { Image, Input, Modal, Popconfirm, Space, Table, Typography, message } from 'antd';
import { useEffect, useState } from 'react';
import {
  deleteFile,
  downloadFile,
  fetchFileBlobUrl,
  getFiles,
  type FileItem,
} from '@/api/file';
import { AuthButton } from '@/components/AuthButton';
import { FileUpload } from '@/components/FileUpload';
import { formatDateTime, formatFileSize } from '@/utils/format';

function FileTypeIcon({ mimeType }: { mimeType: string }) {
  if (mimeType.startsWith('image/')) {
    return <FileImageOutlined style={{ color: '#1677ff' }} />;
  }
  return <FileOutlined style={{ color: '#8c8c8c' }} />;
}

/**
 * 文件管理页：列表筛选、上传弹窗、图片预览与非图片下载。
 */
export default function FileManagePage() {
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<FileItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [filename, setFilename] = useState('');
  const [uploadOpen, setUploadOpen] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string>();
  const [previewName, setPreviewName] = useState('');

  const loadData = async (p = page, ps = pageSize, keyword = filename) => {
    setLoading(true);
    try {
      const res = await getFiles({
        page: p,
        pageSize: ps,
        filename: keyword || undefined,
      });
      setData(res.items);
      setTotal(res.total);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handlePreview = async (record: FileItem) => {
    if (!record.mimeType.startsWith('image/')) {
      await downloadFile(record.id, record.originalName);
      return;
    }
    const url = await fetchFileBlobUrl(record.id);
    setPreviewUrl(url);
    setPreviewName(record.originalName);
  };

  const closePreview = () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(undefined);
    setPreviewName('');
  };

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
        <Typography.Title level={4} style={{ margin: 0 }}>
          文件管理
        </Typography.Title>
        <Space>
          <Input.Search
            placeholder="搜索文件名"
            allowClear
            style={{ width: 240 }}
            onSearch={(value) => {
              setFilename(value);
              setPage(1);
              loadData(1, pageSize, value);
            }}
          />
          <AuthButton
            type="primary"
            icon={<UploadOutlined />}
            permission="file:upload"
            onClick={() => setUploadOpen(true)}
          >
            上传
          </AuthButton>
        </Space>
      </div>

      <Table<FileItem>
        rowKey="id"
        loading={loading}
        dataSource={data}
        locale={{ emptyText: loading ? '加载中...' : '暂无数据' }}
        pagination={{
          current: page,
          pageSize,
          total,
          showSizeChanger: true,
          onChange: (p, ps) => {
            setPage(p);
            setPageSize(ps);
            loadData(p, ps);
          },
        }}
        columns={[
          {
            title: '文件',
            dataIndex: 'originalName',
            render: (name: string, record) => (
              <Space>
                <FileTypeIcon mimeType={record.mimeType} />
                <span>{name}</span>
              </Space>
            ),
          },
          { title: '类型', dataIndex: 'mimeType', width: 200 },
          {
            title: '大小',
            dataIndex: 'size',
            width: 100,
            render: (size: number) => formatFileSize(size),
          },
          { title: '上传人', dataIndex: 'uploaderName', width: 120, render: (v) => v ?? '-' },
          {
            title: '上传时间',
            dataIndex: 'createdAt',
            width: 180,
            render: (v: string) => formatDateTime(v),
          },
          {
            title: '操作',
            width: 180,
            render: (_, record) => (
              <Space>
                <AuthButton
                  type="link"
                  permission="file:download"
                  onClick={() => handlePreview(record)}
                >
                  {record.mimeType.startsWith('image/') ? '预览' : '下载'}
                </AuthButton>
                <AuthButton
                  type="link"
                  permission="file:download"
                  onClick={() => downloadFile(record.id, record.originalName)}
                >
                  下载
                </AuthButton>
                <Popconfirm
                  title="确认删除该文件？"
                  onConfirm={async () => {
                    await deleteFile(record.id);
                    message.success('删除成功');
                    loadData();
                  }}
                >
                  <AuthButton type="link" danger permission="file:delete">
                    删除
                  </AuthButton>
                </Popconfirm>
              </Space>
            ),
          },
        ]}
      />

      <Modal
        title="上传文件"
        open={uploadOpen}
        footer={null}
        onCancel={() => setUploadOpen(false)}
        destroyOnClose
      >
        <FileUpload
          maxCount={10}
          onSuccess={() => {
            setUploadOpen(false);
            loadData();
          }}
        />
      </Modal>

      <Image
        style={{ display: 'none' }}
        preview={{
          visible: !!previewUrl,
          src: previewUrl,
          onVisibleChange: (visible) => {
            if (!visible) closePreview();
          },
        }}
      />
      {previewUrl && (
        <span style={{ display: 'none' }} aria-hidden>
          {previewName}
        </span>
      )}
    </>
  );
}
