#!/usr/bin/env python3
"""二维码页服务（临时，仅用于 NapCat 首次登录扫码）。

为什么需要：NapCat 的登录码有效期很短，把日志导出成图片再转发会来不及。
本服务每 5 秒从 NapCat 容器日志取最新二维码、渲染成 PNG，
并提供自动刷新的网页 —— 打开网页即可看到当前有效的码。

运行位置：宿主机（非容器）。宿主机有 Python 3，且用户已在 docker 组，
        可直接用 docker logs 读取容器输出；因此无需额外镜像。

用法：python3 qr_server.py [端口]
"""

import os
import re
import struct
import shutil
import subprocess
import sys
import threading
import time
import zlib
from http.server import BaseHTTPRequestHandler, HTTPServer

CONTAINER = os.environ.get('NAPCAT_CONTAINER', 'nefu-pa-web-napcat-1')
# 非登录 shell 下 PATH 可能不含 docker，显式解析其绝对路径
DOCKER_BIN = shutil.which('docker') or next(
    (p for p in ('/usr/bin/docker', '/usr/local/bin/docker') if os.path.exists(p)), 'docker')
PORT = int(sys.argv[1]) if len(sys.argv) > 1 else int(os.environ.get('QR_PORT', '8099'))
PNG_PATH = '/tmp/napcat-qr.png'
# NapCat 会把当前二维码直接写成 PNG，优先用它（比从日志重建可靠得多）
NATIVE_QR_IN_CONTAINER = '/app/napcat/cache/qrcode.png'
NATIVE_QR_LOCAL = '/tmp/napcat-native-qr.png'

QR_CHARS = set(' ' + chr(0x2588) + chr(0x2580) + chr(0x2584))
TOP = {' ': 0, chr(0x2588): 1, chr(0x2580): 1, chr(0x2584): 0}
BOT = {' ': 0, chr(0x2588): 1, chr(0x2580): 0, chr(0x2584): 1}
ANSI = re.compile(r'\x1b\[[0-9;]*m')


def write_png(path, matrix, scale=12, quiet=4):
    n, m = len(matrix), len(matrix[0])
    w = (m + quiet * 2) * scale
    h = (n + quiet * 2) * scale
    raw = bytearray()
    for y in range(h):
        raw.append(0)
        mr = y // scale - quiet
        for x in range(w):
            mc = x // scale - quiet
            dark = 0 <= mr < n and 0 <= mc < m and matrix[mr][mc]
            raw.append(0 if dark else 255)

    def chunk(tag, data):
        return struct.pack('>I', len(data)) + tag + data + struct.pack('>I', zlib.crc32(tag + data) & 0xFFFFFFFF)

    png = b'\x89PNG\r\n\x1a\n'
    png += chunk(b'IHDR', struct.pack('>IIBBBBB', w, h, 8, 0, 0, 0, 0))
    png += chunk(b'IDAT', zlib.compress(bytes(raw), 9))
    png += chunk(b'IEND', b'')
    with open(path, 'wb') as f:
        f.write(png)


def read_log():
    try:
        p = subprocess.run(['docker', 'logs', '--tail', '500', CONTAINER],
                           capture_output=True, timeout=25)
        return (p.stdout + p.stderr).decode('utf-8', 'replace')
    except Exception:
        return ''


def extract_matrix(text):
    lines = [ANSI.sub('', ln.rstrip('\r')) for ln in text.split('\n')]
    qr_lines = [ln for ln in lines if len(ln) >= 20 and all(c in QR_CHARS for c in ln)]
    if len(qr_lines) < 2:
        return None
    block = []
    for ln in reversed(qr_lines):
        block.append(ln)
        if len(block) >= 18:
            break
    block.reverse()
    rows = []
    for ln in block:
        rows.append([TOP[c] for c in ln])
        rows.append([BOT[c] for c in ln])
    white = [0] * len(rows[0])
    matrix = [white] + rows
    if len(matrix) % 2 == 0:
        matrix.append(white)
    return matrix


STATE = {'ts': 0.0, 'ok': False, 'src': '-'}


def copy_native_qr():
    """把 NapCat 容器内的原生二维码文件复制出来（比解析日志可靠）。"""
    try:
        p = subprocess.run(
            [DOCKER_BIN, 'cp', CONTAINER + ':' + NATIVE_QR_IN_CONTAINER, NATIVE_QR_LOCAL],
            capture_output=True, timeout=25)
        if p.returncode != 0:
            STATE['err'] = p.stderr.decode('utf-8', 'replace')[:200]
            return False
        with open(NATIVE_QR_LOCAL, 'rb') as f:
            head = f.read(4)
        # PNG 魔数前 4 字节：\x89 P N G
        # （此前读 8 字节却只比 4 字节，导致判断恒为假，一直退回日志重建）
        return head == bytes([0x89]) + b'PNG'
    except Exception:
        return False


def build():
    """优先取 NapCat 原生二维码；失败则退回从日志重建。"""
    if copy_native_qr():
        try:
            with open(NATIVE_QR_LOCAL, 'rb') as src, open(PNG_PATH, 'wb') as dst:
                dst.write(src.read())
            STATE['ts'] = time.time()
            STATE['ok'] = True
            STATE['src'] = 'native'
            return True
        except OSError:
            pass

    matrix = extract_matrix(read_log())
    if not matrix:
        return False
    write_png(PNG_PATH, matrix)
    STATE['ts'] = time.time()
    STATE['ok'] = True
    STATE['src'] = 'log'
    return True


PAGE = (
    '<!doctype html><html lang=zh><head><meta charset=utf-8>'
    '<meta name=viewport content=\"width=device-width,initial-scale=1\">'
    '<meta http-equiv=refresh content=8>'
    '<title>QQ 登录二维码</title>'
    '<style>body{font-family:system-ui;margin:0;padding:20px;text-align:center;background:#fafafa}'
    'img{width:min(92vw,400px);image-rendering:pixelated;background:#fff;padding:10px;border-radius:8px;box-shadow:0 1px 6px rgba(0,0,0,.1)}'
    'p{color:#555;font-size:14px;line-height:1.6;margin:8px 0}</style></head><body>'
    '<h2>用手机 QQ 扫码登录</h2>'
    '<p>本页每 8 秒自动刷新，二维码失效后会自动换成新的。</p>'
    '<img id="qr" src="/qr.png?t=%d" alt=二维码>'
    '<script>setInterval(function(){var e=document.getElementById("qr");'
    'e.src="/qr.png?t="+Date.now();},2000);</script>'
    '<p>扫码后 QQ 提示「允许登录」，确认即可。</p>'
    '</body></html>'
)


class Handler(BaseHTTPRequestHandler):
    def do_GET(self):  # noqa: N802
        if self.path.startswith('/qr.png'):
            build()
            try:
                with open(PNG_PATH, 'rb') as f:
                    data = f.read()
            except OSError:
                data = b''
            self.send_response(200 if data else 404)
            self.send_header('content-type', 'image/png')
            self.send_header('cache-control', 'no-store')
            self.send_header('content-length', str(len(data)))
            self.end_headers()
            if data:
                self.wfile.write(data)
            return

        if self.path.startswith('/refresh'):
            ok = build()
            body = b'ok' if ok else b'no-qr'
            self.send_response(200)
            self.send_header('content-type', 'text/plain')
            self.send_header('content-length', str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return

        body = (PAGE % int(STATE['ts'])).encode('utf-8')
        self.send_response(200)
        self.send_header('content-type', 'text/html; charset=utf-8')
        self.send_header('cache-control', 'no-store')
        self.send_header('content-length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, *a):
        pass


def loop():
    while True:
        try:
            build()
        except Exception:
            pass
        time.sleep(5)


if __name__ == '__main__':
    ok = build()
    threading.Thread(target=loop, daemon=True).start()
    print('qr page on :%d watching %s (first build ok=%s)' % (PORT, CONTAINER, ok), flush=True)
    HTTPServer(('0.0.0.0', PORT), Handler).serve_forever()