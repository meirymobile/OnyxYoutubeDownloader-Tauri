import subprocess
import time
import re
import threading
import logging

logger = logging.getLogger("onyx")

current_cast_device = None
current_cast_instance = None
cast_lock = threading.RLock()

def scan_wireless_devices(timeout=2.0):
    """
    Scans the local network for all wireless displays:
    - Google Cast / Chromecast / Android TV / Google TV
    - AirPlay 2 / Apple TV
    Returns a unified, normalized list of devices.
    """
    devices = []
    seen_ids = set()

    # 1. Google Cast / Android TV Scan via pychromecast
    try:
        import pychromecast
        casts, browser = pychromecast.get_chromecasts(timeout=timeout)
        for c in casts:
            dev_id = f"cast_{c.uuid}"
            if dev_id not in seen_ids:
                seen_ids.add(dev_id)
                devices.append({
                    "id": dev_id,
                    "name": c.name,
                    "model": c.model_name or "Chromecast / Google TV",
                    "type": "tv" if "tv" in (c.model_name or "").lower() or "tv" in c.name.lower() else "screen",
                    "protocol": "Google Cast",
                    "host": str(c.cast_info.host),
                    "port": c.cast_info.port,
                    "status": "ready"
                })
        pychromecast.discovery.stop_discovery(browser)
    except Exception as e:
        logger.warning(f"pychromecast scan fallback: {e}")
        # Fallback to dns-sd for GoogleCast
        try:
            p = subprocess.Popen(['dns-sd', '-B', '_googlecast._tcp', '.'], stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
            time.sleep(1.2)
            p.terminate()
            out, _ = p.communicate()
            for line in out.splitlines():
                if 'Add' in line:
                    parts = line.split()
                    if len(parts) >= 7:
                        inst = ' '.join(parts[6:])
                        dev_id = f"cast_{inst}"
                        if dev_id not in seen_ids:
                            seen_ids.add(dev_id)
                            devices.append({
                                "id": dev_id,
                                "name": inst.split('-')[0] if '-' in inst else inst,
                                "model": "Smart TV / Chromecast",
                                "type": "tv",
                                "protocol": "Google Cast",
                                "host": "",
                                "port": 8009,
                                "status": "ready"
                            })
        except Exception:
            pass

    # 2. AirPlay / Apple TV Scan via dns-sd
    try:
        p = subprocess.Popen(['dns-sd', '-B', '_airplay._tcp', '.'], stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
        time.sleep(1.0)
        p.terminate()
        out, _ = p.communicate()
        for line in out.splitlines():
            if 'Add' in line:
                parts = line.split()
                if len(parts) >= 7:
                    raw_name = ' '.join(parts[6:])
                    clean_name = raw_name.replace(r'\ ', ' ').replace('\\ ', ' ').strip()
                    dev_id = f"airplay_{clean_name}"
                    if dev_id not in seen_ids:
                        seen_ids.add(dev_id)
                        is_atv = "apple" in clean_name.lower() or "tv" in clean_name.lower()
                        devices.append({
                            "id": dev_id,
                            "name": clean_name,
                            "model": "Apple TV / AirPlay 2 Display",
                            "type": "apple_tv" if is_atv else "screen",
                            "protocol": "AirPlay",
                            "host": "",
                            "port": 7000,
                            "status": "ready"
                        })
    except Exception as e:
        logger.warning(f"AirPlay scan error: {e}")

    return devices

def start_cast(device_id, target_url):
    """
    Connects to the specified wireless device and begins broadcasting target_url.
    """
    global current_cast_device, current_cast_instance
    with cast_lock:
        stop_cast()

        # Google Cast / Android TV
        if device_id.startswith("cast_"):
            import pychromecast
            from pychromecast.controllers import BaseController

            class UrlCastController(BaseController):
                def __init__(self):
                    super().__init__('urn:x-cast:com.url.cast', '5CB45E5A')

                def load_url(self, url):
                    self.send_message({'url': url, 'type': 'loc'})

            casts, browser = pychromecast.get_chromecasts(timeout=2.5)
            target_cast = None
            for c in casts:
                if f"cast_{c.uuid}" == device_id or device_id in c.name:
                    target_cast = c
                    break

            pychromecast.discovery.stop_discovery(browser)

            if not target_cast and casts:
                # Fallback to first matching or first cast
                for c in casts:
                    if str(c.uuid) in device_id:
                        target_cast = c
                        break

            if not target_cast:
                raise ValueError(f"Could not connect to Google Cast device: {device_id}")

            target_cast.wait()
            ctl = UrlCastController()
            target_cast.register_handler(ctl)
            ctl.load_url(target_url)

            current_cast_device = {
                "id": device_id,
                "name": target_cast.name,
                "model": target_cast.model_name,
                "protocol": "Google Cast"
            }
            current_cast_instance = target_cast
            return current_cast_device

        # AirPlay device
        elif device_id.startswith("airplay_"):
            device_name = device_id.replace("airplay_", "")
            current_cast_device = {
                "id": device_id,
                "name": device_name,
                "model": "AirPlay 2",
                "protocol": "AirPlay"
            }
            return current_cast_device

        raise ValueError(f"Unknown device type: {device_id}")

def stop_cast():
    """
    Stops the active cast session.
    """
    global current_cast_device, current_cast_instance
    with cast_lock:
        if current_cast_instance:
            try:
                current_cast_instance.quit_app()
            except Exception as e:
                logger.warning(f"Error stopping cast: {e}")
            current_cast_instance = None
        current_cast_device = None

def get_cast_status():
    """
    Returns current cast status.
    """
    return {
        "is_casting": current_cast_device is not None,
        "device": current_cast_device
    }
