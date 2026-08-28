import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BlockchainModule } from '../blockchain/blockchain.module';
import { Chain } from '../blockchain/entities/chain.entity';
import { CrmWlController } from './controllers/crm-wl.controller';
import { CrmWlConfig } from './entities/crm-wl-config.entity';
import { CrmWlNode } from './entities/crm-wl-node.entity';
import { CrmWlTrader } from './entities/crm-wl-trader.entity';
import { CrmTeamMember } from './entities/crm-team-member.entity';
import { CrmWlConfigService } from './services/crm-wl-config.service';
import { CrmWlDashboardService } from './services/crm-wl-dashboard.service';
import { CrmTeamService } from './services/crm-team.service';
import { CrmWlQueryService } from './services/crm-wl-query.service';
import { CrmWlSyncService } from './services/crm-wl-sync.service';

/**
 * CrmToken 白名单扩展域：交易白名单 + 节点白名单。
 * 写链由前端 MetaMask 完成；本模块负责配置、事件索引与只读核对。
 */
@Module({
  imports: [
    BlockchainModule,
    TypeOrmModule.forFeature([CrmWlConfig, CrmWlTrader, CrmWlNode, CrmTeamMember, Chain]),
  ],
  controllers: [CrmWlController],
  providers: [CrmWlConfigService, CrmWlQueryService, CrmWlSyncService, CrmTeamService, CrmWlDashboardService],
})
export class CrmWhitelistModule {}
