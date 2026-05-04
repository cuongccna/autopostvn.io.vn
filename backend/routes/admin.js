const express = require('express');
const { getDb } = require('../db/migrate');
const { adminAuth } = require('../middleware/auth');
const { getPresignedUrl, deleteFile } = require('../services/minio');

const router = express.Router();

router.get('/health', adminAuth, (_req, res) => {
  res.json({ auth: 'ok' });
});

router.get('/orders', adminAuth, (req, res) => {
  try {
    const db = getDb();
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 50;
    const offset = (page - 1) * limit;
    const status = req.query.status;

    let query = 'SELECT * FROM orders';
    let countQuery = 'SELECT COUNT(*) as total FROM orders';
    const params = {};

    if (status) {
      query += ' WHERE status = @status';
      countQuery += ' WHERE status = @status';
      params.status = status;
    }

    query += ' ORDER BY created_at DESC LIMIT @limit OFFSET @offset';
    params.limit = limit;
    params.offset = offset;

    const orders = db.prepare(query).all(params);
    const { total } = db.prepare(countQuery).all(status ? { status } : {})[0];

    res.json({ orders, pagination: { page, limit, total, pages: Math.ceil(total / limit) } });
  } catch (err) {
    console.error('[Admin] Error:', err);
    res.status(500).json({ error: 'Lỗi máy chủ' });
  }
});

router.get('/orders/:id', adminAuth, (req, res) => {
  try {
    const db = getDb();
    const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(req.params.id);
    if (!order) return res.status(404).json({ error: 'Không tìm thấy đơn hàng' });
    res.json(order);
  } catch (err) {
    res.status(500).json({ error: 'Lỗi máy chủ' });
  }
});

router.patch('/orders/:id/status', adminAuth, (req, res) => {
  try {
    const db = getDb();
    const { status } = req.body;
    const validStatuses = ['new', 'confirmed', 'paid', 'activated', 'rejected'];

    if (!validStatuses.includes(status)) {
      return res.status(400).json({ error: 'Trạng thái không hợp lệ' });
    }

    const result = db.prepare(
      'UPDATE orders SET status = ?, updated_at = datetime(\'now\') WHERE id = ?'
    ).run(status, req.params.id);

    if (result.changes === 0) {
      return res.status(404).json({ error: 'Không tìm thấy đơn hàng' });
    }

    res.json({ success: true, status });
  } catch (err) {
    res.status(500).json({ error: 'Lỗi máy chủ' });
  }
});

router.get('/orders/:id/file', adminAuth, async (req, res) => {
  try {
    const db = getDb();
    const order = db.prepare('SELECT file_key, file_name FROM orders WHERE id = ?').get(req.params.id);
    if (!order || !order.file_key) {
      return res.status(404).json({ error: 'Không tìm thấy file' });
    }

    const url = await getPresignedUrl(order.file_key, 900);
    if (!url) return res.status(404).json({ error: 'File không tồn tại trong storage' });

    res.json({ url, file_name: order.file_name, expires_in: 900 });
  } catch (err) {
    console.error('[Admin] File error:', err);
    res.status(500).json({ error: 'Lỗi máy chủ' });
  }
});

router.get('/leads', adminAuth, (req, res) => {
  try {
    const db = getDb();
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 50;
    const offset = (page - 1) * limit;

    const leads = db.prepare(
      'SELECT * FROM leads ORDER BY created_at DESC LIMIT ? OFFSET ?'
    ).all(limit, offset);
    const { total } = db.prepare('SELECT COUNT(*) as total FROM leads').get();

    res.json({ leads, pagination: { page, limit, total, pages: Math.ceil(total / limit) } });
  } catch (err) {
    res.status(500).json({ error: 'Lỗi máy chủ' });
  }
});

module.exports = router;
