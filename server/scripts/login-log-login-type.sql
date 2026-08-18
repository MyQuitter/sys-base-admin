ALTER TABLE sys_login_log
  ADD COLUMN login_type VARCHAR(20) NULL AFTER message;

UPDATE sys_login_log SET login_type = 'wallet' WHERE message = 'wallet' AND status = 1;
UPDATE sys_login_log SET login_type = 'password' WHERE login_type IS NULL;
