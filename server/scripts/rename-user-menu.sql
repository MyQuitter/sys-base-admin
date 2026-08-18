-- 菜单显示名重命名：用户管理 → 系统用户
UPDATE `sys_menu` SET `name` = '系统用户' WHERE `path` = '/system/user' AND `deleted_at` IS NULL;
