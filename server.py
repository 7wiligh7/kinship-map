# -*- coding: utf-8 -*-
"""亲属关系地图 — 本地静态服务器

默认只绑定本机回环（127.0.0.1 / ::1），局域网不可访问；
需要在其他设备（平板/手机）访问时用 `python server.py --lan`。

缓存策略：
- index.html            → no-cache（每次都 revalidate，保证"改了就生效"）
- 带 ?v= 参数的静态资源  → 一年 immutable（版本参数变化时 URL 已变，必然拉新）
- /vendor/ 下的资源      → 一年 immutable（第三方库，极少变动）
- 其余                   → no-cache

文本类响应（html/css/js/json）带 gzip 压缩：app.js 约 110KB → 约 30KB。
"""
import argparse
import gzip
import http.server
import io
import os
import socket
import socketserver
import sys
import threading

PORT = 8000
DIR = os.path.dirname(os.path.abspath(__file__))

os.chdir(DIR)

# 走 gzip 的响应类型（瓦片 PNG、图片本身已压缩，不重复压）。
# text/javascript 和 application/javascript 都列上：Python 3.12+ 的 mimetypes 把 .js 判为前者。
GZIP_TYPES = ('text/html', 'text/css', 'application/javascript', 'text/javascript',
              'application/json', 'text/plain', 'image/svg+xml')


class Handler(http.server.SimpleHTTPRequestHandler):
    # 静态资源较多且请求密集，逐条日志在 Windows 控制台上开销明显，这里关闭
    def log_message(self, *args):
        pass

    # 关闭目录列表：没有 index.html 的目录一律 403，避免项目内文件被浏览/枚举
    def list_directory(self, path):
        self.send_error(403, 'Directory listing disabled')
        return None

    def _cache_control(self):
        p = self.path
        if p.startswith('/index.html') or p == '/':
            return 'no-cache'
        if p.startswith('/vendor/') or '?v=' in p:
            # 版本指纹 / 第三方库：内容变化时 URL 必变，可放心长缓存
            return 'max-age=31536000, immutable'
        return 'no-cache'

    def _wants_gzip(self):
        if getattr(self, '_gzip_decided', False):
            return self._gzip_gzip
        self._gzip_decided = True
        self._gzip_gzip = False
        # 去掉 ?v= 查询参数再识别类型；"/" 视为 index.html
        p = self.path.split('?', 1)[0].split('#', 1)[0]
        ctype = 'text/html' if p == '/' else self.guess_type(p)
        if ctype not in GZIP_TYPES:
            return False
        accept = (self.headers.get('Accept-Encoding') or '').lower()
        self._gzip_gzip = 'gzip' in accept
        return self._gzip_gzip

    def end_headers(self):
        self.send_header('Cache-Control', self._cache_control())
        # CSP：脚本只许本地文件（全站无内联 handler，见 app.js 的 ACTIONS 事件委托）；
        # img 放行底图源 + data:/blob:（瓦片缓存）；connect 放行地名搜索的各服务端。
        self.send_header('Content-Security-Policy',
                         "default-src 'self'; "
                         "script-src 'self'; "
                         "style-src 'self' 'unsafe-inline'; "
                         "img-src 'self' data: blob: https://server.arcgisonline.com; "
                         "connect-src 'self' https://server.arcgisonline.com "
                         "https://geocode.arcgis.com https://restapi.amap.com "
                         "https://api.tianditu.gov.cn https://photon.komoot.io "
                         "https://nominatim.openstreetmap.org; "
                         "object-src 'none'; base-uri 'self'; form-action 'none'; "
                         "frame-ancestors 'none'")
        # 只对 200 开 gzip：304/错误响应没有正文，带 Content-Encoding 是协议错误
        if getattr(self, '_status', 200) == 200 and self._wants_gzip():
            # 压缩后长度已变：send_head 里写入的 Content-Length 是原文件大小，
            # 不去掉浏览器会按错误长度等数据/截断。去掉后由 HTTP/1.0 连接关闭定界。
            if hasattr(self, '_headers_buffer'):
                self._headers_buffer = [h for h in self._headers_buffer
                                        if not h.lower().startswith(b'content-length')]
            self.send_header('Content-Encoding', 'gzip')
            self.send_header('Vary', 'Accept-Encoding')
        super().end_headers()

    def send_response(self, code, *args, **kwargs):
        self._status = code
        super().send_response(code, *args, **kwargs)

    # SimpleHTTPRequestHandler 用 copyfile 把文件写回 socket；在这里套 gzip 流
    def copyfile(self, source, outputfile):
        if self._wants_gzip():
            buf = io.BytesIO()
            with gzip.GzipFile(fileobj=buf, mode='wb', compresslevel=6) as z:
                z.write(source.read())
            outputfile.write(buf.getvalue())
        else:
            super().copyfile(source, outputfile)


class DualStackServer(socketserver.ThreadingTCPServer):
    allow_reuse_address = True
    daemon_threads = True

    def __init__(self, addr_family, bind_addr):
        self.address_family = addr_family
        super().__init__(bind_addr, Handler)


def make_servers(lan):
    """返回 [(server, 描述), ...]。本机模式同时绑 ::1 和 127.0.0.1（localhost 两种解析都秒回）。"""
    servers = []
    if lan:
        try:
            s = DualStackServer(socket.AF_INET6, ('::', PORT))
            try:
                # 关闭 IPV6_V6ONLY，让同一个 socket 同时接受 IPv6 与 IPv4(v4-mapped)
                s.socket.setsockopt(socket.IPPROTO_IPV6, socket.IPV6_V6ONLY, 0)
            except (AttributeError, OSError):
                pass
            return [(s, '全接口（IPv6+IPv4，局域网可达）')]
        except OSError as e:
            print(f'绑定全接口失败（{e}），回退仅 IPv4 全接口')
            return [(DualStackServer(socket.AF_INET, ('', PORT)), '全接口（仅 IPv4，局域网可达）')]
    # 本机模式：双回环并行，任一失败都不致命
    try:
        servers.append((DualStackServer(socket.AF_INET6, ('::1', PORT)), None))
    except OSError:
        pass
    try:
        servers.append((DualStackServer(socket.AF_INET, ('127.0.0.1', PORT)), None))
    except OSError:
        pass
    return servers


def main():
    ap = argparse.ArgumentParser(description='亲属关系地图本地服务器')
    ap.add_argument('--lan', action='store_true',
                    help='绑定全部网卡（局域网内其他设备可访问）；默认仅本机回环')
    args = ap.parse_args()

    servers = make_servers(args.lan)
    if not servers:
        print(f'端口 {PORT} 无法绑定，请检查是否被占用')
        sys.exit(1)

    print('服务器启动: http://localhost:%d' % PORT)
    print('    备用地址: http://127.0.0.1:%d' % PORT)
    print('访问范围: %s' % ('局域网（--lan）' if args.lan else '仅本机（要给局域网用：python server.py --lan）'))
    print('按 Ctrl+C 停止')

    try:
        # 首个服务必须跑在主线程：threading.Event().wait() 在 Windows 上
        # 阻塞期间不检查信号，Ctrl+C 根本打不进来（之前"停不下来"的原因）；
        # serve_forever 的 select 循环则会被正常打断。
        if len(servers) > 1:
            threading.Thread(target=servers[1][0].serve_forever, daemon=True).start()
        servers[0][0].serve_forever()
    except KeyboardInterrupt:
        print('\n服务器已停止')
    finally:
        for s, _ in servers:
            s.server_close()


if __name__ == '__main__':
    main()
