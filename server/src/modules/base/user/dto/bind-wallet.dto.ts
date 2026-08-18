import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength } from 'class-validator';

export class BindWalletDto {
  @ApiProperty({ description: 'EVM 钱包地址' })
  @IsString()
  @MaxLength(42)
  walletAddress: string;
}
