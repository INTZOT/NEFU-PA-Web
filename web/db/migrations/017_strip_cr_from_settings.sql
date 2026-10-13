-- 清理 site_settings 里的 CR（\r）字符。
--
-- 来源：浏览器的 <textarea> 提交多行文本时使用 CRLF，
-- 而保存逻辑此前没有规范化，于是 \r 被原样存进了数据库。
--
-- 影响：显示上通常看不出问题，但它会占字节数，
-- 也可能与某些聊天客户端的渲染冲突。CR 在这里没有任何用处。
--
-- 保存逻辑已在代码侧修正（modules/setting/save.ts），
-- 这里只处理**已经存进去的**数据。

UPDATE site_settings
   SET value = replace(value, chr(13), '')
 WHERE position(chr(13) in value) > 0;
