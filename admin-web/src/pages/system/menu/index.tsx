import { Form, Input, InputNumber, Modal, Select } from 'antd';
import { useEffect, useState } from 'react';
import {
  createMenu,
  deleteMenu,
  getMenus,
  updateMenu,
  type MenuItem,
} from '@/api/menu';
import { AuthButton } from '@/components/AuthButton';
import { PageTable } from '@/components/PageTable';

import { toast } from '@/utils/toast';
const statusOptions = [
  { label: '启用', value: 1 },
  { label: '禁用', value: 0 },
];

/**
 * 菜单管理页：维护侧边栏菜单的扁平列表（路径、图标、权限码、排序）。
 * 修改后需重新登录或刷新菜单 Store 才能在侧边栏看到效果。
 */
export default function MenuListPage() {
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<MenuItem[]>([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<MenuItem | null>(null);
  const [form] = Form.useForm();

  const loadData = async () => {
    setLoading(true);
    try {
      setData(await getMenus());
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const parentOptions = data.map((m) => ({ label: m.name, value: m.id }));

  const openCreate = () => {
    setEditing(null);
    form.resetFields();
    form.setFieldsValue({ status: 1, sort: 0 });
    setModalOpen(true);
  };

  const openEdit = (record: MenuItem) => {
    setEditing(record);
    form.setFieldsValue(record);
    setModalOpen(true);
  };

  const handleSubmit = async () => {
    const values = await form.validateFields();
    if (editing) {
      await updateMenu(editing.id, values);
      toast.success('更新成功');
    } else {
      await createMenu(values);
      toast.success('创建成功');
    }
    setModalOpen(false);
    loadData();
  };

  return (
    <>
      <PageTable<MenuItem>
        title="菜单管理"
        loading={loading}
        data={data}
        pagination={false}
        onCreate={openCreate}
        createPermission="menu:create"
        columns={[
          { title: 'ID', dataIndex: 'id', width: 80 },
          { title: '名称', dataIndex: 'name' },
          { title: '路径', dataIndex: 'path' },
          { title: '图标', dataIndex: 'icon' },
          { title: '权限码', dataIndex: 'permissionCode' },
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
                <AuthButton type="link" permission="menu:update" onClick={() => openEdit(record)}>
                  编辑
                </AuthButton>
                <AuthButton
                  type="link"
                  danger
                  permission="menu:delete"
                  onClick={async () => {
                    await deleteMenu(record.id);
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

      <Modal title={editing ? '编辑菜单' : '新建菜单'} open={modalOpen} onOk={handleSubmit} onCancel={() => setModalOpen(false)}>
        <Form form={form} layout="vertical">
          <Form.Item name="parentId" label="父菜单">
            <Select options={parentOptions} allowClear placeholder="顶级菜单" />
          </Form.Item>
          <Form.Item name="name" label="名称" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item name="path" label="路径">
            <Input placeholder="/system/user" />
          </Form.Item>
          <Form.Item name="icon" label="图标">
            <Input placeholder="DashboardOutlined" />
          </Form.Item>
          <Form.Item name="permissionCode" label="权限码">
            <Input placeholder="user:list" />
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
