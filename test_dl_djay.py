import requests

payload = {
  "url": "Paul Parsons Tengo Que Olvidar audio",
  "formats": ["mp3"],
  "djay_mode": True
}
try:
    res = requests.post("http://127.0.0.1:8001/api/djay/download", json=payload)
    data = res.json()
    job_id = data["job_id"]
    print("Job ID:", job_id)
    import time
    while True:
        status_res = requests.get(f"http://127.0.0.1:8001/api/download/{job_id}")
        status = status_res.json()
        print(status["status"], status.get("progress", ""))
        if status["status"] in ["completed", "error", "cancelled"]:
            print("Logs:", status.get("logs", []))
            break
        time.sleep(1)
except Exception as e:
    print("Error:", e)
