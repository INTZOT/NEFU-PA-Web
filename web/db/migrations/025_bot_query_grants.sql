-- 025: 让机器人能查询「约球 / 活动」（群内查询命令，D-46）。
--
-- 机器人新增群内命令「查询约球」「查询活动」，需要读这四张表。
-- 只需 SELECT —— 它**只展示，不修改**任何约球/活动数据。
-- （沿用最小授权：按实际会执行的操作授予。）

GRANT SELECT ON match_rooms TO nefu_bot;
GRANT SELECT ON room_applications TO nefu_bot;
GRANT SELECT ON events TO nefu_bot;
GRANT SELECT ON event_registrations TO nefu_bot;
