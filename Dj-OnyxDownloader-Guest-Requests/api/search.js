export default async function handler(req, res) {
  // Set open CORS headers so mobile browsers / PWA can fetch smoothly
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
  );
  res.setHeader('Cache-Control', 's-maxage=120, stale-while-revalidate=300');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const query = (req.query?.q || req.query?.term || '').trim();
  if (!query) {
    return res.status(200).json({ results: [] });
  }

  // 1. Direct YouTube link pasted by guest
  if (query.includes('youtube.com') || query.includes('youtu.be')) {
    try {
      const oembedRes = await fetch(`https://noembed.com/embed?url=${encodeURIComponent(query)}`);
      if (oembedRes.ok) {
        const oembedData = await oembedRes.json();
        if (oembedData && oembedData.title) {
          return res.status(200).json({
            results: [{
              id: query,
              url: query,
              title: oembedData.title,
              channel: oembedData.author_name || 'YouTube',
              thumbnail: oembedData.thumbnail_url || 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=300',
              duration: ''
            }]
          });
        }
      }
    } catch (e) {
      console.warn('oEmbed parse error:', e);
    }
  }

  // 2. High-speed YouTube Innertube Search (Primary Engine)
  try {
    const ytPayload = {
      context: {
        client: {
          clientName: 'WEB',
          clientVersion: '2.20231201.00.00',
          hl: 'he',
          gl: 'IL'
        }
      },
      query: query
    };

    const ytRes = await fetch('https://www.youtube.com/youtubei/v1/search?prettyPrint=false', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      },
      body: JSON.stringify(ytPayload)
    });

    if (ytRes.ok) {
      const ytData = await ytRes.json();
      const sections = ytData?.contents?.twoColumnSearchResultsRenderer?.primaryContents?.sectionListRenderer?.contents || [];
      const items = [];

      for (const sec of sections) {
        const contents = sec?.itemSectionRenderer?.contents || [];
        for (const item of contents) {
          if (item.videoRenderer) {
            const vr = item.videoRenderer;
            const videoId = vr.videoId;
            if (!videoId) continue;

            const title = vr.title?.runs?.map(r => r.text).join('') || vr.title?.simpleText || '';
            const channel = vr.ownerText?.runs?.map(r => r.text).join('') || vr.shortBylineText?.runs?.map(r => r.text).join('') || 'YouTube';
            const thumbs = vr.thumbnail?.thumbnails || [];
            const thumb = (thumbs.length > 0 ? thumbs[thumbs.length - 1].url : '') || `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
            const duration = vr.lengthText?.simpleText || '';

            items.push({
              id: videoId,
              url: `https://www.youtube.com/watch?v=${videoId}`,
              title: title.trim(),
              channel: channel.trim(),
              thumbnail: thumb,
              duration: duration.trim()
            });

            if (items.length >= 20) break;
          }
        }
        if (items.length >= 20) break;
      }

      if (items.length > 0) {
        return res.status(200).json({ results: items });
      }
    }
  } catch (ytErr) {
    console.error('YouTube Innertube error:', ytErr);
  }

  // 3. Fallback: Apple iTunes API (proxy via server side, avoids iOS attachment/CORS blocking)
  try {
    const itunesRes = await fetch(`https://itunes.apple.com/search?term=${encodeURIComponent(query)}&media=music&entity=song&limit=15&country=IL`);
    if (itunesRes.ok) {
      const itunesData = await itunesRes.json();
      if (itunesData && itunesData.results && itunesData.results.length > 0) {
        const items = itunesData.results.map(t => ({
          id: String(t.trackId),
          url: `ytsearch1:${t.artistName} ${t.trackName}`,
          title: `${t.artistName} - ${t.trackName}`,
          channel: t.collectionName || t.artistName,
          thumbnail: t.artworkUrl100 ? t.artworkUrl100.replace('100x100bb', '300x300bb') : 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=300',
          duration: ''
        }));
        return res.status(200).json({ results: items });
      }
    }
  } catch (itunesErr) {
    console.error('iTunes fallback error:', itunesErr);
  }

  // 4. Return empty results if nothing found
  return res.status(200).json({ results: [] });
}
