-- P2-1 通知公告投递 + 个人消息
-- 开发环境也可依赖 TypeORM synchronize；E2E / 已有库请手动执行本脚本

ALTER TABLE `sys_notice`
  ADD COLUMN `notice_type` varchar(20) NOT NULL DEFAULT 'announcement' AFTER `status`,
  ADD COLUMN `target_type` varchar(20) NOT NULL DEFAULT 'all' AFTER `notice_type`,
  ADD COLUMN `target_ids` json NULL AFTER `target_type`,
  ADD COLUMN `priority` varchar(20) NOT NULL DEFAULT 'normal' AFTER `target_ids`,
  ADD COLUMN `publisher_id` int NULL AFTER `priority`;

CREATE TABLE IF NOT EXISTS `sys_user_message` (
  `id` int NOT NULL AUTO_INCREMENT,
  `user_id` int NOT NULL,
  `notice_id` int NULL,
  `title` varchar(100) NOT NULL,
  `content` text NOT NULL,
  `message_type` varchar(20) NOT NULL DEFAULT 'notice',
  `is_read` tinyint NOT NULL DEFAULT 0,
  `read_at` datetime NULL,
  `is_popup` tinyint NOT NULL DEFAULT 0,
  `priority` varchar(20) NOT NULL DEFAULT 'normal',
  `created_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updated_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  `deleted_at` datetime(6) NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `IDX_notice_user` (`notice_id`, `user_id`),
  KEY `IDX_user_read` (`user_id`, `is_read`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
