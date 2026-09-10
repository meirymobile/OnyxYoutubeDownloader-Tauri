import requests
import time

payload = {
  "url": "Paul Parsons Tengo Que Olvidar audio",
  "formats": ["mp3"],
  "djay_mode": True
}
res = requests.post("http://127.0.0.1:8001/api/djay/download", json=payload)
job_id = res.json()["job_id"]
while True:
    st = requests.get(f"http://127.0.0.1:8001/api/download/{job_id}").json()
    if st["status"] == "completed":
        print("RESULT FILE:", st.get("result_file"))
        print("RESULT DIR:", st.get("result_dir"))
        break
    elif st["status"] in ["error", "cancelled"]:
        print("ERROR:", st)
        break
    time.sleep(1)
