import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ChainController } from './controllers/chain.controller';
import { ContractController } from './controllers/contract.controller';
import { EventLogController } from './controllers/event-log.controller';
import { EventSubscriptionController } from './controllers/event-subscription.controller';
import { TransactionController } from './controllers/transaction.controller';
import { Chain } from './entities/chain.entity';
import { Contract } from './entities/contract.entity';
import { EventLog } from './entities/event-log.entity';
import { EventSubscription } from './entities/event-subscription.entity';
import { TransactionRecord } from './entities/transaction.entity';
import { BlockchainRpcService } from './services/blockchain-rpc.service';
import { ChainService } from './services/chain.service';
import { ContractService } from './services/contract.service';
import { ContractTxSyncService } from './services/contract-tx-sync.service';
import { EventSubscriptionService } from './services/event-subscription.service';
import { EventSyncService } from './services/event-sync.service';
import { TransactionService } from './services/transaction.service';

@Module({
  imports: [TypeOrmModule.forFeature([Chain, Contract, TransactionRecord, EventSubscription, EventLog])],
  controllers: [
    ChainController,
    ContractController,
    TransactionController,
    EventSubscriptionController,
    EventLogController,
  ],
  providers: [
    ChainService,
    ContractService,
    ContractTxSyncService,
    TransactionService,
    EventSyncService,
    EventSubscriptionService,
    BlockchainRpcService,
  ],
  exports: [ChainService, TransactionService],
})
export class BlockchainModule {}
