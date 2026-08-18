import { ApiProperty } from '@nestjs/swagger';
import { IsInt, IsString } from 'class-validator';

export class WalletLoginDto {
  @ApiProperty()
  @IsString()
  address: string;

  @ApiProperty()
  @IsString()
  signature: string;

  @ApiProperty()
  @IsInt()
  chainId: number;
}
