# 基于官方 postgres 镜像，仅追加表结构初始化脚本
# 使用 18-alpine：与部署服务器上已有的 postgres 主版本一致
FROM postgres:18-alpine

# 官方镜像会在首次建库时执行 /docker-entrypoint-initdb.d/ 下的脚本。
# 注意：初始化脚本由 postgres 用户读取，必须显式放宽权限 ——
#       COPY 会保留宿主机的文件权限，若源文件是 600 则容器内读不到，
#       表现为脚本被静默跳过（日志中出现 Permission denied）。
COPY schema.sql /docker-entrypoint-initdb.d/01-schema.sql
RUN chmod 644 /docker-entrypoint-initdb.d/01-schema.sql
