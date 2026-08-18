import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Like, Repository } from 'typeorm';
import { maskWallet } from '../../../common/utils/wallet';
import { getPagination, toPageResult } from '../../../common/utils/pagination';
import { QueryLoginLogDto } from './dto/query-login-log.dto';
import { QueryOperationLogDto } from './dto/query-operation-log.dto';
import { QueryProtectionLogDto } from './dto/query-protection-log.dto';
import { LoginLog } from './entities/login-log.entity';
import { OperationLog } from './entities/operation-log.entity';
import { ProtectionLog } from './entities/protection-log.entity';

export interface RecordOperationParams {
  userId?: number;
  username?: string;
  module: string;
  action: string;
  method: string;
  url: string;
  ip?: string;
  status: number;
  durationMs: number;
}

export type LoginType = 'password' | 'wallet' | 'both';
export type LoginUserType = 'admin' | 'member';

export interface RecordLoginParams {
  username: string;
  userId?: number;
  ip?: string;
  status: number;
  message?: string;
  loginType?: LoginType;
  userType?: LoginUserType;
}

export type ProtectionCategory = 'auth' | 'wallet';
export type ProtectionSeverity = 'info' | 'warn' | 'high';

export interface ProtectionLogContext {
  ip?: string;
  path?: string;
  username?: string;
  userId?: number;
  walletAddress?: string;
}

export interface RecordProtectionParams {
  category: ProtectionCategory;
  eventType: string;
  errorCode: string;
  username?: string;
  userId?: number;
  walletAddress?: string;
  ip?: string;
  path?: string;
  message: string;
  severity: ProtectionSeverity;
}

/** CSV 字段转义，防止逗号/引号破坏格式 */
function csvCell(value: unknown): string {
  const text = value == null ? '' : String(value);
  if (/[",\n]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

/**
 * 日志业务服务：操作日志、登录日志与防护日志的写入、查询与 CSV 导出。
 */
@Injectable()
export class LogService {
  constructor(
    @InjectRepository(OperationLog)
    private readonly operationLogRepository: Repository<OperationLog>,
    @InjectRepository(LoginLog)
    private readonly loginLogRepository: Repository<LoginLog>,
    @InjectRepository(ProtectionLog)
    private readonly protectionLogRepository: Repository<ProtectionLog>,
  ) {}

  /** 异步写入操作日志，不阻塞主请求 */
  recordOperation(params: RecordOperationParams) {
    const log = this.operationLogRepository.create(params);
    void this.operationLogRepository.save(log).catch(() => undefined);
  }

  /** 记录登录成功或失败 */
  recordLogin(params: RecordLoginParams) {
    const log = this.loginLogRepository.create({
      ...params,
      userType: params.userType ?? 'admin',
    });
    void this.loginLogRepository.save(log).catch(() => undefined);
  }

  /** 异步写入防护日志，不阻塞主请求 */
  recordProtection(params: RecordProtectionParams) {
    const log = this.protectionLogRepository.create({
      ...params,
      walletAddress: maskWallet(params.walletAddress),
    });
    void this.protectionLogRepository.save(log).catch(() => undefined);
  }

  async findOperationLogs(query: QueryOperationLogDto) {
    const { page, pageSize, skip } = getPagination(query);
    const where: Record<string, unknown> = {};
    if (query.username) where.username = Like(`%${query.username}%`);
    if (query.module) where.module = Like(`%${query.module}%`);

    const [items, total] = await this.operationLogRepository.findAndCount({
      where,
      skip,
      take: pageSize,
      order: { id: 'DESC' },
    });

    return toPageResult(
      items.map((l) => ({
        id: l.id,
        userId: l.userId,
        username: l.username,
        module: l.module,
        action: l.action,
        method: l.method,
        url: l.url,
        ip: l.ip,
        status: l.status,
        durationMs: l.durationMs,
        createdAt: l.createdAt,
      })),
      total,
      page,
      pageSize,
    );
  }

  async findLoginLogs(query: QueryLoginLogDto) {
    const { page, pageSize, skip } = getPagination(query);
    const where: Record<string, unknown> = {};
    if (query.username) where.username = Like(`%${query.username}%`);
    if (query.status !== undefined) where.status = query.status;
    if (query.userType) where.userType = query.userType;

    const [items, total] = await this.loginLogRepository.findAndCount({
      where,
      skip,
      take: pageSize,
      order: { id: 'DESC' },
    });

    return toPageResult(items, total, page, pageSize);
  }

  async findProtectionLogs(query: QueryProtectionLogDto) {
    const { page, pageSize, skip } = getPagination(query);
    const where: Record<string, unknown> = {};
    if (query.username) where.username = Like(`%${query.username}%`);
    if (query.category) where.category = query.category;
    if (query.errorCode) where.errorCode = query.errorCode;
    if (query.severity) where.severity = query.severity;

    const [items, total] = await this.protectionLogRepository.findAndCount({
      where,
      skip,
      take: pageSize,
      order: { id: 'DESC' },
    });

    return toPageResult(items, total, page, pageSize);
  }

  /** 导出操作日志为 CSV 文本（含 UTF-8 BOM） */
  async exportOperationLogs(query: QueryOperationLogDto) {
    const result = await this.findOperationLogs({ ...query, page: 1, pageSize: 1000 });
    const header = 'ID,用户名,模块,操作,方法,URL,IP,状态,耗时(ms),时间\n';
    const rows = result.items
      .map(
        (l) =>
          [
            l.id,
            csvCell(l.username),
            csvCell(l.module),
            csvCell(l.action),
            l.method,
            csvCell(l.url),
            csvCell(l.ip),
            l.status,
            l.durationMs,
            csvCell(l.createdAt),
          ].join(','),
      )
      .join('\n');
    return `\uFEFF${header}${rows}`;
  }

  /** 导出登录日志为 CSV 文本 */
  async exportLoginLogs(query: QueryLoginLogDto) {
    const result = await this.findLoginLogs({ ...query, page: 1, pageSize: 1000 });
    const header = 'ID,用户类型,用户名,用户ID,IP,状态,登录方式,消息,时间\n';
    const userTypeLabel: Record<string, string> = { admin: '后台用户', member: '会员用户' };
    const rows = result.items
      .map(
        (l) =>
          [
            l.id,
            csvCell(userTypeLabel[l.userType ?? 'admin'] ?? l.userType),
            csvCell(l.username),
            csvCell(l.userId),
            csvCell(l.ip),
            l.status === 1 ? '成功' : '失败',
            csvCell(l.loginType ?? 'password'),
            csvCell(l.message),
            csvCell(l.createdAt),
          ].join(','),
      )
      .join('\n');
    return `\uFEFF${header}${rows}`;
  }

  /** 导出防护日志为 CSV 文本 */
  async exportProtectionLogs(query: QueryProtectionLogDto) {
    const result = await this.findProtectionLogs({ ...query, page: 1, pageSize: 1000 });
    const header = 'ID,类别,事件,错误码,用户名,用户ID,钱包,IP,路径,严重级别,消息,时间\n';
    const rows = result.items
      .map(
        (l) =>
          [
            l.id,
            csvCell(l.category),
            csvCell(l.eventType),
            csvCell(l.errorCode),
            csvCell(l.username),
            csvCell(l.userId),
            csvCell(l.walletAddress),
            csvCell(l.ip),
            csvCell(l.path),
            csvCell(l.severity),
            csvCell(l.message),
            csvCell(l.createdAt),
          ].join(','),
      )
      .join('\n');
    return `\uFEFF${header}${rows}`;
  }
}
