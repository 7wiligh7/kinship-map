import http.server
import socketserver
import os

PORT = 8000
DIR = os.path.dirname(os.path.abspath(__file__))

os.chdir(DIR)
print(f"服务器启动: http://localhost:{PORT}")
print("按 Ctrl+C 停止")

class ReuseServer(socketserver.TCPServer):
    allow_reuse_address = True


Handler = http.server.SimpleHTTPRequestHandler
with ReuseServer(("", PORT), Handler) as httpd:
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\n服务器已停止")
