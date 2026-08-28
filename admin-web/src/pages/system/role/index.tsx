import { Form, Input, Modal, Tree } from 'antd';
import type { DataNode } from 'antd/es/tree';
import { useEffect, useMemo, useState } from 'react';
import {
  assignRolePermissions,
  createRole,
  deleteRole,
  getRoles,
  updateRole,
  type RoleItem,
} from '@/api/role';
import { getPermissions } from '@/api/permission';
import { AuthButton } from '@/components/AuthButton';
import { PageTable } from '@/components/PageTable';

import { toast } from '@/utils/toast';
/**
 * 角色管理页：角色 CRUD 与权限分配（Modal 内 Tree 勾选）。
 * 权限树按 module 分组展示，提交 permissionIds 至 assignRolePermissions。
 */
export default function RoleListPage() {
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<RoleItem[]>([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<RoleItem | null>(null);
  const [permModalOpen, setPermModalOpen] = useState(false);
  const [currentRole, setCurrentRole] = useState<RoleItem | null>(null);
  const [checkedKeys, setCheckedKeys] = useState<number[]>([]);
  const [permTree, setPermTree] = useState<DataNode[]>([]);
  const [form] = Form.useForm();

  const loadData = async () => {
    setLoading(true);
    try {
      setData(await getRoles());
    } finally {
      setLoading(false);
    }
  };

  const loadPermTree = async () => {
    const permissions = await getPermissions();
    const modules = [...new Set(permissions.map((p) => p.module ?? 'other'))];
    setPermTree(
      modules.map((mod) => ({
        key: `mod-${mod}`,
        title: mod,
        selectable: false,
        children: permissions
          .filter((p) => (p.module ?? 'other') === mod)
          .map((p) => ({ key: p.id, title: `${p.name} (${p.code})` })),
      })),
    );
  };

  useEffect(() => {
    loadData();
    loadPermTree();
  }, []);

  const openCreate = () => {
    setEditing(null);
    form.resetFields();
    setModalOpen(true);
  };

  const openEdit = (record: RoleItem) => {
    setEditing(record);
    form.setFieldsValue({ code: record.code, name: record.name, description: record.description });
    setModalOpen(true);
  };

  const handleSubmit = async () => {
    const values = await form.validateFields();
    if (editing) {
      await updateRole(editing.id, { name: values.name, description: values.description });
      toast.success('更新成功');
    } else {
      await createRole(values);
      toast.success('创建成功');
    }
    setModalOpen(false);
    loadData();
  };

  const openAssign = (record: RoleItem) => {
    setCurrentRole(record);
    setCheckedKeys(record.permissions.map((p) => p.id));
    setPermModalOpen(true);
  };

  const handleAssign = async () => {
    if (!currentRole) return;
    const permissionIds = checkedKeys.filter((k) => typeof k === 'number') as number[];
    await assignRolePermissions(currentRole.id, permissionIds);
    toast.success('权限分配成功');
    setPermModalOpen(false);
    loadData();
  };

  const leafKeys = useMemo(() => {
    const keys: number[] = [];
    const walk = (nodes: DataNode[]) => {
      nodes.forEach((n) => {
        if (n.children?.length) walk(n.children);
        else if (typeof n.key === 'number') keys.push(n.key);
      });
    };
    walk(permTree);
    return keys;
  }, [permTree]);

  return (
    <>
      <PageTable<RoleItem>
        title="角色管理"
        loading={loading}
        data={data}
        pagination={false}
        onCreate={openCreate}
        createPermission="role:create"
        columns={[
          { title: 'ID', dataIndex: 'id', width: 80 },
          { title: '编码', dataIndex: 'code' },
          { title: '名称', dataIndex: 'name' },
          { title: '描述', dataIndex: 'description' },
          {
            title: '权限数',
            render: (_, r) => r.permissions.length,
          },
          {
            title: '操作',
            width: 220,
            render: (_, record) => (
              <>
                <AuthButton type="link" permission="role:update" onClick={() => openEdit(record)}>
                  编辑
                </AuthButton>
                <AuthButton type="link" permission="role:assign-permission" onClick={() => openAssign(record)}>
                  分配权限
                </AuthButton>
                <AuthButton
                  type="link"
                  danger
                  permission="role:delete"
                  onClick={async () => {
                    await deleteRole(record.id);
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

      <Modal title={editing ? '编辑角色' : '新建角色'} open={modalOpen} onOk={handleSubmit} onCancel={() => setModalOpen(false)}>
        <Form form={form} layout="vertical">
          <Form.Item name="code" label="编码" rules={[{ required: true }]}>
            <Input disabled={!!editing} />
          </Form.Item>
          <Form.Item name="name" label="名称" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item name="description" label="描述">
            <Input.TextArea rows={3} />
          </Form.Item>
        </Form>
      </Modal>

      <Modal title="分配权限" open={permModalOpen} onOk={handleAssign} onCancel={() => setPermModalOpen(false)} width={520}>
        <Tree
          checkable
          defaultExpandAll
          treeData={permTree}
          checkedKeys={checkedKeys}
          onCheck={(keys) => {
            const list = (Array.isArray(keys) ? keys : keys.checked).filter(
              (k): k is number => typeof k === 'number' && leafKeys.includes(k),
            );
            setCheckedKeys(list);
          }}
        />
      </Modal>
    </>
  );
}
