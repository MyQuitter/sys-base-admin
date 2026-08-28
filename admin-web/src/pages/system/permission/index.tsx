import { Form, Input, Modal } from 'antd';
import { useEffect, useState } from 'react';
import {
  createPermission,
  deletePermission,
  getPermissions,
  updatePermission,
  type PermissionItem,
} from '@/api/permission';
import { AuthButton } from '@/components/AuthButton';
import { PageTable } from '@/components/PageTable';

import { toast } from '@/utils/toast';
/**
 * 权限点管理页：维护 `{模块}:{操作}` 格式的权限码。
 * 编辑时编码不可变，仅可修改名称与所属模块。
 */
export default function PermissionListPage() {
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<PermissionItem[]>([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<PermissionItem | null>(null);
  const [form] = Form.useForm();

  const loadData = async () => {
    setLoading(true);
    try {
      setData(await getPermissions());
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
    setModalOpen(true);
  };

  const openEdit = (record: PermissionItem) => {
    setEditing(record);
    form.setFieldsValue({ code: record.code, name: record.name, module: record.module });
    setModalOpen(true);
  };

  const handleSubmit = async () => {
    const values = await form.validateFields();
    if (editing) {
      await updatePermission(editing.id, { name: values.name, module: values.module });
      toast.success('更新成功');
    } else {
      await createPermission(values);
      toast.success('创建成功');
    }
    setModalOpen(false);
    loadData();
  };

  return (
    <>
      <PageTable<PermissionItem>
        title="权限管理"
        loading={loading}
        data={data}
        pagination={false}
        onCreate={openCreate}
        createPermission="permission:create"
        columns={[
          { title: 'ID', dataIndex: 'id', width: 80 },
          { title: '编码', dataIndex: 'code' },
          { title: '名称', dataIndex: 'name' },
          { title: '模块', dataIndex: 'module' },
          {
            title: '操作',
            width: 160,
            render: (_, record) => (
              <>
                <AuthButton type="link" permission="permission:update" onClick={() => openEdit(record)}>
                  编辑
                </AuthButton>
                <AuthButton
                  type="link"
                  danger
                  permission="permission:delete"
                  onClick={async () => {
                    await deletePermission(record.id);
                    toast.success('删除成功');
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

      <Modal title={editing ? '编辑权限' : '新建权限'} open={modalOpen} onOk={handleSubmit} onCancel={() => setModalOpen(false)}>
        <Form form={form} layout="vertical">
          <Form.Item name="code" label="编码" rules={[{ required: true }]}>
            <Input disabled={!!editing} placeholder="user:list" />
          </Form.Item>
          <Form.Item name="name" label="名称" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item name="module" label="模块">
            <Input placeholder="user" />
          </Form.Item>
        </Form>
      </Modal>
    </>
  );
}
