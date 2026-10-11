FROM node:22-alpine

WORKDIR /app
ENV NODE_ENV=production

# 阶段 1 占位服务；阶段 2 会替换为 Next.js 构建产物
COPY src ./src
COPY bin ./bin

EXPOSE 3000
CMD ["node", "src/server.mjs"]
