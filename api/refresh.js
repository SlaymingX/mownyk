// /api/refresh.js
// Called by the frontend on page load (and whenever the access_token
// expires) to silently get a new access_token using the refresh_token
// stored in the httpOnly cookie. No popup, no redirect — just a fetch.

const CLIENT_ID = process.env.GDRIVE_CLIENT_ID;
const CLIENT_SECRET = process.env.GDRIVE_CLIENT_SECRET;

function parseCookies(header) {
  const out = {};
  if (!header) return out;
  header.split(';').forEach(pair => {
    const idx = pair.indexOf('=');
    if (idx === -1) return;
    const k = pair.slice(0, idx).trim();
    const v = pair.slice(idx + 1).trim();
    try { out[k] = decodeURIComponent(v); } catch (e) { out[k] = v; }
  });
  return out;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const cookies = parseCookies(req.headers.cookie);
  const refreshToken = cookies.gd_rt;

  if (!refreshToken) {
    console.warn('refresh.js: no gd_rt cookie found. Raw cookie header:', req.headers.cookie || '(none)');
    return res.status(401).json({ error: 'no_refresh_token' });
  }
  if (!CLIENT_ID || !CLIENT_SECRET) {
    return res.status(500).json({ error: 'server_not_configured' });
  }

  try {
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        refresh_token: refreshToken,
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
        grant_type: 'refresh_token',
      }),
    });

    const tokens = await tokenRes.json();

    if (!tokenRes.ok || tokens.error) {
      console.error('Refresh failed:', tokens);
      // If Google says the refresh token itself is invalid/revoked,
      // clear the cookie so we don't keep retrying with a dead token.
      if (tokens.error === 'invalid_grant') {
        res.setHeader('Set-Cookie', 'gd_rt=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0');
      }
      return res.status(401).json({ error: tokens.error || 'refresh_failed' });
    }

    return res.status(200).json({
      access_token: tokens.access_token,
      expires_in: tokens.expires_in,
    });
  } catch (err) {
    console.error('refresh.js error:', err);
    return res.status(500).json({ error: 'server_error' });
  }
}
