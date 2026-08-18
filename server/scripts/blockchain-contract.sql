CREATE TABLE IF NOT EXISTS bc_contract (
  id INT NOT NULL AUTO_INCREMENT,
  chain_id INT NOT NULL,
  address VARCHAR(42) NOT NULL,
  name VARCHAR(100) NOT NULL,
  contract_type VARCHAR(20) NOT NULL DEFAULT 'generic',
  abi TEXT NULL,
  status TINYINT NOT NULL DEFAULT 1,
  remark VARCHAR(500) NULL,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  deleted_at DATETIME(6) NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uk_bc_contract_chain_address (chain_id, address),
  KEY idx_bc_contract_chain_id (chain_id)
);
