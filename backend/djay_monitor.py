import threading
import time
import subprocess
import sys
import os
import json

class DjayMonitor:
    def __init__(self):
        self.current_tracks = {"decks": [], "error": None}
        self.running = False
        self.thread = None
        self.poll_interval = 2.0
        
        # When bundled by PyInstaller, sys.executable points to Contents/MacOS/backend_server
        if getattr(sys, 'frozen', False):
            # Find the djay_reader_bin next to the backend_server executable in the macOS bundle
            self.reader_bin = os.path.join(os.path.dirname(sys.executable), "djay_reader_bin")
            self.reader_src = None # Source is not bundled in prod
        else:
            self.backend_dir = os.path.dirname(os.path.abspath(__file__))
            self.reader_bin = os.path.join(self.backend_dir, "djay_reader_bin")
            self.reader_src = os.path.join(self.backend_dir, "djay_reader.swift")

    def _ensure_reader_compiled(self):
        # In frozen environments, we assume the binary is already bundled
        if getattr(sys, 'frozen', False):
            return
            
        if not os.path.exists(self.reader_bin):
            if self.reader_src and os.path.exists(self.reader_src):
                print("Compiling djay_reader.swift...")
                subprocess.run(["swiftc", self.reader_src, "-o", self.reader_bin], check=True)
            else:
                print("Error: djay_reader.swift not found")

    def start(self):
        if not self.running:
            self.running = True
            try:
                self._ensure_reader_compiled()
            except Exception as e:
                print(f"Failed to compile djay reader: {e}")
            self.thread = threading.Thread(target=self._monitor_loop, daemon=True)
            self.thread.start()

    def stop(self):
        self.running = False
        if self.thread:
            self.thread.join(timeout=1.0)

    def get_current_track(self):
        return self.current_tracks

    def _monitor_loop(self):
        while self.running:
            try:
                if os.path.exists(self.reader_bin):
                    res = subprocess.run([self.reader_bin], capture_output=True, text=True)
                    if res.stdout:
                        try:
                            data = json.loads(res.stdout.strip())
                            self.current_tracks = data
                        except json.JSONDecodeError:
                            self.current_tracks = {"decks": [], "error": "Invalid output from reader"}
            except Exception as e:
                print(f"DjayMonitor error: {e}")
            time.sleep(self.poll_interval)

djay_monitor_instance = DjayMonitor()
