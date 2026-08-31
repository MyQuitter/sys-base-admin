import { Form, Input, Modal, Tooltip, Tree, Typography } from 'antd';
import type { DataNode } from 'antd/es/tree';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  assignRoleMenus,
  assignRolePermissions,
  createRole,
  deleteRole,
  getRoleMenuOptions,
  getRoles,
  updateRole,
  type RoleItem,
  type RoleMenuOption,
} from '@/api/role';
import { getPermissions, type PermissionItem } from '@/api/permission';
import { AuthButton } from '@/components/AuthButton';
import { PageTable } from '@/components/PageTable';

import { toast } from '@/utils/toast';

function codePrefix(code?: string): string | undefined {
  if (!code) return undefined;
  const i = code.indexOf(':');
  return i === -1 ? code : code.slice(0, i);
}

function buildMenuTree(menus: RoleMenuOption[]): DataNode[] {
  const byParent = new Map<number | undefined, RoleMenuOption[]>();
  menus.forEach((item) => {
    const pid = item.parentId ?? undefined;
    const list = byParent.get(pid) ?? [];
    list.push(item);
    byParent.set(pid, list);
  });
  const walk = (parentId?: number): DataNode[] =>
    (byParent.get(parentId) ?? []).map((item) => {
      const children = walk(item.id);
      return {
        key: item.id,
        title: item.path ? `${item.name}  (${item.path})` : item.name,
        children: children.length ? children : undefined,
      };
    });
  return walk(undefined);
}

function buildPermTree(permissions: PermissionItem[]): DataNode[] {
  const modules = [...new Set(permissions.map((p) => p.module ?? 'other'))];
  return modules.map((mod) => ({
    key: `mod-${mod}`,
    title: mod,
    selectable: false,
    children: permissions
      .filter((p) => (p.module ?? 'other') === mod)
      .map((p) => ({ key: p.id, title: `${p.name} (${p.code})` })),
  }));
}

function menuPrefixes(role: RoleItem, menuOptions: RoleMenuOption[]): Set<string> {
  const selectedIds = new Set((role.menus ?? []).map((m) => m.id));
  const prefixes = new Set<string>();
  for (const menu of menuOptions) {
    if (!selectedIds.has(menu.id)) continue;
    const prefix = codePrefix(menu.permissionCode);
    if (prefix) prefixes.add(prefix);
  }
  for (const menu of role.menus ?? []) {
    const prefix = codePrefix(menu.permissionCode);
    if (prefix) prefixes.add(prefix);
  }
  return prefixes;
}

/**
 * 角色管理页：先分配侧栏菜单，再按栏目微调接口权限；未勾选权限时默认栏目下全部权限。
 */
export default function RoleListPage() {
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<RoleItem[]>([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<RoleItem | null>(null);
  const [permModalOpen, setPermModalOpen] = useState(false);
  const [menuModalOpen, setMenuModalOpen] = useState(false);
  const [currentRole, setCurrentRole] = useState<RoleItem | null>(null);
  const [checkedKeys, setCheckedKeys] = useState<number[]>([]);
  const [menuCheckedKeys, setMenuCheckedKeys] = useState<number[]>([]);
  const [allPermissions, setAllPermissions] = useState<PermissionItem[]>([]);
  const [permTree, setPermTree] = useState<DataNode[]>([]);
  const [menuOptions, setMenuOptions] = useState<RoleMenuOption[]>([]);
  const menuHalfCheckedRef = useRef<number[]>([]);
  const [form] = Form.useForm();

  const menuTree = useMemo(() => buildMenuTree(menuOptions), [menuOptions]);

  const loadData = async () => {
    setLoading(true);
    try {
      setData(await getRoles());
    } finally {
      setLoading(false);
    }
  };

  const loadPerms = async () => {
    setAllPermissions(await getPermissions());
  };

  const loadMenuOptions = async () => {
    try {
      setMenuOptions(await getRoleMenuOptions());
    } catch {
      setMenuOptions([]);
    }
  };

  useEffect(() => {
    loadData();
    void loadPerms();
    void loadMenuOptions();
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
    if (!record.menuRestricted) {
      toast.warning('请先分配菜单');
      return;
    }
    const prefixes = menuPrefixes(record, menuOptions);
    const allowed = allPermissions.filter((p) => {
      const prefix = codePrefix(p.code);
      return Boolean(prefix && prefixes.has(prefix));
    });
    setCurrentRole(record);
    setPermTree(buildPermTree(allowed));
    const allowedIds = new Set(allowed.map((p) => p.id));
    const existing = record.permissions.map((p) => p.id).filter((id) => allowedIds.has(id));
    setCheckedKeys(existing.length ? existing : allowed.map((p) => p.id));
    setPermModalOpen(true);
  };

  const handleAssign = async () => {
    if (!currentRole) return;
    const permissionIds = checkedKeys.filter((k) => typeof k === 'number');
    const saved = await assignRolePermissions(currentRole.id, permissionIds);
    toast.success(
      permissionIds.length ? '权限分配成功' : '未勾选权限，已默认授予所选菜单栏目下全部权限',
    );
    setPermModalOpen(false);
    loadData();
    void saved;
  };

  const openAssignMenus = (record: RoleItem) => {
    setCurrentRole(record);
    menuHalfCheckedRef.current = [];
    if (record.menuRestricted) {
      setMenuCheckedKeys((record.menus ?? []).map((m) => m.id));
    } else {
      const codes = new Set(record.permissions.map((p) => p.code));
      setMenuCheckedKeys(
        menuOptions
          .filter((item) => !item.permissionCode || codes.has(item.permissionCode))
          .map((item) => item.id),
      );
    }
    setMenuModalOpen(true);
  };

  const handleAssignMenus = async () => {
    if (!currentRole) return;
    await assignRoleMenus(currentRole.id, [...new Set([...menuCheckedKeys, ...menuHalfCheckedRef.current])]);
    toast.success('菜单已保存，未单独勾选的栏目已默认授予全部权限');
    setMenuModalOpen(false);
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
            title: '菜单',
            width: 90,
            render: (_, r) => (r.menuRestricted ? r.menus?.length ?? 0 : '未分配'),
          },
          {
            title: '权限数',
            width: 90,
            render: (_, r) => r.permissions.length,
          },
          {
            title: '操作',
            width: 300,
            render: (_, record) => {
              const canAssignPerm = Boolean(record.menuRestricted);
              return (
                <>
                  <AuthButton type="link" permission="role:update" onClick={() => openEdit(record)}>
                    编辑
                  </AuthButton>
                  <AuthButton type="link" permission="role:assign-permission" onClick={() => openAssignMenus(record)}>
                    分配菜单
                  </AuthButton>
                  <Tooltip title={canAssignPerm ? undefined : '请先分配菜单'}>
                    <span>
                      <AuthButton
                        type="link"
                        permission="role:assign-permission"
                        disabled={!canAssignPerm}
                        onClick={() => openAssign(record)}
                      >
                        分配权限
                      </AuthButton>
                    </span>
                  </Tooltip>
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
              );
            },
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

      <Modal
        title="分配权限"
        open={permModalOpen}
        onOk={handleAssign}
        onCancel={() => setPermModalOpen(false)}
        width={520}
        styles={{ body: { maxHeight: 'calc(100vh - 200px)', overflowY: 'auto' } }}
      >
        <Typography.Paragraph type="secondary" style={{ marginBottom: 12 }}>
          仅显示已分配菜单栏目下的接口权限。不勾选任何项时，默认授予这些栏目的全部权限。
        </Typography.Paragraph>
        {permTree.length ? (
          <Tree
            checkable
            defaultExpandAll
            treeData={permTree}
            key={currentRole ? `perm-${currentRole.id}` : 'perm'}
            checkedKeys={checkedKeys}
            onCheck={(keys) => {
              const list = (Array.isArray(keys) ? keys : keys.checked).filter(
                (k): k is number => typeof k === 'number' && leafKeys.includes(k),
              );
              setCheckedKeys(list);
            }}
          />
        ) : (
          <Typography.Text type="secondary">所选菜单没有对应的接口权限。</Typography.Text>
        )}
      </Modal>

      <Modal
        title="分配菜单"
        open={menuModalOpen}
        onOk={handleAssignMenus}
        onCancel={() => setMenuModalOpen(false)}
        width={560}
        styles={{ body: { maxHeight: 'calc(100vh - 200px)', overflowY: 'auto' } }}
      >
        <Typography.Paragraph type="secondary" style={{ marginBottom: 12 }}>
          请先勾选侧栏可见菜单。保存后会默认授予这些栏目下的全部接口权限，可再通过「分配权限」微调。用户需重新登录或刷新后生效。
        </Typography.Paragraph>
        <Tree
          checkable
          defaultExpandAll
          treeData={menuTree}
          key={currentRole ? `menu-${currentRole.id}-${menuModalOpen}` : 'menu'}
          checkedKeys={menuCheckedKeys}
          onCheck={(keys, info) => {
            const list = (Array.isArray(keys) ? keys : keys.checked).filter(
              (k): k is number => typeof k === 'number',
            );
            menuHalfCheckedRef.current = (info.halfCheckedKeys ?? []).filter(
              (k): k is number => typeof k === 'number',
            );
            setMenuCheckedKeys(list);
          }}
        />
      </Modal>
    </>
  );
}
