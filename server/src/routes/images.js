import express from 'express';

const router = express.Router();

// GET /api/images/proxy?url=<encoded image URL>
router.get('/proxy', async (req, res) => {
  try {
    const rawUrl = String(req.query.url || '').trim();
    if (!rawUrl) {
      return res.status(400).json({ error: 'Missing url query parameter' });
    }

    let target;
    try {
      target = new URL(rawUrl);
    } catch {
      return res.status(400).json({ error: 'Invalid image URL' });
    }

    if (target.protocol !== 'http:' && target.protocol !== 'https:') {
      return res.status(400).json({ error: 'Only http/https URLs are allowed' });
    }

    const upstream = await fetch(target.toString(), {
      headers: {
        'User-Agent': 'FleetScoreImageProxy/1.0',
        'Accept': 'image/*,*/*;q=0.8',
      },
    });

    if (!upstream.ok) {
      return res.status(502).json({ error: `Upstream image request failed (${upstream.status})` });
    }

    const contentType = upstream.headers.get('content-type') || 'application/octet-stream';
    const cacheControl = upstream.headers.get('cache-control') || 'public, max-age=3600';

    const buffer = Buffer.from(await upstream.arrayBuffer());

    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', cacheControl);
    return res.status(200).send(buffer);
  } catch (error) {
    console.error('Image proxy error:', error);
    return res.status(500).json({ error: 'Failed to proxy image' });
  }
});

export default router;
