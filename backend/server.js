require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const express = require('express');
const cors = require('cors');
const { initDb } = require('./db/migrate');
const orderRoutes = require('./routes/order');
const leadRoutes = require('./routes/lead');
const taxOtpRoutes = require('./routes/taxotp');
const adminRoutes = require('./routes/admin');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: '1mb' }));

app.use('/api/order', orderRoutes);
app.use('/api/lead', leadRoutes);
app.use('/api/tax-otp', taxOtpRoutes);
app.use('/api/admin', adminRoutes);

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', version: '1.0.0', time: new Date().toISOString() });
});

initDb();

app.listen(PORT, '127.0.0.1', () => {
  console.log(`[AUTOBOT] Backend running on http://127.0.0.1:${PORT}`);
});
