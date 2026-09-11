-- ------------------------------------------------------------
-- v5.1.3 增量补丁：给 profiles 加「自定义头像」列
-- ------------------------------------------------------------
-- 适用对象：在 v5.1.3 之前已经跑过 schema.sql 的库。
-- 新库直接跑 schema.sql 即可（已包含 avatar 列），不需要执行本文件。
--
-- 说明：
--   · 存的是客户端压缩后的 JPEG dataURL（128px、白底、质量 0.72），约 5~10 KB；
--     为空字符串表示「用 emoji 头像」，所以不能用 null 语义。
--   · 客户端对「列不存在」有降级：上报报 42703 时会自动置 cloud.hasAvatar=false
--     并去掉该列重试，所以不跑这个补丁 App 也不会崩——只是队友看不到你的图片头像。
--
-- 用法：CloudBase 控制台 → 数据库 → SQL 编辑器 → 粘贴执行（可重复执行）。
-- ------------------------------------------------------------

alter table public.profiles add column if not exists avatar text not null default '';

-- 老行补默认值（add column ... default 在 PG 11+ 已经回填，这里只是双保险）
update public.profiles set avatar = '' where avatar is null;

-- 自检：应看到 avatar 列，类型为 text
-- select column_name, data_type, column_default
--   from information_schema.columns
--  where table_schema='public' and table_name='profiles'
--  order by ordinal_position;
