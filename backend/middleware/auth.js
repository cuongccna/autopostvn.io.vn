const ADMIN_TOKEN = process.env.ADMIN_TOKEN;

function adminAuth(req, res, next) {
  const token = req.headers['x-admin-token'] || req.query.token;

  if (!ADMIN_TOKEN || ADMIN_TOKEN === 'thay_bang_token_ngau_nhien_64_ky_tu') {
    return res.status(500).json({ error: 'ADMIN_TOKEN not configured' });
  }

  if (token !== ADMIN_TOKEN) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  next();
}

module.exports = { adminAuth };
