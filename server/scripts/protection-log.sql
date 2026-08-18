CREATE TABLE IF NOT EXISTS sys_protection_log (
  id INT NOT NULL AUTO_INCREMENT,
  category VARCHAR(20) NOT NULL,
  event_type VARCHAR(50) NOT NULL,
  error_code VARCHAR(50) NOT NULL,
  username VARCHAR(50) NULL,
  user_id INT NULL,
  wallet_address VARCHAR(42) NULL,
  ip VARCHAR(50) NULL,
  path VARCHAR(200) NULL,
  message VARCHAR(500) NOT NULL,
  severity VARCHAR(10) NOT NULL,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (id),
  INDEX idx_protection_log_created_at (created_at),
  INDEX idx_protection_log_error_code (error_code),
  INDEX idx_protection_log_category (category),
  INDEX idx_protection_log_severity (severity)
);
