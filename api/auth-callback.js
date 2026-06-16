// /api/auth-callback.js
// Step 2 of OAuth Authorization Code flow.
// Google redirects here with ?code=... after the user approves access.
// We exchange that code for an access_token + refresh_token,
// store the refresh_token in a secure httpOnly cookie, and redirect
// the browser back to the app with the access_token in the URL hash
// (hash fragments never reach the server, so this is safe).

const CLIENT_ID = (process.env.GDRIVE_CLIENT_ID || '').trim();
const CLIENT_SECRET = (process.env.GDRIVE_CLIENT_SECRET || '').trim();

function getRedirectUri(req) {
  const proto = req.headers['x-forwarded-proto'] || 'https';
  const host = req.headers['x-forwarded-host'] || req.headers.host;
  return `${proto}://${host}/api/auth-callback`;
}

export default async function handler(req, res) {
  const { code, error, state } = req.query;
  const redirectUri = getRedirectUri(req);
  const appUrl = `https://${req.headers['x-forwarded-host'] || req.headers.host}/`;

  if (error) {
    return res.redirect(302, `${appUrl}#auth_error=${encodeURIComponent(error)}`);
  }
  if (!code) {
    return res.status(400).send('Missing authorization code');
  }
  if (!CLIENT_ID || !CLIENT_SECRET) {
    console.error('Missing env vars. CLIENT_ID present:', !!CLIENT_ID, 'CLIENT_SECRET present:', !!CLIENT_SECRET);
    return res.status(500).send('Server not configured: missing GDRIVE_CLIENT_ID / GDRIVE_CLIENT_SECRET');
  }
  // Diagnostic: log lengths only (never log the actual secret value)
  console.log('auth-callback: client_id length=', CLIENT_ID.length, 'client_secret length=', CLIENT_SECRET.length, 'redirect_uri=', redirectUri);

  try {
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
      }),
    });

    const tokens = await tokenRes.json();

    if (!tokenRes.ok || tokens.error) {
      console.error('Token exchange failed. HTTP status:', tokenRes.status, 'Full response:', JSON.stringify(tokens));
      return res.redirect(302, `${appUrl}#auth_error=${encodeURIComponent(tokens.error || 'token_exchange_failed')}`);
    }

    const { access_token, refresh_token, expires_in } = tokens;

    // Store refresh_token in a secure httpOnly cookie — never exposed to JS.
    // encodeURIComponent because Google refresh tokens often contain
    // characters like '/' '+' '=' that aren't safe raw in a Set-Cookie value.
    const cookies = [];
    if (refresh_token) {
      cookies.push(
        `gd_rt=${encodeURIComponent(refresh_token)}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${60 * 60 * 24 * 180}`
      );
    }
    if (cookies.length) res.setHeader('Set-Cookie', cookies);

    // Pass the short-lived access_token back via URL hash (fragment),
    // which browsers never send to servers, then JS picks it up and
    // strips it immediately.
    return res.redirect(
      302,
      `${appUrl}#access_token=${encodeURIComponent(access_token)}&expires_in=${expires_in}`
    );
  } catch (err) {
    console.error('auth-callback error:', err);
    return res.redirect(302, `${appUrl}#auth_error=server_error`);
  }
}
