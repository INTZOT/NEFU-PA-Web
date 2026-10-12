# NEFU 匹克球协会网站

东北林业大学匹克球**协会**官方网站。移动端优先，从 QQ 群进入，同时承担**对外名片**与**成员日常服务**两种角色。

> **当前状态**：**7 个实施阶段全部上线** —— <https://nefupa.intzot.asia>
> 已进入持续迭代期，见「实施进度」与 [docs/status.md](docs/status.md)。

---

## 一、这是什么

| | 说明 |
| --- | --- |
| 展示区 | 社团介绍、公告、活动信息 —— **游客可访问** |
| 服务区 | 约球、活动报名、积分排行、个人主页 —— **仅成员** |
| 准入方式 | QQ 群内私聊机器人获取邀请码 → 网页注册 |
| 核心玩法 | 官方比赛按标准 ELO 计分，按学年归档；成员可自由约球 |

### 五个核心模块

1. **社团介绍** —— 对外名片
2. **社团公告** —— 官方通知
3. **官方活动** —— 仅报名侧（发布 / 报名 / 名额候补 / 搭档登记 / 签到），赛事组织在线下
4. **约球大厅** —— 成员发起房间，他人申请，发起人审批
5. **积分与排行** —— 自评分（自报）+ 比赛积分（仅官方比赛，标准 ELO）

---

## 二、架构

```
                    互联网
                       │
                       ▼
              ┌─────────────────┐
              │  caddy (HTTPS)  │  ← 自动申请与续期证书
              └────────┬────────┘
                       ▼
              ┌─────────────────┐
              │ web (Next.js)   │
              └────────┬────────┘
                       │
        ┌──────────────┼──────────────┐
        ▼              ▼              ▼
  ┌──────────┐  ┌────────────┐  ┌──────────┐
  │    db    │  │    bot     │  │ napcat   │
  │Postgres  │◀─│  Python    │◀─│ OneBot   │
  └──────────┘  └────────────┘  └──────────┘
        ▲                             ▲
        └─────────────────────────────┘
           web 与 bot 共用同一个数据库
```

| 组件 | 职责 |
| --- | --- |
| **web** | 网站本体（Next.js + TypeScript） |
| **bot** | QQ 机器人薄服务（Python）—— 注册发码、重置密码 |
| **db** | PostgreSQL，全部数据的唯一存放处 |
| **napcat** | QQ 协议端（OneBot 11），提供私聊收发能力 |
| **caddy** | 反向代理 + HTTPS |

**设计要点**：

- 除 caddy 外**任何服务都不对公网暴露端口**；
- web 与 bot **不互相调用**，通过同一个数据库协作；
- 但**密码加密与邀请码生成只有一份实现**（在网站侧），机器人通过一个极小接口调用，避免两种语言实现漂移。

---

## 三、目录结构

```
.
├── docker-compose.yml     # 五个服务的统一编排
├── .env.example           # 环境变量样板
├── caddy/Caddyfile        # 反向代理与 HTTPS 配置
├── db/
│   ├── Dockerfile         # 基于官方 postgres 镜像
│   └── schema.sql         # ★ 全部 16 张表的表结构
├── web/                   # 网站（Next.js）
└── bot/                   # QQ 机器人服务（Python）
```

> `docs/` 是**设计的事实来源**：范围声明、26 条架构决策、数据模型、模块边界都在那里。改动功能前先看文档。

---

## 四、部署

### 前置条件

| 项目 | 要求 |
| --- | --- |
| 服务器 | 一台可用的 Linux 云服务器 |
| 系统 | Ubuntu LTS |
| 软件 | Docker 与 Docker Compose |
| 域名 | 已备案，A 记录指向服务器公网 IP |
| 端口 | 放行 80 与 443 |
| 超管 QQ 号 | 在 `.env` 中填 `SUPER_ADMIN_QQ`（超管为预先指定，不靠注册顺序） |

### ⚠️ 铁律：部署机不做构建

本项目现在的部署机是 **1.6G 内存的入门云服务器**，它同时在跑其他项目。

**在这台机器上构建 Next.js 会耗尽内存、导致整机失去响应（SSH 都连不上）。**
这个错误实际发生过**两次**，两次都需要重启服务器。

所以流程固定为：**开发机构建 → 传镜像 → 部署机只启动**。

### 首次部署

**第一步：在开发机（有充足内存的机器）上构建镜像**

```bash
git clone https://github.com/INTZOT/NEFU-PA-Web.git
cd NEFU-PA-Web

# 构建网站镜像（约 1 分钟）
docker build -t nefu-pa-web-web:local ./web

# 构建机器人镜像
docker build -t nefu-pa-web-bot:local ./bot
```

**第二步：把镜像传到部署机**

```bash
docker save nefu-pa-web-web:local | gzip -1 | ssh 用户@服务器 'gunzip | docker load'
docker save nefu-pa-web-bot:local | gzip -1 | ssh 用户@服务器 'gunzip | docker load'
```

**第三步：在部署机上准备配置并启动**

```bash
cd NEFU-PA-Web
cp .env.example .env
vi .env          # 填入域名、数据库密码、SESSION_SECRET、超管 QQ 等

./deploy.sh      # 只启动，绝不构建；镜像缺失会直接报错
```

启动后访问域名即可。Caddy 会自动申请 HTTPS 证书（首次可能需要几十秒）。

### 验证

```bash
docker compose ps                            # 各服务应为 healthy
curl -fsS https://<你的域名>/api/healthz     # 应返回 ok
```

### 数据库表结构

表结构在**首次创建数据库时自动执行**（由 `db/schema.sql` 提供）。

> ⚠️ 该初始化**只在数据卷为空时运行一次**。如需在已有数据上重新应用，需手动执行，或删除数据卷（会丢数据）。

---

## 五、QQ 协议端（NapCat）

机器人需要它才能收发 QQ 消息。此服务**默认不随 compose 启动**（它有交互式登录，不适合自动化），需单独运行。

```bash
docker compose --profile napcat up -d napcat
```

### 扫码登录：用二维码页

**不要**从日志里复制终端二维码再转发——登录码有效期很短，往往还没扫就过期了。
项目自带一个**实时二维码页**，始终显示当前有效的码：

```bash
# 在部署机上启动（服务器自带 Python 3）
cd ~/nefu-pa-web && nohup python3 scripts/qr_server.py 8099 &
```

然后浏览器打开 **`https://<你的域名>/qr`**，用手机 QQ 扫码。页面每 2 秒自动刷新，
码失效后会自动换成新的。

> 原理：NapCat 会把当前二维码写到容器内 `/app/napcat/cache/qrcode.png`，
> 该脚本把它取出来并提供网页。登录完成后建议停掉该脚本。

### ⚠️ 必须知道的运维事项

| 事项 | 说明 |
| --- | --- |
| **首次需扫码** | 用手机 QQ 扫码登录（见上方二维码页） |
| **重启不再需要扫码** | ✅ 已修复，见下方「快速登录」一节 |
| **会话仍可能失效** | ⚠️ QQ 服务端若主动使会话失效，仍需重新扫码（见下） |
| **账号有被封风险** | 第三方协议端属灰色地带，已评估接受 |
| **被封后无兜底** | 换一个 QQ 号接上即可，**数据无需迁移**（全在数据库里） |

**建议**：用一个**专门的 QQ 号**做机器人，不要用个人主号。

#### 快速登录：为什么重启不再需要扫码

NapCat 的 `entrypoint.sh` 有两条分支：

```bash
if [ -n "${ACCOUNT}" ]; then
    qq --no-sandbox -q $ACCOUNT    # 快速登录（用已保存的凭据）
else
    qq --no-sandbox                # 二维码登录
fi
```

**原先 compose 从未设置 `ACCOUNT`，因此每次启动都走二维码登录** —— 尽管快速登录凭据
一直保存在 `napcat_qq` 卷里。日志其实早就提示了，只是没有被注意到：

```
没有 -q 指令指定快速登录，将使用二维码登录方式
可用于快速登录 of QQ：          ← 凭据就在那里
```

**修复**：在 `.env` 中设置 `BOT_QQ=<机器人QQ号>`，compose 把它作为 `ACCOUNT` 传入。

> **教训**：这个「每次重启都要扫码」曾被当作 NapCat 的固有行为记录下来，
> 实际只是差一个环境变量。**把现象当成结论、不再追问原因，会让一个一行的修复
> 被当成永久性的运维负担。**

#### 会话失效与重启扫码是两件不同的事

| 现象 | 原因 | 处置 |
| --- | --- | --- |
| 每次重启要扫码 | 缺 `ACCOUNT` | ✅ 已修复 |
| 运行中突然掉线 | **QQ 服务端主动踢下线** | ✅ **看门狗自动恢复**（见下） |
| 看门狗也恢复不了 | 登录态真正失效 | ⚠️ 需人工扫码（超管面板有二维码） |

**被踢下线的症状**（在 `docker compose logs napcat` 中可见）：

```
[KickedOffLine] [下线通知] 你的账号当前登录已失效，请重新登录。
```

**注意 NapCat 没有离线消息队列** —— 掉线期间发来的消息**永久丢失**，不会补发。

#### 看门狗：被踢下线后自动恢复

**为什么需要它**：被踢之后，NapCat 会在**容器内部**重启进程，
但 entrypoint 不会重跑，于是启动参数 `-q <QQ号>`（快速登录）就丢了 ——
NapCat 退化成二维码登录、卡住等人扫，**而没人知道它掉了**（实测停摆可达数小时）。

**它做什么**：每 2 分钟检查一次；发现「未连接 + 日志里有 `KickedOffLine`」时，
重启 napcat 容器 —— 容器重启会让 entrypoint 重跑，`-q` 参数恢复，于是自动快速登录。

```
scripts/napcat_watchdog.py     看门狗脚本
state/napcat-watchdog.json     它的状态（供超管面板读取）
deploy/napcat-watchdog.{service,timer}
```

**安装**（需要 sudo）：

```bash
sudo cp ~/nefu-pa-web/deploy/napcat-watchdog.service \
        ~/nefu-pa-web/deploy/napcat-watchdog.timer /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now napcat-watchdog.timer
```

**查看**：

```bash
systemctl list-timers napcat-watchdog.timer
journalctl -u napcat-watchdog.service -n 30 --no-pager
```

**防循环**：若登录态是真失效（不是被踢），重启也登不上。因此脚本在
**冷却窗口（30 分钟）内只尝试一次**，失败就停下，并把尝试记录写进
`state/napcat-watchdog.json`；**超管面板会显示「已尝试自动恢复但未成功」，
并直接给出二维码**。

**手动跑一次**（排查时有用）：

```bash
cd ~/nefu-pa-web
python3 scripts/napcat_watchdog.py --dry-run   # 只报告，不重启
python3 scripts/napcat_watchdog.py             # 真跑一次
```

---

## 六、备份

项目数据**全部在 PostgreSQL 里**，因此只需备份数据库：

`bash`
docker compose exec -T db pg_dump -U nefu nefu_pa | gzip > backup-$(date +%F).sql.gz
`

恢复：

`bash`
gunzip -c backup-2026-10-11.sql.gz | docker compose exec -T db psql -U nefu -d nefu_pa
`

> 代码在仓库里、配置在 `.env` 里，都可重建。**唯一不可重建的是数据。**

---

## 七、实施进度

| 阶段 | 内容 | 状态 |
| --- | --- | --- |
| **1. 地基** | 仓库结构、compose 编排、数据库表结构、部署手册 | ✅ **已完成** |
| **2. 账号体系** | 注册、登录、会话、超管初始化 | ✅ **已完成** |
| **3. 机器人** | NapCat 接入、注册发码、重置密码、共享规则 | ✅ **已完成**（真实用户验证） |
| **4. 展示区** | 首页、社团介绍、公告、管理后台 | ✅ **已完成** |
| **5. 活动** | 赛事、报名、候补、搭档、签到 | ✅ **已完成** |
| **6. 约球** | 房间状态机 | ✅ **已完成** |
| **7. 积分** | 对局录入、ELO 结算、排行榜、赛季归档 | ✅ **已完成** |

### 上线后的迭代（7 阶段之后）

| 内容 | 说明 |
| --- | --- |
| **前端美化** | 用 logo 颜色直方图提取品牌色，落地为 23 个语义令牌 + 共享组件库 |
| **社团相册** | 命名卷存储、浏览器端压缩、首页精选 |
| **首页 Hero** | 精选照片轮播 + 毛玻璃；文案可由管理员配置 |
| **安全整改** | 全盘 review 后修 3 项（会话失效、安全响应头 + CSP nonce、认证限流） |
| **个人主页** | 待办集中、排名胜率、我报名的活动、个人简介 |

---

## 八、设计文档

| 文档 | 内容 |
| --- | --- |
| [CHANGELOG.md](CHANGELOG.md) | **版本更新日志**（当前 v1.4.0） |
| [status.md](docs/status.md) | 进度看板 |
| [scope.md](docs/scope.md) | 范围声明：做什么、不做什么 |
| [decisions.md](docs/decisions.md) | **35 条**架构决策及其取舍（D-01 … D-35） |
| [requirements.md](docs/requirements.md) | 108 条需求 |
| [open-questions.md](docs/open-questions.md) | 待决策问题及其答复与去向 |
| [p2-data-model.md](docs/p2-data-model.md) | 16 张表的数据模型（另有 15 个迁移） |
| [p2-modules.md](docs/p2-modules.md) | 14 个模块与关键流程 |
| [p2-pages.md](docs/p2-pages.md) | 页面结构与准入级别 |
| [p3-blueprint.md](docs/p3-blueprint.md) | 实施纲要 |
| [p3-deployment.md](docs/p3-deployment.md) | 部署与运维方案 |
