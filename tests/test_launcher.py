import importlib.util
from pathlib import Path
import tempfile
import threading
import unittest
import subprocess
import sys
from urllib.request import urlopen
from urllib.error import HTTPError

ROOT=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('launcher', ROOT/'scripts'/'launch.py')
launcher=importlib.util.module_from_spec(spec);spec.loader.exec_module(launcher)

class LauncherTests(unittest.TestCase):
    def setUp(self):
        self.server=launcher.make_server(ROOT,0)
        self.thread=threading.Thread(target=self.server.serve_forever,daemon=True);self.thread.start()
        self.url='http://127.0.0.1:'+str(self.server.server_port)
    def tearDown(self):
        self.server.shutdown();self.server.server_close();self.thread.join()
    def test_root_page_and_modules(self):
        self.assertIn(b'Gridcraft Beta',urlopen(self.url+'/').read())
        self.assertIn(b'autoTuneGfl',urlopen(self.url+'/analysis/gfl-autotune.js?v=1').read())
    def test_reuse_only_same_project(self):
        self.assertTrue(launcher.is_same_server(ROOT,self.server.server_port))
        with tempfile.TemporaryDirectory() as directory:
            self.assertFalse(launcher.is_same_server(Path(directory),self.server.server_port))
    def test_development_files_not_served(self):
        for path in ['/.git/config','/package.json','/tests/test_launcher.py','/scripts/launch.py','/ui/../package.json']:
            with self.subTest(path=path),self.assertRaises(HTTPError) as error:
                urlopen(self.url+path)
            self.assertEqual(error.exception.code,404)
    def test_port_reuse_and_collision_fallback(self):
        server,port=launcher.choose_server(ROOT,self.server.server_port)
        self.assertIsNone(server);self.assertEqual(port,self.server.server_port)
        with tempfile.TemporaryDirectory() as directory:
            other,new_port=launcher.choose_server(Path(directory),self.server.server_port)
            try:
                self.assertIsNotNone(other);self.assertNotEqual(new_port,self.server.server_port)
            finally:other.server_close()
    def test_real_launcher_process_becomes_ready(self):
        proc=subprocess.Popen([sys.executable,str(ROOT/'scripts'/'launch.py'),'--port','0','--no-browser'],stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True)
        try:
            line=proc.stdout.readline().strip()
            self.assertTrue(line.startswith('Gridcraft Beta: http://127.0.0.1:'),line)
            self.assertIn(b'Gridcraft Beta',urlopen(line.split(': ',1)[1],timeout=2).read())
        finally:
            proc.terminate();proc.communicate(timeout=5)
    def test_paths_with_spaces_and_unicode(self):
        with tempfile.TemporaryDirectory(prefix='gridcraft 中文 ') as directory:
            root=Path(directory);(root/'index.html').write_text('test')
            server=launcher.make_server(root,0)
            try:self.assertGreater(server.server_port,0)
            finally:server.server_close()

if __name__=='__main__':unittest.main()
