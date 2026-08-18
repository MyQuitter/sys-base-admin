import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { BusinessException } from '../../../common/exceptions/business.exception';
import { getPagination, toPageResult } from '../../../common/utils/pagination';
import { QueryFileDto } from './dto/query-file.dto';
import { FileRecord } from './entities/file.entity';
import { LocalStorageService } from './local-storage.service';

export interface FileVo {
  id: number;
  originalName: string;
  mimeType: string;
  size: number;
  url: string;
  uploadedBy: number;
  uploaderName?: string;
  createdAt: Date;
}

/**
 * 文件元数据与本地存储协调服务。
 */
@Injectable()
export class FileService {
  private readonly maxSize: number;
  private readonly allowedMime: Set<string>;

  constructor(
    @InjectRepository(FileRecord)
    private readonly fileRepository: Repository<FileRecord>,
    private readonly storage: LocalStorageService,
    private readonly configService: ConfigService,
  ) {
    this.maxSize = this.configService.get<number>('upload.maxSize') ?? 10 * 1024 * 1024;
    const mimeList = this.configService.get<string[]>('upload.allowedMime') ?? [];
    this.allowedMime = new Set(mimeList);
  }

  private toVo(record: FileRecord): FileVo {
    return {
      id: record.id,
      originalName: record.originalName,
      mimeType: record.mimeType,
      size: Number(record.size),
      url: `/api/files/${record.id}/download`,
      uploadedBy: record.uploadedBy,
      uploaderName: record.uploader?.nickname ?? record.uploader?.username,
      createdAt: record.createdAt,
    };
  }

  private validateFile(file: Express.Multer.File) {
    if (!file) throw new BadRequestException('请选择文件');
    if (file.size > this.maxSize) {
      throw new BusinessException('文件大小超过限制', 'FILE_TOO_LARGE');
    }
    if (this.allowedMime.size > 0 && !this.allowedMime.has(file.mimetype)) {
      throw new BusinessException('不支持的文件类型', 'FILE_TYPE_NOT_ALLOWED');
    }
  }

  async saveMany(files: Express.Multer.File[], userId: number): Promise<FileVo[]> {
    if (!files?.length) throw new BadRequestException('请选择文件');
    const results: FileVo[] = [];
    for (const file of files) {
      results.push(await this.saveOne(file, userId));
    }
    return results;
  }

  async saveOne(file: Express.Multer.File, userId: number): Promise<FileVo> {
    this.validateFile(file);
    const { storedName, storedPath } = this.storage.save(file.buffer, file.originalname);
    const record = this.fileRepository.create({
      originalName: file.originalname,
      storedName,
      storedPath,
      mimeType: file.mimetype,
      size: file.size,
      uploadedBy: userId,
    });
    const saved = await this.fileRepository.save(record);
    return this.findOne(saved.id);
  }

  async findAll(query: QueryFileDto) {
    const { page, pageSize, skip } = getPagination(query);
    const qb = this.fileRepository
      .createQueryBuilder('file')
      .leftJoinAndSelect('file.uploader', 'uploader')
      .orderBy('file.id', 'DESC')
      .skip(skip)
      .take(pageSize);

    if (query.filename) {
      qb.andWhere('file.originalName LIKE :filename', { filename: `%${query.filename}%` });
    }
    if (query.mimeType) {
      qb.andWhere('file.mimeType = :mimeType', { mimeType: query.mimeType });
    }
    if (query.userId) {
      qb.andWhere('file.uploadedBy = :userId', { userId: query.userId });
    }
    if (query.startTime && query.endTime) {
      qb.andWhere('file.createdAt BETWEEN :startTime AND :endTime', {
        startTime: new Date(query.startTime),
        endTime: new Date(query.endTime),
      });
    } else if (query.startTime) {
      qb.andWhere('file.createdAt >= :startTime', { startTime: new Date(query.startTime) });
    } else if (query.endTime) {
      qb.andWhere('file.createdAt <= :endTime', { endTime: new Date(query.endTime) });
    }

    const [items, total] = await qb.getManyAndCount();
    return toPageResult(items.map((item) => this.toVo(item)), total, page, pageSize);
  }

  async findOne(id: number): Promise<FileVo> {
    const record = await this.fileRepository.findOne({
      where: { id },
      relations: { uploader: true },
    });
    if (!record) throw new NotFoundException({ message: '文件不存在', errorCode: 'FILE_NOT_FOUND' });
    return this.toVo(record);
  }

  async getDownloadMeta(id: number) {
    const record = await this.fileRepository.findOne({ where: { id } });
    if (!record) throw new NotFoundException({ message: '文件不存在', errorCode: 'FILE_NOT_FOUND' });
    const stream = this.storage.createReadStream(record.storedPath);
    const isImage = record.mimeType.startsWith('image/');
    const disposition = isImage ? 'inline' : 'attachment';
    return { record, stream, disposition };
  }

  async remove(id: number) {
    const record = await this.fileRepository.findOne({ where: { id } });
    if (!record) throw new NotFoundException({ message: '文件不存在', errorCode: 'FILE_NOT_FOUND' });
    await this.fileRepository.softRemove(record);
    this.storage.delete(record.storedPath);
    return { success: true };
  }
}
