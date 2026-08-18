CREATE TABLE IF NOT EXISTS bc_event_subscription (
  id INT NOT NULL AUTO_INCREMENT,
  contract_id INT NOT NULL,
  chain_id INT NOT NULL,
  event_name VARCHAR(100) NOT NULL,
  status TINYINT NOT NULL DEFAULT 1,
  from_block BIGINT NULL,
  last_scanned_block BIGINT NULL,
  remark VARCHAR(500) NULL,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  deleted_at DATETIME(6) NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uk_bc_event_sub_contract_event (contract_id, event_name),
  KEY idx_bc_event_sub_chain_id (chain_id),
  KEY idx_bc_event_sub_status (status)
);
