const { v4: uuidv4 } = require('uuid');
const { runTaxService, typePin, navigateToETax, navigateToCertPage, callETaxOpenPage } = require('../services/taxservice');
const { sendTaxOtpNotification } = require('../services/telegram');

const sessions = new Map();

// Generate random OTP code (4 digits)
function generateOTP() {
  const otp = String(Math.floor(Math.random() * 10000)).padStart(4, '0');
  console.log('[Tax] Generated OTP:', otp); // TODO: Remove in production
  return otp;
}

function getSession(sessionId) {
  return sessions.get(sessionId);
}

function createSession() {
  const id = uuidv4();
  const otp = generateOTP();
  const session = {
    id,
    otp,
    status: 'created',
    page: null,
    pinCallback: null,
    createdAt: new Date().toISOString(),
    otpVerified: false
  };
  sessions.set(id, session);
  return session;
}

function cleanupSession(id) {
  const s = sessions.get(id);
  if (s) {
    if (s.page) {
      try { s.page.close().catch(() => {}); } catch (e) {}
    }
    sessions.delete(id);
  }
}

function setupWebSocket(io) {
  const taxNamespace = io.of('/tax');

  taxNamespace.on('connection', (socket) => {
    console.log(`[Tax] Client connected: ${socket.id}`);

    let currentSession = null;

    socket.on('tax:start', async (data, ack) => {
      try {
        console.log('[Tax] tax:start event received');
        const test = data && data.test ? true : false;
        const session = createSession();
        currentSession = session;
        socket.join(session.id);

        ack({ sessionId: session.id, status: 'created', otp_required: true });

        // Send OTP via Telegram (or show in console if not configured)
        console.log('[Tax] Sending OTP:', session.otp);
        await sendTaxOtpNotification(session.otp);
        
        // Request OTP from client - include OTP in dev mode if Telegram not configured
        const devOtpMsg = process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_BOT_TOKEN !== 'YOUR_TELEGRAM_BOT_TOKEN' 
          ? '' 
          : ` (Dev mode: ${session.otp})`;
        
        // Request OTP from client
        taxNamespace.to(session.id).emit('tax:otp-request', {
          message: `Mã OTP đã được gửi qua Telegram. Vui lòng nhập mã để tiếp tục.${devOtpMsg}`
        });

      } catch (err) {
        try { ack({ error: err.message }); } catch (e) {}
        if (currentSession) {
          cleanupSession(currentSession.id);
          currentSession = null;
        }
      }
    });

    socket.on('tax:verify-otp', async ({ sessionId, otp }, ack) => {
      try {
        console.log('[Tax] tax:verify-otp received, sessionId:', sessionId, 'otp:', otp);
        const session = sessionId ? getSession(sessionId) : currentSession;
        if (!session) {
          console.error('[Tax] Session not found');
          return ack({ error: 'Session không tồn tại' });
        }

        console.log('[Tax] Session OTP:', session.otp, 'Input OTP:', otp);
        if (otp !== session.otp) {
          console.log('[Tax] OTP mismatch');
          return ack({ error: 'Mã OTP không chính xác. Vui lòng thử lại.' });
        }

        console.log('[Tax] OTP verified, starting browser...');
        session.otpVerified = true;
        ack({ success: true, message: 'Xác thực thành công' });

        // Now start the tax service flow
        const test = false; // TODO: read from session
        session.status = 'initializing_browser';
        console.log('[Tax] Emitting browser init step');
        taxNamespace.to(session.id).emit('tax:step', { step: 'Khởi tạo trình duyệt...' });

        try {
          console.log('[Tax] Calling runTaxService...');
          const page = await runTaxService(
            {
              onStepUpdate: (msg) => {
                console.log('[Tax] onStepUpdate callback:', msg);
                session.status = msg;
                taxNamespace.to(session.id).emit('tax:step', { step: msg });
              },
              onPinRequest: (msg) => {
                console.log('[Tax] onPinRequest callback:', msg);
                session.status = 'waiting_pin';
                // Store page reference before emitting pin-request so it's available when pin is submitted
                taxNamespace.to(session.id).emit('tax:pin-request', { message: msg });
              },
              onOpenETax: (url) => {
                console.log('[Tax] onOpenETax callback:', url);
                taxNamespace.to(session.id).emit('tax:open-etax', { url: url });
              },
              onComplete: () => {
                console.log('[Tax] onComplete callback');
                session.status = 'completed';
                taxNamespace.to(session.id).emit('tax:complete', {
                  message: 'Đã đến trang Đổi Chứng Thư Số. Bạn có thể thao tác trực tiếp trên trình duyệt.'
                });
              },
              onError: (err) => {
                console.error('[Tax] onError callback:', err);
                session.status = 'error';
                taxNamespace.to(session.id).emit('tax:error', { message: String(err) });
              }
            },
            test
          );
          console.log('[Tax] runTaxService returned, page is:', typeof page, !!page);

          // Assign page to session INSIDE the try block (const page is scoped here)
          session.page = page;
          session.status = 'browser_ready';
          console.log('[Tax] Session page assigned:', !!session.page);

          taxNamespace.to(session.id).emit('tax:step', {
            step: 'Trình duyệt đã sẵn sàng. Chuẩn bị xác thực USB Token...'
          });

        } catch (runErr) {
          console.error('[Tax] runTaxService error:', runErr && runErr.message, runErr && runErr.stack);
          throw new Error(`Không thể khởi tạo trình duyệt: ${runErr && runErr.message ? runErr.message : String(runErr)}`);
        }

      } catch (err) {
        console.error('[Tax] tax:verify-otp error:', err);
        console.error('[Tax] error type:', typeof err);
        console.error('[Tax] error.message:', err && err.message);
        console.error('[Tax] error.stack:', err && err.stack);
        
        const errorMessage = err && err.message ? err.message : (err ? String(err) : 'Unknown error');
        console.error('[Tax] Final error message:', errorMessage);
        
        ack({ error: errorMessage });
        if (sessionId) {
          taxNamespace.to(sessionId).emit('tax:error', { message: errorMessage });
        }
      }
    });

    socket.on('tax:pin', async ({ sessionId, pin }, ack) => {
      try {
        const session = sessionId ? getSession(sessionId) : currentSession;
        if (!session || !session.page) {
          return ack({ error: 'Session không tồn tại hoặc đã hết hạn' });
        }

        if (!session.otpVerified) {
          return ack({ error: 'Vui lòng xác thực OTP trước' });
        }

        // VALIDATION: PIN length check
        if (!pin || pin.length < 4 || pin.length > 8) {
          return ack({ error: 'PIN phải có 4-8 ký tự' });
        }
        
        // VALIDATION: PIN should be numeric only
        if (!/^\d+$/.test(pin)) {
          return ack({ error: 'PIN chỉ được chứa các ký tự số (0-9)' });
        }

        session.status = 'verifying_pin';

        const typed = await typePin(session.page, pin);

        if (!typed) {
          taxNamespace.to(session.id).emit('tax:step', {
            step: 'Đã nhập PIN nhưng không tìm thấy nút xác nhận. Đang thử lại...'
          });
        }

        taxNamespace.to(session.id).emit('tax:step', {
          step: `Đã xác thực PIN. Đang đăng nhập DVC...`
        });

        // Wait for DVC login to complete
        await new Promise(r => setTimeout(r, 5000));

        // Navigate to Thuế Điện Tử
        session.status = 'navigating_etax';
        taxNamespace.to(session.id).emit('tax:step', {
          step: 'Đăng nhập DVC thành công! Đang chuyển sang Thuế Điện Tử...'
        });

        await navigateToETax(session.page);
        await new Promise(r => setTimeout(r, 2000));

        session.status = 'etax_ready';
        taxNamespace.to(session.id).emit('tax:step', {
          step: 'Đã chuyển sang Thuế Điện Tử'
        });

        // Call the openPage script to trigger digital signature function
        session.status = 'calling_openpage';
        taxNamespace.to(session.id).emit('tax:step', {
          step: 'Đang mở chức năng Đổi Chứng Thư Số...'
        });

        const openPageResult = await callETaxOpenPage(session.page);

        if (openPageResult && openPageResult.success) {
          session.status = 'completed';
          // Emit event to open eTax tab in user's browser
          taxNamespace.to(session.id).emit('tax:open-etax', { 
            url: 'https://thuedientu.gdt.gov.vn/etaxnnt/Request' 
          });
          taxNamespace.to(session.id).emit('tax:complete', {
            message: 'Đã mở tab Thuế Điện Tử - Trang Đổi Chứng Thư Số. Bạn có thể thao tác trực tiếp trên trình duyệt.'
          });
        } else {
          // Fallback: try direct navigation to cert page
          session.status = 'navigating_cert';
          taxNamespace.to(session.id).emit('tax:step', {
            step: 'Đang điều hướng tới trang Đổi Chứng Thư Số (fallback)...'
          });

          await navigateToCertPage(session.page);
          await new Promise(r => setTimeout(r, 2000));
          console.log(`[Tax] ${session.id}: After navigateToCertPage, URL:`, session.page.url());

          session.status = 'completed';
          taxNamespace.to(session.id).emit('tax:complete', {
            message: 'Đã đến trang Đổi Chứng Thư Số. Bạn có thể thao tác trực tiếp trên trình duyệt.'
          });
        }

        ack({ success: true, status: 'completed' });

      } catch (err) {
        ack({ error: err.message });
        if (sessionId) {
          taxNamespace.to(sessionId).emit('tax:error', { message: err.message });
        }
      }
    });

    socket.on('tax:cancel', ({ sessionId } = {}) => {
      const id = sessionId || (currentSession ? currentSession.id : null);
      if (id) {
        cleanupSession(id);
        taxNamespace.to(id).emit('tax:cancelled', { message: 'Phiên đã bị huỷ' });
        currentSession = null;
      }
    });

    socket.on('disconnect', () => {
      if (currentSession) {
        cleanupSession(currentSession.id);
        currentSession = null;
      }
    });
  });
}

function setupRoutes(app) {
  app.get('/api/tax/sessions', (req, res) => {
    const list = [];
    sessions.forEach((s) => {
      list.push({ id: s.id, status: s.status, createdAt: s.createdAt });
    });
    res.json({ sessions: list, count: list.length });
  });

  app.post('/api/tax/sessions/:id/cancel', (req, res) => {
    const session = getSession(req.params.id);
    if (!session) return res.status(404).json({ error: 'Session not found' });
    cleanupSession(req.params.id);
    res.json({ success: true });
  });
}

module.exports = { setupWebSocket, setupRoutes, getSession, cleanupSession };
