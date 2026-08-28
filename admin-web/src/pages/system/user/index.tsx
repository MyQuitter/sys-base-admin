import { Form, Input, Modal, Select, Space, Typography } from 'antd';
import { useEffect, useState } from 'react';
import {
  bindUserWallet,
  createUser,
  getUsers,
  resetPassword,
  unbindUserWallet,
  updateUser,
  deleteUser,
  type UserItem,
} from '@/api/user';
import { isAddress } from 'viem';
import { getRoles } from '@/api/role';
import { AuthButton } from '@/components/AuthButton';
import { PageTable } from '@/components/PageTable';

import { toast } from '@/utils/toast';
const statusOptions = [
  { label: '启用', value: 1 },
  { label: '禁用', value: 0 },
];

/**
 * 系统用户页：分页列表、新建/编辑、删除与重置密码。
 * 行内操作通过 AuthButton 按 RBAC 权限码显隐；角色选项来自 getRoles。
 */
export default function UserListPage() {
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<UserItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [keyword, setKeyword] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<UserItem | null>(null);
  const [roleOptions, setRoleOptions] = useState<{ label: string; value: number }[]>([]);
  const [pwdModalOpen, setPwdModalOpen] = useState(false);
  const [pwdUserId, setPwdUserId] = useState<number | null>(null);
  const [walletModalOpen, setWalletModalOpen] = useState(false);
  const [walletUser, setWalletUser] = useState<UserItem | null>(null);
  const [form] = Form.useForm();
  const [pwdForm] = Form.useForm();
  const [walletForm] = Form.useForm();

  const loadData = async (p = page, ps = pageSize) => {
    setLoading(true);
    try {
      const res = await getUsers({ page: p, pageSize: ps, username: keyword || undefined });
      setData(res.items);
      setTotal(res.total);
    } finally {
      setLoading(false);
    }
  };

  const loadRoles = async () => {
    const roles = await getRoles();
    setRoleOptions(roles.map((r) => ({ label: r.name, value: r.id })));
  };

  useEffect(() => {
    loadData();
    loadRoles();
  }, []);

  const openCreate = () => {
    setEditing(null);
    form.resetFields();
    form.setFieldsValue({ status: 1 });
    setModalOpen(true);
  };

  const openEdit = (record: UserItem) => {
    setEditing(record);
    form.setFieldsValue({
      username: record.username,
      nickname: record.nickname,
      status: record.status,
      roleIds: record.roles.map((r) => r.id),
    });
    setModalOpen(true);
  };

  const handleSubmit = async () => {
    const values = await form.validateFields();
    if (editing) {
      await updateUser(editing.id, values);
      toast.success('更新成功');
    } else {
      await createUser(values);
      toast.success('创建成功');
    }
    setModalOpen(false);
    loadData();
  };

  const handleDelete = async (id: number) => {
    await deleteUser(id);
    toast.success('删除成功');
    loadData();
  };

  const openResetPwd = (id: number) => {
    setPwdUserId(id);
    pwdForm.resetFields();
    setPwdModalOpen(true);
  };

  const handleResetPwd = async () => {
    const values = await pwdForm.validateFields();
    if (!pwdUserId) return;
    await resetPassword(pwdUserId, values.password);
    toast.success('密码已重置');
    setPwdModalOpen(false);
  };

  const openWalletModal = (record: UserItem) => {
    setWalletUser(record);
    walletForm.setFieldsValue({ walletAddress: record.walletAddress ?? '' });
    setWalletModalOpen(true);
  };

  const handleBindWallet = async () => {
    const values = await walletForm.validateFields();
    if (!walletUser) return;
    if (!isAddress(values.walletAddress)) {
      toast.error('钱包地址格式无效');
      return;
    }
    await bindUserWallet(walletUser.id, values.walletAddress);
    toast.success('钱包绑定成功');
    setWalletModalOpen(false);
    loadData();
  };

  const handleUnbindWallet = async (record: UserItem) => {
    await unbindUserWallet(record.id);
    toast.success('已解绑钱包');
    loadData();
  };

  return (
    <>
      <PageTable<UserItem>
        title="系统用户"
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
        searchPlaceholder="用户名"
        onSearch={(v) => {
          setKeyword(v);
          setPage(1);
          getUsers({ page: 1, pageSize, username: v || undefined }).then((res) => {
            setData(res.items);
            setTotal(res.total);
          });
        }}
        onCreate={openCreate}
        createPermission="user:create"
        columns={[
          { title: 'ID', dataIndex: 'id', width: 80 },
          { title: '用户名', dataIndex: 'username' },
          { title: '昵称', dataIndex: 'nickname' },
          {
            title: '钱包',
            dataIndex: 'walletAddressMasked',
            render: (v: string | undefined) => v ?? '-',
          },
          {
            title: '状态',
            dataIndex: 'status',
            render: (v: number) => (v === 1 ? '启用' : '禁用'),
          },
          {
            title: '角色',
            dataIndex: 'roles',
            render: (roles: UserItem['roles']) => roles.map((r) => r.name).join(', '),
          },
          {
            title: '操作',
            width: 340,
            render: (_, record) => (
              <Space size={8} wrap>
                <AuthButton size="small" permission="user:update" onClick={() => openEdit(record)}>
                  编辑
                </AuthButton>
                <AuthButton size="small" permission="user:bind-wallet" onClick={() => openWalletModal(record)}>
                  {record.walletAddress ? '换绑钱包' : '绑定钱包'}
                </AuthButton>
                {record.walletAddress ? (
                  <AuthButton
                    size="small"
                    danger
                    permission="user:bind-wallet"
                    onClick={() => handleUnbindWallet(record)}
                  >
                    解绑
                  </AuthButton>
                ) : null}
                <AuthButton size="small" permission="user:reset-password" onClick={() => openResetPwd(record.id)}>
                  重置密码
                </AuthButton>
                <AuthButton
                  size="small"
                  danger
                  permission="user:delete"
                  disabled={total <= 1}
                  title={total <= 1 ? '系统至少保留一名用户' : undefined}
                  onClick={() => handleDelete(record.id)}
                >
                  删除
                </AuthButton>
              </Space>
            ),
          },
        ]}
      />

      <Modal
        title={editing ? '编辑用户' : '新建用户'}
        open={modalOpen}
        onOk={handleSubmit}
        onCancel={() => setModalOpen(false)}
        destroyOnHidden
      >
        <Form form={form} layout="vertical">
          {!editing ? (
            <>
              <Form.Item name="username" label="用户名" rules={[{ required: true }]}>
                <Input />
              </Form.Item>
              <Form.Item name="password" label="密码" rules={[{ required: true, min: 6 }]}>
                <Input.Password />
              </Form.Item>
            </>
          ) : (
            <Form.Item name="username" label="用户名" rules={[{ required: true }]}>
              <Input />
            </Form.Item>
          )}
          <Form.Item name="nickname" label="昵称">
            <Input />
          </Form.Item>
          <Form.Item name="status" label="状态" rules={[{ required: true }]}>
            <Select options={statusOptions} />
          </Form.Item>
          <Form.Item name="roleIds" label="角色">
            <Select mode="multiple" options={roleOptions} allowClear />
          </Form.Item>
        </Form>
      </Modal>

      <Modal title="重置密码" open={pwdModalOpen} onOk={handleResetPwd} onCancel={() => setPwdModalOpen(false)}>
        <Form form={pwdForm} layout="vertical">
          <Form.Item name="password" label="新密码" rules={[{ required: true, min: 6 }]}>
            <Input.Password />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title={walletUser?.walletAddress ? '换绑钱包' : '绑定钱包'}
        open={walletModalOpen}
        onOk={handleBindWallet}
        onCancel={() => setWalletModalOpen(false)}
        destroyOnHidden
      >
        <Form form={walletForm} layout="vertical">
          <Typography.Paragraph type="secondary">
            绑定后该地址可用于钱包登录（具体方式取决于系统设置的登录模式）。
          </Typography.Paragraph>
          <Form.Item
            name="walletAddress"
            label="EVM 钱包地址"
            rules={[{ required: true, message: '请输入钱包地址' }]}
          >
            <Input placeholder="0x..." />
          </Form.Item>
        </Form>
      </Modal>
    </>
  );
}
