const { verifySessionToken } = require('./session');

// Every Famban route sits behind a logged-in session - this is a private
// family app, not a public read surface. See auth/ for how sessions are
// issued (Google sign-in, checked against an active famban-users record).
function requireSession(req, res, next) {
  const header = req.header('authorization') || '';
  const [scheme, token] = header.split(' ');

  if (scheme !== 'Bearer' || !token) {
    return res.status(401).json({
      error: 'UNAUTHORIZED',
      message: 'Missing or invalid Authorization header',
    });
  }

  try {
    req.fambanUser = verifySessionToken(token);
    return next();
  } catch (err) {
    return res.status(err.status || 401).json({
      error: err.code || 'UNAUTHORIZED',
      message: err.message || 'Invalid or expired session',
    });
  }
}

module.exports = { requireSession };
