/** 分页查询入参 */
export interface PaginationQuery {
  page?: number;
  pageSize?: number;
}

/** 统一分页响应结构，与前端 `PageResult` 对齐 */
export interface PageResult<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

/**
 * 解析并规范化分页参数。
 * page 最小为 1；pageSize 限制在 1～100，默认 10。
 * @returns page、pageSize 及 TypeORM skip 偏移量
 */
export function getPagination(query: PaginationQuery) {
  const page = Math.max(1, Number(query.page) || 1);
  const pageSize = Math.min(100, Math.max(1, Number(query.pageSize) || 10));
  const skip = (page - 1) * pageSize;
  return { page, pageSize, skip };
}

/**
 * 组装标准分页结果对象。
 */
export function toPageResult<T>(items: T[], total: number, page: number, pageSize: number): PageResult<T> {
  return { items, total, page, pageSize };
}
