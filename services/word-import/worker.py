"""One low-priority DOCX worker; Supabase stores only commands, progress and drafts."""
import argparse
import base64
import json
import os
from pathlib import Path
import shutil
import subprocess
import threading
import time
import urllib.request
from urllib.parse import urlparse

from docx_source import DocxSource

HERE = Path(__file__).resolve().parent
STATE = HERE / '.state'


class LeaseLost(Exception):
    pass


def load_config():
    for path in (HERE.parent / 'zalo-bot/.env', HERE / '.env'):
        if path.exists():
            for line in path.read_text(encoding='utf-8-sig').splitlines():
                if '=' in line and not line.lstrip().startswith('#'):
                    key, value = line.split('=', 1)
                    os.environ.setdefault(key.strip(), value.strip().strip('"').strip("'"))
    url = os.environ.get('ZALO_GATEWAY_URL', '')
    token = os.environ.get('ZALO_GATEWAY_TOKEN', '')
    if not url.startswith('https://') or not token:
        raise RuntimeError('Missing gateway configuration in services/word-import/.env or services/zalo-bot/.env')
    return url.rsplit('/', 1)[0] + '/word-import-gateway', token


class Gateway:
    def __init__(self):
        self.url, self.token = load_config()

    def call(self, action, **data):
        request = urllib.request.Request(self.url, data=json.dumps(dict(action=action, **data)).encode(),
                                        headers={'Content-Type':'application/json', 'x-zalo-gateway-token': self.token})
        with urllib.request.urlopen(request, timeout=35) as response:
            return json.load(response)


class Job:
    def __init__(self, gateway, job):
        self.gateway, self.job = gateway, job
        self.progress, self.stopped = {}, threading.Event()
        self.lease_lost = False
        self.lock = threading.Lock()
        self.thread = threading.Thread(target=self.heartbeat, daemon=True)

    def cycle(self, items=None, status='processing', error=None):
        with self.lock:
            if self.lease_lost:
                raise LeaseLost()
            result = self.gateway.call('wordImportCycle', id=self.job['id'], token=self.job['token'],
                                       items=items or [], progress=self.progress.copy(), status=status, error=error)
            if not result.get('active'):
                self.lease_lost = True
                raise LeaseLost()

    def heartbeat(self):
        failures = 0
        while not self.stopped.wait(20):
            try:
                self.cycle()
                failures = 0
            except LeaseLost:
                return
            except Exception:
                failures += 1
                if failures >= 3:
                    self.lease_lost = True
                    return

    def checkpoint(self, **progress):
        if self.lease_lost:
            raise LeaseLost()
        self.progress.update(progress)

    def upload(self, name, png):
        if self.lease_lost:
            raise LeaseLost()
        result = self.gateway.call('wordImportMedia', id=self.job['id'], token=self.job['token'],
                                   name=name, base64=base64.b64encode(png).decode())
        if not result.get('active'):
            self.lease_lost = True
            raise LeaseLost()

    def run(self):
        self.thread.start()
        try:
            path = STATE / (self.job['id'] + '.docx')
            cache = STATE / (self.job['id'] + '.drafts.json')
            download = self.job['download_url']
            if urlparse(download).hostname != urlparse(self.gateway.url).hostname or not download.startswith('https://'):
                raise ValueError('Untrusted Word source URL')
            if cache.exists():
                cached = json.loads(cache.read_text(encoding='utf-8'))
                items = cached['items']
                self.progress.update(cached['stats'])
            else:
                with urllib.request.urlopen(download, timeout=60) as response, path.open('wb') as output:
                    size = 0
                    while chunk := response.read(65536):
                        size += len(chunk)
                        if size > 20971520:
                            raise ValueError('Word file exceeds 20 MB')
                        output.write(chunk)
                source = DocxSource(path, self.job['id'], self.upload, self.checkpoint).read()
                self.checkpoint(phase='parsing')
                node = os.environ.get('MINDUP_NODE') or shutil.which('node')
                if not node:
                    raise RuntimeError('Node.js required')
                result = subprocess.run([node, str(HERE / 'parse-questions.cjs')], input=json.dumps(source, ensure_ascii=False),
                                        capture_output=True, text=True, encoding='utf-8', timeout=120, check=True)
                items = json.loads(result.stdout)
                temporary = cache.with_suffix('.tmp')
                temporary.write_text(json.dumps(dict(items=items,stats=source['stats']),ensure_ascii=False),encoding='utf-8')
                temporary.replace(cache)
            if not 1 <= len(items) <= 5000:
                raise ValueError('Không tìm thấy câu hỏi hoặc vượt quá 5000 câu/file. Cần đánh số Câu 1, Câu 2...')
            self.checkpoint(phase='saving', total=len(items), saved=0)
            for start in range(0, len(items), 10):
                batch = items[start:start+10]
                self.checkpoint(saved=start+len(batch))
                self.cycle(batch)
                time.sleep(0.1)
            self.checkpoint(phase='completed')
            self.cycle(status='completed')
            path.unlink(missing_ok=True)
            cache.unlink(missing_ok=True)
            print(f"Word: saved {len(items)} drafts; no questions published", flush=True)
        except LeaseLost:
            print('Word: paused/cancelled or lease expired; saved drafts are retained', flush=True)
        except Exception as exc:
            # Never log signed URLs, tokens, source contents or parent/student information.
            print('Word job failed: ' + type(exc).__name__, flush=True)
            try:
                self.cycle(status='failed', error=f'{type(exc).__name__}: kiểm tra file Word hoặc nhật ký dịch vụ.')
            except Exception:
                pass
        finally:
            self.stopped.set()
            self.thread.join(timeout=36)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--once', action='store_true')
    args = parser.parse_args()
    STATE.mkdir(exist_ok=True)
    singleton = (STATE / 'worker.lock').open('a+b')
    singleton.seek(0)
    if os.name == 'nt':
        import msvcrt
        import ctypes
        from ctypes import wintypes
        try:
            msvcrt.locking(singleton.fileno(), msvcrt.LK_NBLCK, 1)
        except OSError:
            raise SystemExit('Word worker is already running')
        kernel = ctypes.WinDLL('kernel32')
        kernel.GetCurrentProcess.restype = wintypes.HANDLE
        kernel.SetPriorityClass.argtypes = [wintypes.HANDLE, wintypes.DWORD]
        kernel.SetPriorityClass(kernel.GetCurrentProcess(), 0x00004000)  # Below normal, not realtime/CPU-hungry.
    else:
        import fcntl
        fcntl.flock(singleton, fcntl.LOCK_EX | fcntl.LOCK_NB)
        os.nice(10)
    gateway = Gateway()
    print('Word worker ready. One file at a time; drafts require review.', flush=True)
    while True:
        try:
            job = gateway.call('wordImportClaim').get('job')
            if job:
                Job(gateway, job).run()
        except Exception as exc:
            print('Word gateway unavailable: ' + type(exc).__name__, flush=True)
        if args.once:
            return
        time.sleep(15)


if __name__ == '__main__':
    main()
