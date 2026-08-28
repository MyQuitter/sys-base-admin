import { Form, Input, Modal, Select, Space } from 'antd';
import { useEffect, useState } from 'react';
import {
  createMember,
  deleteMember,
  exportMembers,
  getMembers,
  resetMemberPassword,
  updateMember,
  type MemberItem,
} from '@/api/member';
import { AuthButton } from '@/components/AuthButton';
import { PageTable } from '@/components/PageTable';
import { formatDateTime } from '@/utils/format';

import { toast } from '@/utils/toast';
const statusOptions = [
  { label: '启用', value: 1 },
  { label: '禁用', value: 0 },
];

const sourceLabel: Record<string, string> = {
  app: 'App注册',
  admin: '后台创建',
  h5: 'H5注册',
};

const passwordRules = [
  { required: true, message: '请输入密码' },
  { min: 8, message: '至少 8 位' },
  {
    pattern: /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/,
    message: '须包含大小写字母和数字',
  },
];

/**
 * 会员用户管理页：分页列表、新建/编辑、删除与重置密码。
 */
export default function MemberListPage() {
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<MemberItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [keyword, setKeyword] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<MemberItem | null>(null);
  const [pwdModalOpen, setPwdModalOpen] = useState(false);
  const [pwdMemberId, setPwdMemberId] = useState<number | null>(null);
  const [form] = Form.useForm();
  const [pwdForm] = Form.useForm();

  const loadData = async (p = page, ps = pageSize, kw = keyword) => {
    setLoading(true);
    try {
      const res = await getMembers({
        page: p,
        pageSize: ps,
        keyword: kw || undefined,
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

  const openCreate = () => {
    setEditing(null);
    form.resetFields();
    form.setFieldsValue({ status: 1 });
    setModalOpen(true);
  };

  const openEdit = (record: MemberItem) => {
    setEditing(record);
    form.setFieldsValue({
      phone: record.phone,
      email: record.email,
      nickname: record.nickname,
      status: record.status,
    });
    setModalOpen(true);
  };

  const handleSubmit = async () => {
    const values = await form.validateFields();
    if (!values.phone?.trim() && !values.email?.trim()) {
      toast.error('手机号与邮箱至少填写一项');
      return;
    }
    if (editing) {
      await updateMember(editing.id, values);
      toast.success('更新成功');
    } else {
      await createMember(values);
      toast.success('创建成功');
    }
    setModalOpen(false);
    loadData();
  };

  const handleDelete = async (id: number) => {
    await deleteMember(id);
    toast.success('删除成功');
    loadData();
  };

  const openResetPwd = (id: number) => {
    setPwdMemberId(id);
    pwdForm.resetFields();
    setPwdModalOpen(true);
  };

  const handleResetPwd = async () => {
    const values = await pwdForm.validateFields();
    if (!pwdMemberId) return;
    await resetMemberPassword(pwdMemberId, values.password);
    toast.success('密码已重置');
    setPwdModalOpen(false);
  };

  const handleExport = async () => {
    try {
      await exportMembers({ keyword: keyword || undefined });
      toast.success('导出成功');
    } catch {
      // exportMembers 已提示错误
    }
  };

  return (
    <>
      <PageTable<MemberItem>
        title="会员用户"
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
        searchPlaceholder="手机/邮箱/昵称"
        onSearch={(v) => {
          setKeyword(v);
          setPage(1);
          loadData(1, pageSize, v);
        }}
        onCreate={openCreate}
        createPermission="member:create"
        toolbarExtra={
          <AuthButton permission="member:list" onClick={handleExport}>
            导出
          </AuthButton>
        }
        columns={[
          { title: 'ID', dataIndex: 'id', width: 70 },
          { title: '手机号', dataIndex: 'phone', width: 130, render: (v?: string) => v ?? '-' },
          { title: '邮箱', dataIndex: 'email', ellipsis: true, render: (v?: string) => v ?? '-' },
          { title: '昵称', dataIndex: 'nickname', render: (v?: string) => v ?? '-' },
          {
            title: '状态',
            dataIndex: 'status',
            width: 80,
            render: (v: number) => (v === 1 ? '启用' : '禁用'),
          },
          {
            title: '注册来源',
            dataIndex: 'registerSource',
            width: 100,
            render: (v: string) => sourceLabel[v] ?? v,
          },
          {
            title: '最后登录',
            dataIndex: 'lastLoginAt',
            width: 170,
            render: (v?: string) => (v ? formatDateTime(v) : '-'),
          },
          {
            title: '创建时间',
            dataIndex: 'createdAt',
            width: 170,
            render: (v: string) => formatDateTime(v),
          },
          {
            title: '操作',
            width: 260,
            render: (_, record) => (
              <Space size={8} wrap>
                <AuthButton size="small" permission="member:update" onClick={() => openEdit(record)}>
                  编辑
                </AuthButton>
                <AuthButton size="small" permission="member:reset-password" onClick={() => openResetPwd(record.id)}>
                  重置密码
                </AuthButton>
                <AuthButton size="small" danger permission="member:delete" onClick={() => handleDelete(record.id)}>
                  删除
                </AuthButton>
              </Space>
            ),
          },
        ]}
      />

      <Modal
        title={editing ? '编辑会员用户' : '新建会员用户'}
        open={modalOpen}
        onOk={handleSubmit}
        onCancel={() => setModalOpen(false)}
        destroyOnHidden
      >
        <Form form={form} layout="vertical">
          {!editing ? (
            <Form.Item name="password" label="密码" rules={passwordRules}>
              <Input.Password placeholder="至少8位，含大小写字母和数字" />
            </Form.Item>
          ) : null}
          <Form.Item
            name="phone"
            label="手机号"
            rules={[{ pattern: /^1[3-9]\d{9}$/, message: '手机号格式无效' }]}
          >
            <Input placeholder="选填，与邮箱至少一项" />
          </Form.Item>
          <Form.Item name="email" label="邮箱" rules={[{ type: 'email', message: '邮箱格式无效' }]}>
            <Input placeholder="选填，与手机至少一项" />
          </Form.Item>
          <Form.Item name="nickname" label="昵称">
            <Input />
          </Form.Item>
          <Form.Item name="status" label="状态" rules={[{ required: true }]}>
            <Select options={statusOptions} />
          </Form.Item>
        </Form>
      </Modal>

      <Modal title="重置密码" open={pwdModalOpen} onOk={handleResetPwd} onCancel={() => setPwdModalOpen(false)}>
        <Form form={pwdForm} layout="vertical">
          <Form.Item name="password" label="新密码" rules={passwordRules}>
            <Input.Password />
          </Form.Item>
        </Form>
      </Modal>
    </>
  );
}
