# ---------- 构建阶段 ----------
FROM node:22-alpine AS builder
WORKDIR /app

# 先只复制依赖清单，让依赖层可缓存
COPY package.json package-lock.json ./
RUN npm ci

COPY . .

# 构建期不需要真实数据库：页面都是动态渲染，
# 连接池也是惰性创建，这里给一个占位值让编译通过即可。
ENV DATABASE_URL=postgres://placeholder:placeholder@127.0.0.1:5432/placeholder
# standalone 输出：运行阶段只需 node server.js
RUN npm run build

# ---------- 运行阶段 ----------
FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production

# 以非 root 运行
RUN addgroup -S -g 1001 nodejs && adduser -S -u 1001 -G nodejs nextjs

# standalone 产物自带最小依赖树
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/public ./public

# 运维脚本（初始化超管与赛季）
COPY --from=builder --chown=nextjs:nodejs /app/scripts ./scripts
COPY --from=builder --chown=nextjs:nodejs /app/bin ./bin

USER nextjs
EXPOSE 3000
ENV PORT=3000 HOSTNAME=0.0.0.0

CMD ["node", "server.js"]
