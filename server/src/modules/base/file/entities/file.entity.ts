import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';
import { BaseEntity } from '../../../../entities/base.entity';
import { User } from '../../user/entities/user.entity';

@Entity('sys_file')
export class FileRecord extends BaseEntity {
  @Column({ name: 'original_name', length: 255 })
  originalName: string;

  @Column({ name: 'stored_name', length: 100 })
  storedName: string;

  @Column({ name: 'stored_path', length: 500 })
  storedPath: string;

  @Column({ name: 'mime_type', length: 100 })
  mimeType: string;

  @Column({ type: 'bigint' })
  size: number;

  @Column({ name: 'uploaded_by' })
  uploadedBy: number;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'uploaded_by' })
  uploader?: User;
}
