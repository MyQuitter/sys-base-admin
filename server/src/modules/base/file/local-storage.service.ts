import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createReadStream, existsSync, mkdirSync, unlinkSync, writeFileSync } from 'fs';
import { extname, join } from 'path';
import { randomUUID } from 'crypto';

/**
 * 本地磁盘存储：按日期分目录，文件名 UUID + 原扩展名。
 */
@Injectable()
export class LocalStorageService {
  private readonly uploadDest: string;

  constructor(private readonly configService: ConfigService) {
    this.uploadDest = this.configService.get<string>('upload.dest') ?? 'uploads';
  }

  /** 项目根目录下的 uploads 绝对路径 */
  getRootDir() {
    return join(process.cwd(), this.uploadDest);
  }

  getAbsolutePath(storedPath: string) {
    return join(this.getRootDir(), storedPath);
  }

  createReadStream(storedPath: string) {
    return createReadStream(this.getAbsolutePath(storedPath));
  }

  save(buffer: Buffer, originalName: string) {
    const now = new Date();
    const year = String(now.getFullYear());
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const ext = extname(originalName).toLowerCase();
    const storedName = `${randomUUID()}${ext}`;
    const relativeDir = join(year, month, day);
    const absoluteDir = join(this.getRootDir(), relativeDir);

    if (!existsSync(absoluteDir)) {
      mkdirSync(absoluteDir, { recursive: true });
    }

    const storedPath = join(relativeDir, storedName).replace(/\\/g, '/');
    writeFileSync(this.getAbsolutePath(storedPath), buffer);
    return { storedName, storedPath };
  }

  delete(storedPath: string) {
    const absolute = this.getAbsolutePath(storedPath);
    if (!existsSync(absolute)) return;
    try {
      unlinkSync(absolute);
    } catch {
      // 磁盘文件缺失不阻断软删除流程
    }
  }
}
