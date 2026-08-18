CREATE TABLE IF NOT EXISTS bc_event_log (
  id INT NOT NULL AUTO_INCREMENT,
  subscription_id INT NOT NULL,
  contract_id INT NOT NULL,
  chain_id INT NOT NULL,
  event_name VARCHAR(100) NOT NULL,
  tx_hash VARCHAR(66) NOT NULL,
  block_number BIGINT NOT NULL,
  log_index INT NOT NULL,
  args JSON NULL,
  raw_topics JSON NULL,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  deleted_at DATETIME(6) NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uk_bc_event_log_chain_tx_log (chain_id, tx_hash, log_index),
  KEY idx_bc_event_log_subscription_id (subscription_id),
  KEY idx_bc_event_log_contract_id (contract_id)
);
