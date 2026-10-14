FROM python:3.13-slim

WORKDIR /app
ENV PYTHONUNBUFFERED=1 PYTHONDONTWRITEBYTECODE=1

# ⚠️ tzdata 必须装。
#
# python:*-slim 基于 Debian，**默认不带时区数据库**。缺了它的后果很隐蔽：
# 容器时区是 UTC，而群内查询要显示「今天/明天 + 北京时间」，
# 于是北京时间 09:35 的约球会被显示成「今天 01:35」—— 看起来像数据错了，
# 实际是少了一个系统包。
RUN apt-get update \
 && apt-get install -y --no-install-recommends tzdata \
 && rm -rf /var/lib/apt/lists/*

# 先装依赖，便于层缓存
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

COPY bot ./bot

EXPOSE 8000
CMD ["python", "-m", "bot.main"]
