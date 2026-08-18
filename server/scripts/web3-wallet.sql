ALTER TABLE sys_user
  ADD COLUMN wallet_address VARCHAR(42) NULL AFTER department_id,
  ADD COLUMN wallet_bound_at DATETIME NULL AFTER wallet_address,
  ADD COLUMN wallet_bound_by INT NULL AFTER wallet_bound_at;

CREATE UNIQUE INDEX uk_sys_user_wallet_address ON sys_user (wallet_address);
