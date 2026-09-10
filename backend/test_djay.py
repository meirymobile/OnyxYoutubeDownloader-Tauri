from djay_monitor import DjayMonitor
import time

m = DjayMonitor()
m.start()
time.sleep(3)
print(m.get_current_track())
m.stop()
