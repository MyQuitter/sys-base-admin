import { Form, Input, InputNumber, Modal, Select, message } from 'antd';
import { useEffect, useState } from 'react';
import {
  createPosition,
  deletePosition,
  getPositions,
  updatePosition,
  type PositionItem,
} from '@/api/position';
import { AuthButton } from '@/components/AuthButton';
import { PageTable } from '@/components/PageTable';

const statusOptions = [
  { label: '启用', value: 1 },
  { label: '禁用', value: 0 },
];

/**
 * 岗位管理页：岗位分页列表与 CRUD。
 */
export default function PositionListPage() {
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<PositionItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<PositionItem | null>(null);
  const [form] = Form.useForm();

  const loadData = async (p = page, ps = pageSize) => {
    setLoading(true);
    try {
      const res = await getPositions({ page: p, pageSize: ps });
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
    form.setFieldsValue({ status: 1, sort: 0 });
    setModalOpen(true);
  };

  const openEdit = (record: PositionItem) => {
    setEditing(record);
    form.setFieldsValue(record);
    setModalOpen(true);
  };

  const handleSubmit = async () => {
    const values = await form.validateFields();
    if (editing) {
      await updatePosition(editing.id, { name: values.name, sort: values.sort, status: values.status });
      message.success('更新成功');
    } else {
      await createPosition(values);
      message.success('创建成功');
    }
    setModalOpen(false);
    loadData();
  };

  return (
    <>
      <PageTable<PositionItem>
        title="岗位管理"
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
        createPermission="position:create"
        columns={[
          { title: 'ID', dataIndex: 'id', width: 80 },
          { title: '编码', dataIndex: 'code' },
          { title: '名称', dataIndex: 'name' },
          { title: '排序', dataIndex: 'sort', width: 80 },
          {
            title: '状态',
            dataIndex: 'status',
            render: (v: number) => (v === 1 ? '启用' : '禁用'),
          },
          {
            title: '操作',
            width: 160,
            render: (_, record) => (
              <>
                <AuthButton type="link" permission="position:update" onClick={() => openEdit(record)}>
                  编辑
                </AuthButton>
                <AuthButton
                  type="link"
                  danger
                  permission="position:delete"
                  onClick={async () => {
                    await deletePosition(record.id);
                    message.success('删除成功');
                    loadData();
                  }}
                >
                  删除
                </AuthButton>
              </>
            ),
          },
        ]}
      />

      <Modal title={editing ? '编辑岗位' : '新建岗位'} open={modalOpen} onOk={handleSubmit} onCancel={() => setModalOpen(false)}>
        <Form form={form} layout="vertical">
          <Form.Item name="code" label="编码" rules={[{ required: true }]}>
            <Input disabled={!!editing} />
          </Form.Item>
          <Form.Item name="name" label="名称" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item name="sort" label="排序">
            <InputNumber style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="status" label="状态" rules={[{ required: true }]}>
            <Select options={statusOptions} />
          </Form.Item>
        </Form>
      </Modal>
    </>
  );
}
