// 容器健康检查：请求本服务的 /healthz，按结果决定退出码。
// 用它替代镜像内的 curl，避免在构建时安装额外软件包。
import { get } from 'node:http';

const port = Number(process.env.PORT || 3000);

const req = get(
  { host: '127.0.0.1', port, path: '/healthz', timeout: 3000 },
  (res) => {
    res.resume();
    process.exit(res.statusCode === 200 ? 0 : 1);
  },
);

req.on('timeout', () => { req.destroy(); process.exit(1); });
req.on('error', () => process.exit(1));
