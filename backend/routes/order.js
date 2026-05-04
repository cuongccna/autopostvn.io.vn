const express = require('express');
const multer = require('multer');
const { v4: uuidv4 } = require('uuid');
const { getDb } = require('../db/migrate');
const { uploadFile } = require('../services/minio');
const { sendOrderNotification } = require('../services/telegram');
const { sendOrderEmail } = require('../services/resend');

const router = express.Router();

const ALLOWED_TYPES = ['application/pdf', 'image/jpeg', 'image/png'];
const MAX_FILE_SIZE = 10 * 1024 * 1024;

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_SIZE },
  fileFilter: (_req, file, cb) => {
    if (ALLOWED_TYPES.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Chỉ chấp nhận file PDF, JPG, PNG'));
    }
  }
});

router.post('/', upload.single('gpkd'), async (req, res) => {
  try {
    const { mst, company, address, name, phone, email, note, pkg, price } = req.body;

    if (!mst || !company || !address || !name || !phone || !email) {
      return res.status(400).json({ error: 'Vui lòng điền đầy đủ các trường bắt buộc' });
    }
    if (!req.file) {
      return res.status(400).json({ error: 'Vui lòng đính kèm Giấy phép kinh doanh' });
    }

    const id = uuidv4();
    const now = new Date().toISOString();

    let fileKey = null;
    try {
      fileKey = await uploadFile(req.file.buffer, req.file.originalname, req.file.mimetype);
    } catch (err) {
      console.error('[Order] MinIO upload failed:', err.message);
    }

    const orderData = {
      id, mst, company, address,
      contact_name: name,
      phone, email,
      note: note || '',
      package_name: pkg || 'Gói Năm',
      package_price: price || '668.000đ',
      file_name: req.file.originalname,
      file_key: fileKey,
      file_size: req.file.size,
      created_at: now
    };

    const db = getDb();
    db.prepare(`
      INSERT INTO orders (id, mst, company, address, contact_name, phone, email, note, package_name, package_price, file_name, file_key, file_size, status, created_at, updated_at)
      VALUES (@id, @mst, @company, @address, @contact_name, @phone, @email, @note, @package_name, @package_price, @file_name, @file_key, @file_size, 'new', @created_at, @created_at)
    `).run(orderData);

    sendOrderNotification(orderData).catch(() => {});
    sendOrderEmail(orderData).catch(() => {});

    console.log(`[Order] #${id} — ${company} (${pkg || 'N/A'})`);
    res.json({ success: true, id, message: 'Đặt hàng thành công!' });
  } catch (err) {
    console.error('[Order] Error:', err);
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ error: 'File quá lớn, tối đa 10MB' });
    }
    if (err.message === 'Chỉ chấp nhận file PDF, JPG, PNG') {
      return res.status(400).json({ error: err.message });
    }
    res.status(500).json({ error: 'Lỗi máy chủ, vui lòng thử lại sau' });
  }
});

module.exports = router;
