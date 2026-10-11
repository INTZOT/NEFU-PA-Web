# 基于官方 postgres 镜像，仅追加表结构初始化脚本
# 使用 18-alpine：与部署服务器上已有的 postgres 主版本一致
FROM postgres:18-alpine

# 官方镜像会在首次建库时执行 /docker-entrypoint-initdb.d/ 下的脚本
COPY schema.sql /docker-entrypoint-initdb.d/01-schema.sql
