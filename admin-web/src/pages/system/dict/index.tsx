import { Form, Input, InputNumber, Modal, Select, Tabs } from 'antd';
import { useEffect, useState } from 'react';
import {
  createDictData,
  createDictType,
  deleteDictData,
  deleteDictType,
  getDictData,
  getDictTypes,
  updateDictData,
  updateDictType,
  type DictDataItem,
  type DictTypeItem,
} from '@/api/dict';
import { AuthButton } from '@/components/AuthButton';
import { PageTable } from '@/components/PageTable';

import { toast } from '@/utils/toast';
const statusOptions = [
  { label: '启用', value: 1 },
  { label: '禁用', value: 0 },
];

/**
 * 字典管理页：上方字典类型 Tab，下方字典数据子表。
 */
export default function DictListPage() {
  const [types, setTypes] = useState<DictTypeItem[]>([]);
  const [activeTypeId, setActiveTypeId] = useState<number>();
  const [dataLoading, setDataLoading] = useState(false);
  const [dataList, setDataList] = useState<DictDataItem[]>([]);
  const [typeModalOpen, setTypeModalOpen] = useState(false);
  const [dataModalOpen, setDataModalOpen] = useState(false);
  const [editingType, setEditingType] = useState<DictTypeItem | null>(null);
  const [editingData, setEditingData] = useState<DictDataItem | null>(null);
  const [typeForm] = Form.useForm();
  const [dataForm] = Form.useForm();

  const loadTypes = async () => {
    const list = await getDictTypes();
    setTypes(list);
    if (!activeTypeId && list.length) setActiveTypeId(list[0].id);
  };

  const loadData = async (typeId = activeTypeId) => {
    if (!typeId) return;
    setDataLoading(true);
    try {
      setDataList(await getDictData(typeId));
    } finally {
      setDataLoading(false);
    }
  };

  useEffect(() => {
    loadTypes();
  }, []);

  useEffect(() => {
    if (activeTypeId) loadData(activeTypeId);
  }, [activeTypeId]);

  const handleTypeSubmit = async () => {
    const values = await typeForm.validateFields();
    if (editingType) {
      await updateDictType(editingType.id, values);
      toast.success('类型更新成功');
    } else {
      await createDictType(values);
      toast.success('类型创建成功');
    }
    setTypeModalOpen(false);
    loadTypes();
  };

  const handleDataSubmit = async () => {
    const values = await dataForm.validateFields();
    if (editingData) {
      await updateDictData(editingData.id, values);
      toast.success('字典项更新成功');
    } else {
      await createDictData({ ...values, typeId: activeTypeId });
      toast.success('字典项创建成功');
    }
    setDataModalOpen(false);
    loadData();
  };

  return (
    <div>
      <Tabs
        activeKey={activeTypeId ? String(activeTypeId) : undefined}
        onChange={(key) => setActiveTypeId(Number(key))}
        tabBarExtraContent={
          <AuthButton
            permission="dict:create"
            type="primary"
            onClick={() => {
              setEditingType(null);
              typeForm.resetFields();
              typeForm.setFieldsValue({ status: 1 });
              setTypeModalOpen(true);
            }}
          >
            新建类型
          </AuthButton>
        }
        items={types.map((t) => ({
          key: String(t.id),
          label: (
            <span>
              {t.name}
              <AuthButton
                type="link"
                size="small"
                permission="dict:update"
                onClick={(e) => {
                  e.stopPropagation();
                  setEditingType(t);
                  typeForm.setFieldsValue(t);
                  setTypeModalOpen(true);
                }}
              >
                编辑
              </AuthButton>
            </span>
          ),
        }))}
      />

      <PageTable<DictDataItem>
        title="字典数据"
        loading={dataLoading}
        data={dataList}
        pagination={false}
        onCreate={() => {
          if (!activeTypeId) return toast.warning('请先选择字典类型');
          setEditingData(null);
          dataForm.resetFields();
          dataForm.setFieldsValue({ status: 1, sort: 0 });
          setDataModalOpen(true);
        }}
        createPermission="dict:create"
        columns={[
          { title: 'ID', dataIndex: 'id', width: 80 },
          { title: '标签', dataIndex: 'label' },
          { title: '值', dataIndex: 'value' },
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
                <AuthButton
                  type="link"
                  permission="dict:update"
                  onClick={() => {
                    setEditingData(record);
                    dataForm.setFieldsValue(record);
                    setDataModalOpen(true);
                  }}
                >
                  编辑
                </AuthButton>
                <AuthButton
                  type="link"
                  danger
                  permission="dict:delete"
                  onClick={async () => {
                    await deleteDictData(record.id);
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

      <Modal title={editingType ? '编辑字典类型' : '新建字典类型'} open={typeModalOpen} onOk={handleTypeSubmit} onCancel={() => setTypeModalOpen(false)}>
        <Form form={typeForm} layout="vertical">
          <Form.Item name="code" label="编码" rules={[{ required: true }]}>
            <Input disabled={!!editingType} />
          </Form.Item>
          <Form.Item name="name" label="名称" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item name="status" label="状态" rules={[{ required: true }]}>
            <Select options={statusOptions} />
          </Form.Item>
          {editingType && (
            <AuthButton
              danger
              permission="dict:delete"
              onClick={async () => {
                await deleteDictType(editingType.id);
                toast.success('类型已删除');
                setTypeModalOpen(false);
                setActiveTypeId(undefined);
                loadTypes();
              }}
            >
              删除此类型
            </AuthButton>
          )}
        </Form>
      </Modal>

      <Modal title={editingData ? '编辑字典数据' : '新建字典数据'} open={dataModalOpen} onOk={handleDataSubmit} onCancel={() => setDataModalOpen(false)}>
        <Form form={dataForm} layout="vertical">
          <Form.Item name="label" label="标签" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item name="value" label="值" rules={[{ required: true }]}>
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
    </div>
  );
}
