#!/usr/bin/env bash
# ============================================================
# 部署脚本
#
# ⚠️ 重要：本机内存仅 1.6G，**绝不能在本机构建镜像**。
#   曾两次因在服务器上构建 Next.js 导致整机内存耗尽、SSH 失联。
#
# 正确流程：
#   1. 在**开发机**上构建：  docker build -t nefu-pa-web-web:local ./web
#   2. 传到服务器：          docker save ... | gzip | ssh 服务器 'gunzip | docker load'
#   3. 在服务器上执行本脚本：./deploy.sh（只启动，不构建）
#
# 另：改动 NapCat 配置会导致它重新扫码登录，非必要时不要重启 napcat 容器。
# ============================================================
set -euo pipefail

cd "$(dirname "$0")"

if [ ! -f .env ]; then
  echo "错误：缺少 .env，请先按 .env.example 创建。" >&2
  exit 1
fi

# 安全检查：镜像是否已就位（不存在则明确报错，而不是傻傻地开始构建）
if ! docker image inspect nefu-pa-web-web:local >/dev/null 2>&1; then
  echo "错误：镜像 nefu-pa-web-web:local 不存在。" >&2
  echo "请先在开发机构建并传输：deploy 说明见本脚本顶部注释。" >&2
  exit 1
fi

echo "=== 启动服务（不构建）==="
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
