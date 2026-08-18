import { Column, Entity } from 'typeorm';
import { BaseEntity } from '../../../entities/base.entity';

/** EVM 链配置 */
@Entity('bc_chain')
export class Chain extends BaseEntity {
  @Column({ name: 'chain_id', unique: true })
  chainId: number;

  @Column({ length: 50 })
  name: string;

  @Column({ name: 'native_symbol', length: 20, default: 'ETH' })
  nativeSymbol: string;

  @Column({ name: 'rpc_urls', type: 'json' })
  rpcUrls: string[];

  /** WebSocket RPC（可选，用于事件实时推送） */
  @Column({ name: 'wss_urls', type: 'json', nullable: true })
  wssUrls?: string[];

  @Column({ name: 'explorer_url', length: 500, nullable: true })
  explorerUrl?: string;

  /** 1 启用 0 禁用 */
  @Column({ default: 1 })
  status: number;

  /** 是否允许作为钱包登录链 */
  @Column({ name: 'login_enabled', default: 1 })
  loginEnabled: number;

  @Column({ default: 0 })
  sort: number;
}
