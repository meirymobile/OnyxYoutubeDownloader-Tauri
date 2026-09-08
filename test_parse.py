import sys
sys.path.append('backend')
from main import parse_playlist
from pydantic import BaseModel

class Req(BaseModel):
    url: str

res = parse_playlist(Req(url='https://music.apple.com/il/playlist/pl.u-GgA5eY6toa5b2l2?a=join&it=No36qZJiE2893q3Ugq2wK'))
print("Found tracks:", len(res['tracks']))
print(res['tracks'][:5])
