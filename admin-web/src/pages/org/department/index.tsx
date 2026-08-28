import { DeleteOutlined, EditOutlined, PlusOutlined } from '@ant-design/icons';
import { Card, Col, Form, Input, InputNumber, Modal, Row, Select, Space, Table, Tree } from 'antd';
import type { DataNode } from 'antd/es/tree';
import { useEffect, useMemo, useState } from 'react';
import {
  createDepartment,
  deleteDepartment,
  getDepartment,
  getDepartmentTree,
  updateDepartment,
  type DepartmentTreeNode,
} from '@/api/department';
import { getUsers, type UserItem } from '@/api/user';
import { AuthButton } from '@/components/AuthButton';

import { toast } from '@/utils/toast';
const statusOptions = [
  { label: '启用', value: 1 },
  { label: '禁用', value: 0 },
];

function toTreeData(nodes: DepartmentTreeNode[]): DataNode[] {
  return nodes.map((n) => ({
    key: String(n.id),
    title: n.name,
    children: n.children?.length ? toTreeData(n.children) : undefined,
  }));
}

/**
 * 部门管理页：左侧部门树 + 右侧部门表单与部门用户列表（左树右表）。
 */
export default function DepartmentPage() {
  const [tree, setTree] = useState<DepartmentTreeNode[]>([]);
  const [selectedId, setSelectedId] = useState<number>();
  const [detail, setDetail] = useState<DepartmentTreeNode | null>(null);
  const [users, setUsers] = useState<UserItem[]>([]);
  const [userTotal, setUserTotal] = useState(0);
  const [modalOpen, setModalOpen] = useState(false);
  const [isCreateMode, setIsCreateMode] = useState(true);
  const [form] = Form.useForm();

  const loadTree = async () => {
    setTree(await getDepartmentTree());
  };

  const loadUsers = async (departmentId: number, page = 1) => {
    const res = await getUsers({ page, pageSize: 10, departmentId });
    setUsers(res.items);
    setUserTotal(res.total);
  };

  const loadDetail = async (id: number) => {
    const data = await getDepartment(id);
    setDetail(data);
    form.setFieldsValue(data);
    await loadUsers(id);
  };

  useEffect(() => {
    loadTree();
  }, []);

  const treeData = useMemo(() => toTreeData(tree), [tree]);

  const openCreate = (parentId?: number) => {
    setIsCreateMode(true);
    form.resetFields();
    form.setFieldsValue({ parentId, status: 1, sort: 0 });
    setModalOpen(true);
  };

  const openEdit = () => {
    if (!detail) return;
    setIsCreateMode(false);
    form.setFieldsValue(detail);
    setModalOpen(true);
  };

  const handleSave = async () => {
    const values = await form.validateFields();
    if (isCreateMode) {
      await createDepartment(values);
      toast.success('创建成功');
    } else if (selectedId) {
      await updateDepartment(selectedId, values);
      toast.success('更新成功');
    }
    setModalOpen(false);
    await loadTree();
    if (selectedId) await loadDetail(selectedId);
  };

  return (
    <Row gutter={16} style={{ height: '100%' }}>
      <Col span={7}>
        <Card
          title="部门树"
          size="small"
          extra={
            <AuthButton type="link" permission="department:create" icon={<PlusOutlined />} onClick={() => openCreate()}>
              新建
            </AuthButton>
          }
          styles={{ body: { maxHeight: 'calc(100vh - 220px)', overflow: 'auto' } }}
        >
          <Tree
            treeData={treeData}
            selectedKeys={selectedId ? [String(selectedId)] : []}
            onSelect={(keys) => {
              const id = Number(keys[0]);
              if (!id) return;
              setSelectedId(id);
              loadDetail(id);
            }}
          />
        </Card>
      </Col>
      <Col span={17}>
        {selectedId && detail ? (
          <Space orientation="vertical" style={{ width: '100%' }} size={16}>
            <Card
              title={`部门：${detail.name}`}
              size="small"
              extra={
                <Space>
                  <AuthButton
                    permission="department:create"
                    icon={<PlusOutlined />}
                    onClick={() => openCreate(selectedId)}
                  >
                    添加子部门
                  </AuthButton>
                  <AuthButton permission="department:update" icon={<EditOutlined />} onClick={openEdit}>
                    编辑
                  </AuthButton>
                  <AuthButton
                    permission="department:delete"
                    danger
                    icon={<DeleteOutlined />}
                    onClick={async () => {
                      await deleteDepartment(selectedId);
                      toast.success('删除成功');
                      setSelectedId(undefined);
                      setDetail(null);
                      loadTree();
                    }}
                  >
                    删除
                  </AuthButton>
                </Space>
              }
            >
              <p>编码：{detail.code}</p>
              <p>负责人：{detail.leader ?? '-'}</p>
              <p>电话：{detail.phone ?? '-'}</p>
            </Card>
            <Card title="部门用户" size="small">
              <Table
                rowKey="id"
                size="small"
                dataSource={users}
                pagination={{ total: userTotal, pageSize: 10, onChange: (p) => loadUsers(selectedId, p) }}
                columns={[
                  { title: '用户名', dataIndex: 'username' },
                  { title: '昵称', dataIndex: 'nickname' },
                  {
                    title: '状态',
                    dataIndex: 'status',
                    render: (v: number) => (v === 1 ? '启用' : '禁用'),
                  },
                ]}
              />
            </Card>
          </Space>
        ) : (
          <Card size="small">请在左侧选择部门</Card>
        )}
      </Col>

      <Modal
        title={isCreateMode ? '新建部门' : '编辑部门'}
        open={modalOpen}
        onOk={handleSave}
        onCancel={() => setModalOpen(false)}
        destroyOnHidden
      >
        <Form form={form} layout="vertical">
          <Form.Item name="parentId" label="上级部门" hidden>
            <InputNumber />
          </Form.Item>
          <Form.Item name="name" label="部门名称" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item name="code" label="部门编码" rules={[{ required: true }]}>
            <Input disabled={!isCreateMode} />
          </Form.Item>
          <Form.Item name="leader" label="负责人">
            <Input />
          </Form.Item>
          <Form.Item name="phone" label="联系电话">
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
    </Row>
  );
}
