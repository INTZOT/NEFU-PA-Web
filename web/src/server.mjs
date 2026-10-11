// 阶段 1 占位服务：仅用于验证容器编排与反向代理链路。
// 阶段 2 会替换为 Next.js 应用骨架（见 docs/p3-blueprint.md）。
import { createServer } from 'node:http';

const PORT = Number(process.env.PORT || 3000);

const server = createServer((req, res) => {
  if (req.url === '/healthz') {
    res.writeHead(200, { 'content-type': 'text/plain; charset=utf-8' });
    res.end('ok');
    return;
  }

  res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
  res.end([
    '<!doctype html><html lang="zh-CN"><meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width,initial-scale=1">',
    '<title>东北林业大学匹克球社团</title>',
    '<body style="font-family:system-ui;padding:2rem;line-height:1.7">',
    '<h1>地基已就绪</h1>',
    '<p>这是阶段 1 的占位页面。数据库、反向代理与容器编排已打通。</p>',
    '<p>下一步：阶段 2「账号体系」。</p>',
    '</body></html>',
  ].join(''));
});

server.listen(PORT, () => {
  console.log(`[web] listening on ${PORT}`);
});
