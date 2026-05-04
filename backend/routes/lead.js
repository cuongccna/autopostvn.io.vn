const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { getDb } = require('../db/migrate');
const { sendLeadNotification } = require('../services/telegram');
const { sendLeadEmail } = require('../services/resend');

const router = express.Router();

router.post('/', async (req, res) => {
  try {
    const { name, phone, email, company, type, interest } = req.body;

    if (!name || !phone) {
      return res.status(400).json({ error: 'Vui lòng nhập họ tên và số điện thoại' });
    }

    const id = uuidv4();
    const now = new Date().toISOString();

    const leadData = {
      id, name, phone,
      email: email || '',
      company: company || '',
      type: type || '',
      interest: interest || '',
      created_at: now
    };

    const db = getDb();
    db.prepare(`
      INSERT INTO leads (id, name, phone, email, company, type, interest, created_at)
      VALUES (@id, @name, @phone, @email, @company, @type, @interest, @created_at)
    `).run(leadData);

    sendLeadNotification(leadData).catch(() => {});
    sendLeadEmail(leadData).catch(() => {});

    console.log(`[Lead] #${id} — ${name} (${phone})`);
    res.json({ success: true, id });
  } catch (err) {
    console.error('[Lead] Error:', err);
    res.status(500).json({ error: 'Lỗi máy chủ, vui lòng thử lại sau' });
  }
});

module.exports = router;
