import { Form, Input, Modal, Select, Space, message } from 'antd';
import { useEffect, useState } from 'react';
import {
  createNotice,
  deleteNotice,
  getNotices,
  publishNotice,
  revokeNotice,
  updateNotice,
  type NoticeItem,
} from '@/api/notice';
import { AuthButton } from '@/components/AuthButton';
import { PageTable } from '@/components/PageTable';

const statusLabel: Record<number, string> = {
  0: '草稿',
  1: '已发布',
  2: '已撤回',
};

const targetTypeOptions = [
  { label: '全员', value: 'all' },
  { label: '指定用户', value: 'user' },
  { label: '部门', value: 'dept' },
  { label: '角色', value: 'role' },
];

/**
 * 系统公告页：草稿编辑、发布投递、撤回。
 */
export default function NoticeListPage() {
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<NoticeItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<NoticeItem | null>(null);
  const [form] = Form.useForm();

  const loadData = async (p = page, ps = pageSize) => {
    setLoading(true);
    try {
      const res = await getNotices({ page: p, pageSize: ps });
      setData(res.items);
      setTotal(res.total);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const openCreate = () => {
    setEditing(null);
    form.resetFields();
    form.setFieldsValue({ targetType: 'all', priority: 'normal', noticeType: 'announcement' });
    setModalOpen(true);
  };

  const openEdit = (record: NoticeItem) => {
    setEditing(record);
    form.setFieldsValue(record);
    setModalOpen(true);
  };

  const handleSubmit = async () => {
    const values = await form.validateFields();
    if (editing) {
      await updateNotice(editing.id, values);
      message.success('更新成功');
    } else {
      await createNotice(values);
      message.success('创建成功');
    }
    setModalOpen(false);
    loadData();
  };

  const handlePublish = async (record: NoticeItem) => {
    const res = await publishNotice(record.id, { targetType: record.targetType ?? 'all', targetIds: record.targetIds });
    message.success(`发布成功，已投递 ${res.deliveredCount} 人`);
    loadData();
  };

  const handleRevoke = async (record: NoticeItem) => {
    await revokeNotice(record.id);
    message.success('已撤回');
    loadData();
  };

  return (
    <>
      <PageTable<NoticeItem>
        title="系统公告"
        loading={loading}
        data={data}
        total={total}
        page={page}
        pageSize={pageSize}
        onPageChange={(p, ps) => {
          setPage(p);
          setPageSize(ps);
          loadData(p, ps);
        }}
        onCreate={openCreate}
        createPermission="notice:create"
        columns={[
          { title: 'ID', dataIndex: 'id', width: 80 },
          { title: '标题', dataIndex: 'title' },
          {
            title: '状态',
            dataIndex: 'status',
            width: 90,
            render: (v: number) => statusLabel[v] ?? String(v),
          },
          {
            title: '投递范围',
            dataIndex: 'targetType',
            width: 100,
            render: (v: string) => targetTypeOptions.find((o) => o.value === v)?.label ?? v,
          },
          { title: '发布时间', dataIndex: 'publishTime' },
          {
            title: '操作',
            width: 220,
            render: (_, record) => (
              <Space size={0}>
                {record.status === 0 && (
                  <>
                    <AuthButton type="link" permission="notice:update" onClick={() => openEdit(record)}>
                      编辑
                    </AuthButton>
                    <AuthButton type="link" permission="notice:update" onClick={() => handlePublish(record)}>
                      发布
                    </AuthButton>
                  </>
                )}
                {record.status === 1 && (
                  <AuthButton type="link" permission="notice:update" onClick={() => handleRevoke(record)}>
                    撤回
                  </AuthButton>
                )}
                <AuthButton
                  type="link"
                  danger
                  permission="notice:delete"
                  onClick={async () => {
                    await deleteNotice(record.id);
                    message.success('删除成功');
                    loadData();
                  }}
                >
                  删除
                </AuthButton>
              </Space>
            ),
          },
        ]}
      />

      <Modal
        title={editing ? '编辑公告' : '新建公告'}
        open={modalOpen}
        onOk={handleSubmit}
        onCancel={() => setModalOpen(false)}
        width={640}
      >
        <Form form={form} layout="vertical">
          <Form.Item name="title" label="标题" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item name="content" label="内容" rules={[{ required: true }]}>
            <Input.TextArea rows={8} placeholder="公告正文" />
          </Form.Item>
          <Form.Item name="targetType" label="投递范围" rules={[{ required: true }]}>
            <Select options={targetTypeOptions} />
          </Form.Item>
          <Form.Item name="priority" label="优先级" rules={[{ required: true }]}>
            <Select
              options={[
                { label: '普通', value: 'normal' },
                { label: '重要（弹窗提醒）', value: 'important' },
              ]}
            />
          </Form.Item>
        </Form>
      </Modal>
    </>
  );
}
