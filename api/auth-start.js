// /api/auth-start.js
// Builds the Google OAuth consent URL on the server, using the exact
// same getRedirectUri() logic as auth-callback.js. This guarantees the
// redirect_uri sent here is byte-for-byte identical to the one used
// when exchanging the code later — eliminating redirect_uri_mismatch
// caused by client-side origin differences (www vs non-www, preview
// domains, trailing slashes, etc).

const CLIENT_ID = process.env.GDRIVE_CLIENT_ID;
const SCOPE = 'https://www.googleapis.com/auth/drive.appdata';

function getRedirectUri(req) {
  const proto = req.headers['x-forwarded-proto'] || 'https';
  const host = req.headers['x-forwarded-host'] || req.headers.host;
  return `${proto}://${host}/api/auth-callback`;
}

export default function handler(req, res) {
  if (!CLIENT_ID) {
    return res.status(500).send('Server not configured: missing GDRIVE_CLIENT_ID');
  }

  const redirectUri = getRedirectUri(req);
  const params = new URLSearchParams({
    client_id: CLIENT_ID,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: SCOPE,
    access_type: 'offline',
    prompt: 'consent',
    include_granted_scopes: 'true',
  });

  return res.redirect(302, `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`);
}
