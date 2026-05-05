require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const http = require('http');
const express = require('express');
const cors = require('cors');
const { Server } = require('socket.io');
const { initDb } = require('./db/migrate');
const orderRoutes = require('./routes/order');
const leadRoutes = require('./routes/lead');
const taxOtpRoutes = require('./routes/taxotp');
const adminRoutes = require('./routes/admin');
const { setupWebSocket, setupRoutes: setupTaxRoutes } = require('./routes/tax-browser');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  path: '/api/ws',
  cors: { origin: '*' },
  pingTimeout: 60000,
  pingInterval: 25000
});

const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: '1mb' }));

app.use('/api/order', orderRoutes);
app.use('/api/lead', leadRoutes);
app.use('/api/tax-otp', taxOtpRoutes);
app.use('/api/admin', adminRoutes);

setupTaxRoutes(app);
setupWebSocket(io);

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', version: '2.0.0', time: new Date().toISOString() });
});

initDb();

server.listen(PORT, '127.0.0.1', () => {
  console.log(`[AUTOBOT] Backend running on http://127.0.0.1:${PORT}`);
  console.log(`[AUTOBOT] WebSocket on /api/ws`);
});
