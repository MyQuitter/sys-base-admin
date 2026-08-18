import request from '@/utils/request';

export interface DepartmentTreeNode {
  id: number;
  name: string;
  code: string;
  parentId?: number;
  leader?: string;
  phone?: string;
  sort: number;
  status: number;
  children?: DepartmentTreeNode[];
}

export interface DepartmentItem extends Omit<DepartmentTreeNode, 'children'> {}

export interface CreateDepartmentParams {
  parentId?: number;
  name: string;
  code: string;
  leader?: string;
  phone?: string;
  sort?: number;
  status?: number;
}

/** 获取部门树 */
export function getDepartmentTree() {
  return request.get<never, DepartmentTreeNode[]>('/departments/tree');
}

/** 获取部门扁平列表 */
export function getDepartments() {
  return request.get<never, DepartmentItem[]>('/departments');
}

export function getDepartment(id: number) {
  return request.get<never, DepartmentItem>(`/departments/${id}`);
}

export function createDepartment(data: CreateDepartmentParams) {
  return request.post<never, DepartmentItem>('/departments', data);
}

export function updateDepartment(id: number, data: Partial<CreateDepartmentParams>) {
  return request.put<never, DepartmentItem>(`/departments/${id}`, data);
}

export function deleteDepartment(id: number) {
  return request.delete(`/departments/${id}`);
}
