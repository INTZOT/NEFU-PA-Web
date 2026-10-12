#!/usr/bin/env bash
# 为本机 Docker 配置镜像源并拉取 NapCat
# 用法：sudo bash /tmp/local-fetch-napcat.sh
set -euo pipefail

echo "=== 1/4 配置镜像源 ==="
if [ -f /etc/docker/daemon.json ]; then
  cp /etc/docker/daemon.json "/etc/docker/daemon.json.bak.$(date +%s)"
  echo "已备份原配置"
else
  mkdir -p /etc/docker
fi

cat > /etc/docker/daemon.json <<'JSON'
{
  "registry-mirrors": [
    "https://docker.m.daocloud.io",
    "https://docker.1ms.run",
    "https://docker.xuanyuan.me",
    "https://registry.cn-hangzhou.aliyuncs.com"
  ]
}
JSON

systemctl restart docker
sleep 5
docker info 2>/dev/null | grep -A5 "Registry Mirrors"

echo "=== 2/4 拉取 NapCat（约 1.1GB，需要几分钟）==="
# 反复重试：镜像站的 502 是间歇性的
OK=0
for i in 1 2 3 4 5 6 7 8; do
  echo "--- 第 $i 次尝试 ---"
  if docker pull mlikiowa/napcat-docker:latest; then OK=1; break; fi
  sleep 20
done

if [ "$OK" != "1" ]; then
  echo "!! 多次尝试仍失败。请把上面的错误信息发给会话。"
  exit 1
fi

echo "=== 3/4 导出为压缩包 ==="
docker save mlikiowa/napcat-docker:latest | gzip > /tmp/napcat-docker.tar.gz
ls -lh /tmp/napcat-docker.tar.gz

echo "=== 4/4 完成 ==="
echo "镜像已导出到 /tmp/napcat-docker.tar.gz，接下来由会话负责传到服务器。"
