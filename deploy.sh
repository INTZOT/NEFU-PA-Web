#!/usr/bin/env bash
# ============================================================
# 部署 / 更新脚本（在服务器上执行）
#
#   cd ~/nefu-pa-web && ./deploy.sh
#
# ⚠️ 为什么构建要单独一步、并限制内存：
#   本机内存仅 1.6G，且同时运行其他项目。Next.js 构建（Turbopack）
#   实测会吃满内存，曾导致整机失去响应、SSH 无法登录。
#   因此这里：① 限制 Node 堆大小；② 构建期间暂停其他项目；③ 构建完成后恢复。
# ============================================================
set -euo pipefail

cd "$(dirname "$0")"

if [ ! -f .env ]; then
  echo "错误：缺少 .env，请先按 .env.example 创建。" >&2
  exit 1
fi

# 构建期间需要让出内存的容器（按需修改；不存在则自动忽略）
PAUSE_CONTAINERS="${PAUSE_CONTAINERS:-rhex-worker-1 rhex-postgres-1 rhex-redis-1}"

echo "=== 1/4 暂停其他项目以腾出内存 ==="
for c in $PAUSE_CONTAINERS; do
  if docker ps --format "{{.Names}}" | grep -qx "$c"; then
    docker stop "$c" >/dev/null && echo "  已暂停 $c"
  fi
done

restore() {
  echo "=== 4/4 恢复其他项目 ==="
  for c in $PAUSE_CONTAINERS; do
    if docker ps -a --format "{{.Names}}" | grep -qx "$c"; then
      docker start "$c" >/dev/null 2>&1 && echo "  已恢复 $c" || true
    fi
  done
}
trap restore EXIT

echo "=== 2/4 构建镜像（Node 堆上限由 web/Dockerfile 设定）==="
docker build -t nefu-pa-web-web:local ./web

echo "=== 3/4 启动服务（不重建）==="
docker compose up -d db web caddy

echo "=== 等待健康检查 ==="
for i in $(seq 1 45); do
  status=$(docker ps --filter name=nefu-pa-web-web-1 --format "{{.Status}}")
  case "$status" in
    *healthy*) echo "  web 已健康（第 $i 次探测）"; break ;;
  esac
  sleep 2
done

docker compose ps --format 'table {{.Name}}\t{{.Status}}'
