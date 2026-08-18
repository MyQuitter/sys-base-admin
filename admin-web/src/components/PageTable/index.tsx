import { PlusOutlined, SearchOutlined } from '@ant-design/icons';
import { Button, Input, Space, Table, Typography } from 'antd';
import type { ColumnsType, TablePaginationConfig } from 'antd/es/table';
import type { ReactNode } from 'react';
import { useState } from 'react';
import { AuthButton } from '@/components/AuthButton';

interface PageTableProps<T extends { id: number }> {
  /** 页面标题，显示在表格上方 */
  title: string;
  loading: boolean;
  data: T[];
  columns: ColumnsType<T>;
  total?: number;
  page?: number;
  pageSize?: number;
  /** 传 false 关闭分页（如角色/权限全量列表） */
  pagination?: boolean;
  onPageChange?: (page: number, pageSize: number) => void;
  searchPlaceholder?: string;
  /** 点击搜索时回调，由页面自行请求接口 */
  onSearch?: (keyword: string) => void;
  onCreate?: () => void;
  /** 新建按钮所需权限码，有值时使用 AuthButton */
  createPermission?: string;
  /** 顶栏右侧额外操作（如导出） */
  toolbarExtra?: ReactNode;
}

/**
 * 管理列表页通用骨架：标题 + 可选搜索 + 可选权限新建 + Table。
 * 各系统管理页复用，减少重复的顶栏布局代码。
 */
export function PageTable<T extends { id: number }>({
  title,
  loading,
  data,
  columns,
  total,
  page,
  pageSize,
  pagination = true,
  onPageChange,
  searchPlaceholder,
  onSearch,
  onCreate,
  createPermission,
  toolbarExtra,
}: PageTableProps<T>) {
  const [keyword, setKeyword] = useState('');
  const tablePagination: false | TablePaginationConfig =
    pagination === false
      ? false
      : {
          current: page,
          pageSize,
          total,
          showSizeChanger: true,
          onChange: onPageChange,
        };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
        <Typography.Title level={4} style={{ margin: 0 }}>
          {title}
        </Typography.Title>
        <Space>
          {onSearch && (
            <Input.Search
              placeholder={searchPlaceholder}
              allowClear
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              onSearch={() => onSearch(keyword)}
              enterButton={<SearchOutlined />}
              style={{ width: 240 }}
            />
          )}
          {toolbarExtra}
          {onCreate &&
            (createPermission ? (
              <AuthButton type="primary" icon={<PlusOutlined />} permission={createPermission} onClick={onCreate}>
                新建
              </AuthButton>
            ) : (
              <Button type="primary" icon={<PlusOutlined />} onClick={onCreate}>
                新建
              </Button>
            ))}
        </Space>
      </div>
      <Table
        rowKey="id"
        loading={loading}
        dataSource={data}
        columns={columns}
        pagination={tablePagination}
        locale={{ emptyText: loading ? '加载中...' : '暂无数据' }}
      />
    </div>
  );
}
