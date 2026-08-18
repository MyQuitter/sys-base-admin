-- 登录日志区分后台用户与会员用户
ALTER TABLE sys_login_log
  ADD COLUMN user_type VARCHAR(20) NOT NULL DEFAULT 'admin' AFTER login_type;

UPDATE sys_login_log SET user_type = 'admin' WHERE user_type IS NULL OR user_type = '';
