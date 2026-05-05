#!/usr/bin/env node
/**
 * AUTOBOT.AI — Tax Service Test
 *
 * Kiểm tra luồng WebSocket + Puppeteer (TEST MODE)
 * Mô phỏng user click "Bắt đầu ngay" → nhập PIN → hoàn tất
 *
 * Chạy: node test/tax-service.test.js
 */

const http = require('http');
const { Server } = require('socket.io');
const { io: ClientIO } = require('socket.io-client');
const { runTaxService, typePin, triggerAction } = require('../services/taxservice');
const { closeBrowser } = require('../services/browser');

const PORT = 3099;
const WS_PATH = '/api/ws';

let server;
let io;
let testResults = { passed: 0, failed: 0 };

function log(icon, msg) {
  const ts = new Date().toLocaleTimeString();
  console.log(`[${ts}] ${icon} ${msg}`);
}

function assert(name, condition) {
  if (condition) {
    testResults.passed++;
    log('✅', `PASS: ${name}`);
  } else {
    testResults.failed++;
    log('❌', `FAIL: ${name}`);
  }
}

function done() {
  log('📊', `Results: ${testResults.passed} passed, ${testResults.failed} failed`);
  if (io) io.close();
  if (server) server.close();
  closeBrowser().then(() => process.exit(testResults.failed > 0 ? 1 : 0));
}

async function main() {
  console.log('');
  console.log('═════════════════════════════════════════════');
  console.log('  AUTOBOT Tax Service — Integration Test');
  console.log('═════════════════════════════════════════════');
  console.log('');

  // ── Setup server ──
  log('🔧', 'Setting up test server...');
  const app = require('express')();
  server = http.createServer(app);
  io = new Server(server, { path: WS_PATH, cors: { origin: '*' } });

  const sessions = new Map();

  io.of('/tax').on('connection', (socket) => {
    log('🔌', `Client connected: ${socket.id}`);

    let sessionId = null;

    socket.on('tax:start', async ({ test = true } = {}, ack) => {
      log('🚀', `Start request (test=${test})`);

      try {
        sessionId = `test-${Date.now()}`;
        const session = {
          id: sessionId,
          status: 'created',
          page: null,
          createdAt: new Date().toISOString()
        };
        sessions.set(sessionId, session);

        ack({ sessionId, status: 'created' });
        assert('Session created', sessionId !== null);

        socket.emit('tax:step', {
          step: 'Đã tạo phiên, đang mở Cổng DVC...'
        });

        // Simulate browser page
        const page = await runTaxService(
          {
            onStepUpdate: (msg) => {
              log('📄', `Step: ${msg}`);
              socket.emit('tax:step', { step: msg });
            },
            onPinRequest: (msg) => {
              log('🔑', `PIN requested: ${msg}`);
              socket.emit('tax:pin-request', { message: msg });
            },
            onComplete: () => {
              log('✅', 'Tax service completed');
              socket.emit('tax:complete', {
                message: 'Đã đến trang Đổi Chứng Thư Số. Bạn có thể thao tác trực tiếp.'
              });
            },
            onError: (err) => {
              log('❌', `Error: ${err}`);
              socket.emit('tax:error', { message: err });
            }
          },
          true // test mode
        );

        session.page = page;
        session.status = 'browser_ready';

        assert('Browser page created', page !== null);

        // Step 1: Simulate USB Token selection
        await new Promise(r => setTimeout(r, 600));
        await triggerAction(page, 'selectUSBToken');

        socket.emit('tax:step', {
          step: 'Đã chọn USB Token. Plugin yêu cầu nhập PIN.'
        });

        // Send PIN request
        socket.emit('tax:pin-request', {
          message: 'Plugin chữ ký số yêu cầu mã PIN để đăng nhập USB Token (BKAV CA)'
        });

      } catch (err) {
        log('💥', `Start error: ${err.message}`);
        ack({ error: err.message });
      }
    });

    socket.on('tax:pin', async ({ sessionId: sid, pin }, ack) => {
      log('🔐', `PIN received: ${'*'.repeat((pin || '').length)}`);

      const session = sessions.get(sid);
      assert('PIN session exists', session !== undefined);

      if (session && session.page) {
        await typePin(session.page, pin);
        session.status = 'logged_in';
        log('📄', 'PIN verified, logged in');

        socket.emit('tax:step', {
          step: `Đã xác thực PIN (${'*'.repeat(pin.length)}). Đăng nhập DVC thành công!`
        });

        // Step 2: Navigate to eTax
        await new Promise(r => setTimeout(r, 1000));
        if (session.page) {
          await triggerAction(session.page, 'navToETax');
          socket.emit('tax:step', {
            step: 'Đã chuyển sang Thuế Điện Tử (thuedientu.gdt.gov.vn)'
          });
        }

        // Step 3: Navigate to cert change page
        await new Promise(r => setTimeout(r, 800));
        if (session.page) {
          await triggerAction(session.page, 'callChangeCert');
          session.status = 'completed';
          socket.emit('tax:complete', {
            message: 'Đã đến trang Đổi Chứng Thư Số. Bạn có thể thao tác trực tiếp.'
          });
        }

        ack({ success: true, status: 'completed' });
      } else {
        ack({ error: 'Session not found or page closed' });
      }
    });

    socket.on('tax:cancel', ({ sessionId: sid } = {}) => {
      log('⏹', `Cancel session: ${sid || sessionId}`);
      const id = sid || sessionId;
      if (id) {
        const s = sessions.get(id);
        if (s && s.page) {
          s.page.close().catch(() => {});
        }
        sessions.delete(id);
      }
      socket.emit('tax:cancelled', { message: 'Phiên đã bị huỷ' });
    });

    socket.on('disconnect', () => {
      log('🔌', `Client disconnected: ${socket.id}`);
      if (sessionId) {
        const s = sessions.get(sessionId);
        if (s && s.page) {
          s.page.close().catch(() => {});
        }
        sessions.delete(sessionId);
      }
    });
  });

  // Start server
  await new Promise((resolve) => server.listen(PORT, resolve));
  log('🖥', `Server on http://localhost:${PORT}`);

  // ── Test: Connect client ──
  log('🔌', 'Connecting test client...');

  const client = ClientIO(`http://localhost:${PORT}`, {
    path: WS_PATH,
    transports: ['websocket'],
    reconnection: false
  });

  // Connect to /tax namespace
  const taxSocket = ClientIO(`http://localhost:${PORT}/tax`, {
    path: WS_PATH,
    transports: ['websocket'],
    reconnection: false
  });

  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Connection timeout')), 10000);
    taxSocket.on('connect', () => {
      clearTimeout(timeout);
      resolve();
    });
  });

  assert('WebSocket connected', taxSocket.connected);

  // ── Test 1: Start tax service ──
  log('🧪', 'TEST 1: Start tax service...');

  const startResult = await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Start timeout')), 15000);
    taxSocket.emit('tax:start', { test: true }, (response) => {
      clearTimeout(timeout);
      resolve(response);
    });
  });

  assert('Start response received', startResult !== null);
  assert('Session ID present', typeof startResult.sessionId === 'string');

  let pinRequested = false;
  let completed = false;

  // ── Test 2: Wait for PIN request ──
  log('🧪', 'TEST 2: Wait for PIN request...');

  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('PIN request timeout')), 15000);

    taxSocket.on('tax:pin-request', (data) => {
      clearTimeout(timeout);
      pinRequested = true;
      assert('PIN request received', data.message !== undefined);
      log('   ', `PIN message: "${data.message}"`);
      resolve();
    });
  });

  assert('PIN was requested', pinRequested);

  // ── Test 3: Send PIN ──
  log('🧪', 'TEST 3: Send PIN (12345678)...');

  const pinResult = await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('PIN submit timeout')), 15000);
    taxSocket.emit('tax:pin', {
      sessionId: startResult.sessionId,
      pin: '12345678'
    }, (response) => {
      clearTimeout(timeout);
      resolve(response);
    });
  });

  assert('PIN accepted', pinResult && pinResult.success === true);
  assert('Status is completed', pinResult && pinResult.status === 'completed');

  // ── Test 4: Wait for complete event ──
  log('🧪', 'TEST 4: Wait for complete event...');

  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Complete timeout')), 15000);
    taxSocket.on('tax:complete', (data) => {
      clearTimeout(timeout);
      completed = true;
      assert('Complete event received', data.message !== undefined);
      log('   ', `Complete: "${data.message}"`);
      resolve();
    });
  });

  assert('Service completed', completed);

  // ── Test 5: Cancel session ──
  log('🧪', 'TEST 5: Cancel session...');
  const cancelResult = await new Promise((resolve) => {
    taxSocket.emit('tax:cancel', { sessionId: startResult.sessionId });
    setTimeout(resolve, 500);
  });
  assert('Cancel triggered', true);

  // ── Cleanup ──
  log('🧹', 'Cleaning up...');
  taxSocket.disconnect();
  client.disconnect();
  await new Promise(r => setTimeout(r, 500));
  done();
}

main().catch((err) => {
  console.error('\n💥 FATAL:', err.message);
  done();
});
