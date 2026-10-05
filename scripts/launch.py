"""Local preview launcher. Standard library only; never needed on a static host."""
import argparse
import hashlib
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
import json
import socket
from pathlib import Path
import threading
from urllib.error import URLError
from urllib.parse import urlsplit
from urllib.request import urlopen
import webbrowser

ROOT=Path(__file__).resolve().parents[1]
MARKER='/__gridcraft_launcher__'
ASSETS={'ui','analysis','components','core','project','examples'}

def identity(root):
    return hashlib.sha256(str(Path(root).resolve()).casefold().encode('utf-8')).hexdigest()

def make_server(root,port):
    root=Path(root).resolve()
    class Handler(SimpleHTTPRequestHandler):
        def __init__(self,*args,**kwargs):
            super().__init__(*args,directory=str(root),**kwargs)
        def log_message(self,*args):
            pass
        def do_GET(self):
            if urlsplit(self.path).path==MARKER:
                data=json.dumps({'application':'gridcraft-beta','project':identity(root)}).encode()
                self.send_response(200);self.send_header('Content-Type','application/json')
                self.send_header('Cache-Control','no-store');self.send_header('Content-Length',str(len(data)));self.end_headers();self.wfile.write(data)
            else:super().do_GET()
        def send_head(self):
            candidate=Path(self.translate_path(self.path)).resolve()
            try:rel=candidate.relative_to(root)
            except ValueError:
                self.send_error(404);return None
            parts=rel.parts
            allowed=not parts or str(rel) in {'index.html','gfl.html','gfm.html'} or parts[0] in ASSETS
            if not allowed or (parts and any(x.startswith('.') for x in parts)):
                self.send_error(404);return None
            if candidate.is_dir() and parts:
                self.send_error(404);return None
            return super().send_head()
        def end_headers(self):
            self.send_header('Cache-Control','no-cache')
            super().end_headers()
    class Server(ThreadingHTTPServer):
        allow_reuse_address=False
        def server_bind(self):
            # Windows otherwise permits overlapping HTTPServer binds with SO_REUSEADDR.
            if hasattr(socket,'SO_EXCLUSIVEADDRUSE'):
                self.socket.setsockopt(socket.SOL_SOCKET,socket.SO_EXCLUSIVEADDRUSE,1)
            super().server_bind()
    return Server(('127.0.0.1',port),Handler)

def is_same_server(root,port):
    try:
        with urlopen('http://127.0.0.1:'+str(port)+MARKER,timeout=.4) as response:
            if 'application/json' not in response.headers.get('Content-Type',''):return False
            data=json.loads(response.read(2048))
            return data.get('application')=='gridcraft-beta' and data.get('project')==identity(root)
    except (OSError,URLError,ValueError):return False

def choose_server(root,port):
    for candidate in range(port, min(port+11,65536)):
        if candidate and is_same_server(root,candidate):return None,candidate
        try:
            server=make_server(root,candidate)
            return server,server.server_port
        except OSError:continue
    raise OSError('No available local port. Close an old preview or use --port NUMBER.')

def main():
    parser=argparse.ArgumentParser(description='Start Gridcraft Beta and open your browser.')
    parser.add_argument('--port',type=int,default=4189)
    parser.add_argument('--no-browser',action='store_true',help='Run without opening a browser')
    parser.add_argument('--check',action='store_true',help='Check extracted project files and exit')
    args=parser.parse_args()
    if not 0<=args.port<=65535:parser.error('port must be between 0 and 65535')
    required=['index.html','gfl.html','gfm.html','ui/app.js','examples/pv-grid-demo.js']
    for name in required:
        if not (ROOT/name).is_file():raise OSError('Missing '+name+'. Extract the complete project ZIP first.')
    if args.check:
        print('OK: Gridcraft Beta files and Python runtime are ready.');return
    server,port=choose_server(ROOT,args.port)
    url='http://127.0.0.1:'+str(port)+'/'
    if server:
        thread=threading.Thread(target=server.serve_forever,daemon=True);thread.start()
        if not is_same_server(ROOT,port):
            server.shutdown();server.server_close();raise OSError('Local server readiness check failed.')
    else:print('Reusing the running server for this project.')
    print('Gridcraft Beta: '+url,flush=True)
    if args.port and port!=args.port:
        print('Default port is occupied. Using '+str(port)+'. Browser project storage is separate for each port.',flush=True)
    if not args.no_browser:
        try:
            if not webbrowser.open(url):print('Open the URL above in your browser.')
        except webbrowser.Error:print('Open the URL above in your browser.')
    if server:
        print('Keep this window open. Press Ctrl+C or close it to stop the local server.',flush=True)
        try:
            while thread.is_alive():thread.join(.5)
        except KeyboardInterrupt:print('Stopping Gridcraft Beta...')
        finally:server.shutdown();server.server_close()

if __name__=='__main__':
    try:main()
    except (OSError,ValueError) as error:
        print('ERROR: '+str(error));raise SystemExit(1)
