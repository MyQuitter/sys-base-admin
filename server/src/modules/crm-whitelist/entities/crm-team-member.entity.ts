import { Column, Entity, Unique } from 'typeorm';
import { BaseEntity } from '../../../entities/base.entity';

/**
 * 链上团队用户索引：绑定（ReferralBound）与入金（ParticipationAdded）都会建用户；业绩为链上快照。
 * V2：quotaUsd / referralCrm 复用既有列名 power_usd / referral_bnb，避免本地库迁表。
 */
@Entity('crm_team_member')
@Unique(['address'])
export class CrmTeamMember extends BaseEntity {
  @Column({ type: 'varchar', length: 64 })
  address: string;

  @Column({ name: 'inviter_address', type: 'varchar', length: 64, nullable: true })
  inviterAddress?: string | null;

  /** 祖先链路（含 inviter，不含自己），例如 a/b/c */
  @Column({ name: 'ancestor_path', type: 'varchar', length: 1024, default: '' })
  ancestorPath: string;

  /** 当前节点往下到最深叶子的层数（含自己）。叶子=1，A=>B=>C 则 A=3、B=2、C=1 */
  @Column({ type: 'int', default: 1 })
  depth: number;

  @Column({ name: 'bind_block_number', type: 'bigint', default: 0 })
  bindBlockNumber: string;

  @Column({ name: 'bind_tx_hash', type: 'varchar', length: 88, nullable: true })
  bindTxHash?: string | null;

  @Column({ name: 'last_metric_block', type: 'bigint', default: 0 })
  lastMetricBlock: string;

  @Column({ name: 'direct_valid_users', type: 'decimal', precision: 36, scale: 0, default: 0 })
  directValidUsers: string;

  @Column({ name: 'own_usd', type: 'decimal', precision: 36, scale: 0, default: 0 })
  ownUsd: string;

  @Column({ name: 'direct_usd', type: 'decimal', precision: 36, scale: 0, default: 0 })
  directUsd: string;

  @Column({ name: 'team_usd', type: 'decimal', precision: 36, scale: 0, default: 0 })
  teamUsd: string;

  /** V2 leaderOverview.quota；列名沿用 power_usd */
  @Column({ name: 'power_usd', type: 'decimal', precision: 36, scale: 0, default: 0 })
  quotaUsd: string;

  @Column({ name: 'node_level', type: 'tinyint', default: 0 })
  nodeLevel: number;

  /** V2 leaderOverview.referralCrm；列名沿用 referral_bnb */
  @Column({ name: 'referral_bnb', type: 'decimal', precision: 36, scale: 0, default: 0 })
  referralCrm: string;
}
