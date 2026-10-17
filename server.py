import http.server
import socket
import socketserver
import os
import sys

PORT = 8000
DIR = os.path.dirname(os.path.abspath(__file__))

os.chdir(DIR)


class Handler(http.server.SimpleHTTPRequestHandler):
    # 静态资源较多且请求密集，逐条日志在 Windows 控制台上开销明显，这里关闭
    def log_message(self, *args):
        pass


class DualStackServer(socketserver.ThreadingTCPServer):
    allow_reuse_address = True
    daemon_threads = True

    def server_bind(self):
        # 关闭 IPV6_V6ONLY，让同一个 socket 同时接受 IPv6 与 IPv4(v4-mapped)
        try:
            self.socket.setsockopt(socket.IPPROTO_IPV6, socket.IPV6_V6ONLY, 0)
        except (AttributeError, OSError):
            pass
        super().server_bind()


def make_server():
    # 关键：必须同时监听 IPv6。Windows 上 localhost 优先解析为 ::1，
    # 若只监听 IPv4，每次请求都要先等 ::1 连接被延迟拒绝(~2s)再回退到 IPv4。
    try:
        DualStackServer.address_family = socket.AF_INET6
        return DualStackServer(("::", PORT), Handler), True
    except OSError:
        DualStackServer.address_family = socket.AF_INET
        return DualStackServer(("", PORT), Handler), False


def main():
    try:
        httpd, has_v6 = make_server()
    except OSError as e:
        print(f"端口 {PORT} 无法使用：{e}")
        sys.exit(1)

    print(f"服务器启动: http://localhost:{PORT}")
    print(f"    备用地址: http://127.0.0.1:{PORT}")
    if not has_v6:
        print("    (未检测到 IPv6，仅监听 IPv4)")
    print("按 Ctrl+C 停止")
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\n服务器已停止")
    finally:
        httpd.server_close()


if __name__ == "__main__":
    main()
