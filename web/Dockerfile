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

# ⚠️ 限制 Node 堆内存：部署机内存很小（1.6G），
#    不限制时 Next.js 构建会吃满内存并拖垮整台机器。
ENV NODE_OPTIONS=--max-old-space-size=640

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

# 运维脚本（初始化超管与赛季、执行数据库迁移）
COPY --from=builder --chown=nextjs:nodejs /app/scripts ./scripts

# 数据库迁移文件。
# 为什么放在 web 下：执行迁移的是 web 容器（它已有 pg 依赖与 DATABASE_URL），
# 而迁移文件必须随镜像一起走，才能进到容器里被执行。
COPY --from=builder --chown=nextjs:nodejs /app/db ./db
COPY --from=builder --chown=nextjs:nodejs /app/bin ./bin

# 社团照片目录（D-31）。
# 为什么必须在切到非 root 之前建：
#   命名卷首次挂载时，Docker 会把镜像里该路径的**属主与权限**复制到卷上。
#   若镜像里没有这个目录，卷会被建成 root:root，而容器以 uid 1001 运行 → 上传 Permission denied。
RUN mkdir -p /app/uploads && chown -R nextjs:nodejs /app/uploads

USER nextjs
EXPOSE 3000
ENV PORT=3000 HOSTNAME=0.0.0.0

CMD ["node", "server.js"]