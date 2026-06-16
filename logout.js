// /api/logout.js
// Revokes the refresh token at Google and clears the cookie.

function parseCookies(header) {
  const out = {};
  if (!header) return out;
  header.split(';').forEach(pair => {
    const idx = pair.indexOf('=');
    if (idx === -1) return;
    const k = pair.slice(0, idx).trim();
    const v = pair.slice(idx + 1).trim();
    out[k] = decodeURIComponent(v);
  });
  return out;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const cookies = parseCookies(req.headers.cookie);
  const refreshToken = cookies.gd_rt;

  if (refreshToken) {
    try {
      await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(refreshToken)}`, {
        method: 'POST',
      });
    } catch (err) {
      console.warn('Revoke failed (continuing anyway):', err.message);
    }
  }

  res.setHeader('Set-Cookie', 'gd_rt=; HttpOnly; Secure; SameSite=Lax; Path=/api/; Max-Age=0');
  return res.status(200).json({ ok: true });
}
