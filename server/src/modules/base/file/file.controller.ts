import {
  BadRequestException,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Query,
  Req,
  StreamableFile,
  UploadedFiles,
  UseInterceptors,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import { memoryStorage } from 'multer';
import type { Request } from 'express';
import { SkipWrap } from '../../../common/decorators/skip-wrap.decorator';
import { RequirePermissions } from '../../../common/decorators/require-permissions.decorator';
import { QueryFileDto } from './dto/query-file.dto';
import { FileService } from './file.service';

@ApiTags('文件管理')
@Controller('files')
export class FileController {
  constructor(private readonly fileService: FileService) {}

  @Post('upload')
  @RequirePermissions('file:upload')
  @ApiOperation({ summary: '上传文件（支持多文件）' })
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(
    FilesInterceptor('file', 20, {
      storage: memoryStorage(),
    }),
  )
  async upload(@UploadedFiles() files: Express.Multer.File[], @Req() req: Request) {
    const userId = (req.user as { userId: number }).userId;
    if (!files?.length) throw new BadRequestException('请选择文件');
    const results = await this.fileService.saveMany(files, userId);
    return results.length === 1 ? results[0] : results;
  }

  @Get()
  @RequirePermissions('file:list')
  @ApiOperation({ summary: '分页查询文件列表' })
  findAll(@Query() query: QueryFileDto) {
    return this.fileService.findAll(query);
  }

  @Get(':id/download')
  @SkipWrap()
  @RequirePermissions('file:download')
  @ApiOperation({ summary: '下载或预览文件' })
  async download(@Param('id', ParseIntPipe) id: number) {
    const { record, stream, disposition } = await this.fileService.getDownloadMeta(id);
    const encodedName = encodeURIComponent(record.originalName);
    return new StreamableFile(stream, {
      type: record.mimeType,
      disposition: `${disposition}; filename*=UTF-8''${encodedName}`,
    });
  }

  @Get(':id')
  @RequirePermissions('file:list')
  @ApiOperation({ summary: '查询文件详情' })
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.fileService.findOne(id);
  }

  @Delete(':id')
  @RequirePermissions('file:delete')
  @ApiOperation({ summary: '删除文件' })
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.fileService.remove(id);
  }
}
