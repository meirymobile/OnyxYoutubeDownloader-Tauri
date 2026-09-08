import yt_dlp
ydl_opts = {'quiet': True}
with yt_dlp.YoutubeDL(ydl_opts) as ydl:
    info = ydl.extract_info("ytsearch1:test", download=False)
    print("KEYS:", info.keys())
    try:
        filename = ydl.prepare_filename(info)
        print("FILENAME:", filename)
    except Exception as e:
        print("ERROR:", e)
