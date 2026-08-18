import request from '@/utils/request';

export interface DictTypeItem {
  id: number;
  code: string;
  name: string;
  status: number;
}

export interface DictDataItem {
  id: number;
  typeId: number;
  label: string;
  value: string;
  sort: number;
  status: number;
}

export function getDictTypes() {
  return request.get<never, DictTypeItem[]>('/dict/types');
}

export function createDictType(data: { code: string; name: string; status?: number }) {
  return request.post<never, DictTypeItem>('/dict/types', data);
}

export function updateDictType(id: number, data: { name?: string; status?: number }) {
  return request.put<never, DictTypeItem>(`/dict/types/${id}`, data);
}

export function deleteDictType(id: number) {
  return request.delete(`/dict/types/${id}`);
}

export function getDictData(typeId?: number) {
  return request.get<never, DictDataItem[]>('/dict/data', { params: { typeId } });
}

export function createDictData(data: {
  typeId: number;
  label: string;
  value: string;
  sort?: number;
  status?: number;
}) {
  return request.post<never, DictDataItem>('/dict/data', data);
}

export function updateDictData(
  id: number,
  data: { label?: string; value?: string; sort?: number; status?: number },
) {
  return request.put<never, DictDataItem>(`/dict/data/${id}`, data);
}

export function deleteDictData(id: number) {
  return request.delete(`/dict/data/${id}`);
}
