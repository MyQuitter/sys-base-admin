export interface UserInfo {
  id: number;
  username: string;
  nickname?: string;
  permissions: string[];
}

export interface LoginResult {
  accessToken: string;
  userInfo: UserInfo;
}

export interface ApiResponse<T = unknown> {
  code: number;
  message: string;
  data: T;
  timestamp: number;
}

export interface PageResult<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}
