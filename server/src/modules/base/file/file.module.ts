import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { FileRecord } from './entities/file.entity';
import { FileController } from './file.controller';
import { FileService } from './file.service';
import { LocalStorageService } from './local-storage.service';

@Module({
  imports: [TypeOrmModule.forFeature([FileRecord])],
  controllers: [FileController],
  providers: [FileService, LocalStorageService],
  exports: [FileService],
})
export class FileModule {}
