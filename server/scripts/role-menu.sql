-- 角色菜单分配：勾选后侧栏只展示这些菜单
ALTER TABLE `sys_role`
  ADD COLUMN `menu_restricted` tinyint(1) NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS `sys_role_menu` (
  `role_id` int NOT NULL,
  `menu_id` int NOT NULL,
  PRIMARY KEY (`role_id`, `menu_id`),
  KEY `idx_role_menu_menu` (`menu_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
