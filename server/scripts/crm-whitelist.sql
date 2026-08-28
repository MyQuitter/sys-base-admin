-- CrmToken 白名单扩展表（生产环境）；开发环境 synchronize 可自动建表

CREATE TABLE IF NOT EXISTS `crm_wl_config` (
  `id` int NOT NULL AUTO_INCREMENT,
  `chain_id` int NOT NULL,
  `token_address` varchar(64) NOT NULL DEFAULT '',
  `business_address` varchar(64) NOT NULL DEFAULT '',
  `token_abi_key` varchar(32) NOT NULL DEFAULT 'modular',
  `trader_start_block` bigint NOT NULL DEFAULT 0,
  `node_start_block` bigint NOT NULL DEFAULT 0,
  `trader_synced_block` bigint NOT NULL DEFAULT 0,
  `node_synced_block` bigint NOT NULL DEFAULT 0,
  `created_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updated_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  `deleted_at` datetime(6) DEFAULT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `crm_wl_trader` (
  `id` int NOT NULL AUTO_INCREMENT,
  `address` varchar(64) NOT NULL,
  `allowed` tinyint NOT NULL DEFAULT 0,
  `block_number` bigint NOT NULL DEFAULT 0,
  `tx_hash` varchar(88) DEFAULT NULL,
  `log_index` int NOT NULL DEFAULT 0,
  `event_at` datetime DEFAULT NULL,
  `created_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updated_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  `deleted_at` datetime(6) DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `UQ_crm_wl_trader_address` (`address`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `crm_wl_node` (
  `id` int NOT NULL AUTO_INCREMENT,
  `address` varchar(64) NOT NULL,
  `level` tinyint NOT NULL DEFAULT 0,
  `block_number` bigint NOT NULL DEFAULT 0,
  `tx_hash` varchar(88) DEFAULT NULL,
  `log_index` int NOT NULL DEFAULT 0,
  `event_at` datetime DEFAULT NULL,
  `created_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updated_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  `deleted_at` datetime(6) DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `UQ_crm_wl_node_address` (`address`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
