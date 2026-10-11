FROM node:22-alpine

# 容器健康检查需要 curl；alpine 基础镜像不自带
RUN apk add --no-cache curl

WORKDIR /app
ENV NODE_ENV=production

COPY src ./src

EXPOSE 3000
CMD ["node", "src/server.mjs"]
