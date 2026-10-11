#!/usr/bin/env bash
# ============================================================
# 部署 / 更新脚本
#
# 用法（在服务器上执行）：
#   cd ~/nefu-pa-web && ./deploy.sh
#
# 它会拉取 GitHub 上的最新代码并重建服务。
# 首次部署前请先创建 .env（见 .env.example）。
# ============================================================
set -euo pipefail

cd "$(dirname "$0")"

if [ ! -f .env ]; then
  echo "错误：缺少 .env 文件。请先按 .env.example 创建它。" >&2
  exit 1
fi

echo "=== 拉取最新代码 ==="
git pull --ff-only

echo "=== 构建并启动（db / web / caddy）==="
docker compose up -d --build db web caddy

echo "=== 等待健康检查 ==="
for i in $(seq 1 30); do
  unhealthy=$(docker compose ps --format json 2>/dev/null | grep -c 'unhealthy\|starting' || true)
  if [ "$unhealthy" = "0" ]; then break; fi
  sleep 2
done

docker compose ps

echo "=== 完成 ==="
