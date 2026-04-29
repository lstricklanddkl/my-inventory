const { google } = require('googleapis');
const jwt = require('jsonwebtoken');

function buildOAuthClient() {
  return new google.auth.OAuth2(
    process.env.GOOGLE_OAUTH_CLIENT_ID,
    process.env.GOOGLE_OAUTH_CLIENT_SECRET,
    process.env.GOOGLE_OAUTH_REDIRECT_URI
  );
}

function isAllowed(email) {
  const lower   = email.toLowerCase();
  const domain  = lower.split('@')[1];

  const emails  = (process.env.ALLOWED_EMAILS  || '').split(',').map(e => e.trim().toLowerCase()).filter(Boolean);
  const domains = (process.env.ALLOWED_DOMAINS || '').split(',').map(d => d.trim().toLowerCase()).filter(Boolean);

  if (!emails.length && !domains.length) return false; // deny all if unconfigured

  return emails.includes(lower) || domains.includes(domain);
}

function getAuthUrl() {
  return buildOAuthClient().generateAuthUrl({
    access_type: 'online',
    scope: [
      'https://www.googleapis.com/auth/userinfo.email',
      'https://www.googleapis.com/auth/userinfo.profile',
    ],
    prompt: 'select_account',
  });
}

async function handleCallback(code) {
  const client = buildOAuthClient();
  const { tokens } = await client.getToken(code);
  client.setCredentials(tokens);

  const oauth2 = google.oauth2({ version: 'v2', auth: client });
  const { data: user } = await oauth2.userinfo.get();

  if (!isAllowed(user.email)) {
    const err = new Error(`Access denied for ${user.email}`);
    err.status = 403;
    throw err;
  }

  return jwt.sign(
    { email: user.email, name: user.name, picture: user.picture },
    process.env.JWT_SECRET,
    { expiresIn: '7d' }
  );
}

function requireAuth(req, res, next) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  try {
    req.user = jwt.verify(header.slice(7), process.env.JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: 'Token expired or invalid' });
  }
}

module.exports = { getAuthUrl, handleCallback, requireAuth };
