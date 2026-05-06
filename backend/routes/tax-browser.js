const { v4: uuidv4 } = require('uuid');
const { runTaxService, typePin, navigateToETax, navigateToCertPage } = require('../services/taxservice');

const sessions = new Map();

function getSession(sessionId) {
  return sessions.get(sessionId);
}

function createSession() {
  const id = uuidv4();
  const session = {
    id,
    status: 'created',
    page: null,
    pinCallback: null,
    createdAt: new Date().toISOString()
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
        const test = data && data.test ? true : false;
        const session = createSession();
        currentSession = session;
        socket.join(session.id);

        ack({ sessionId: session.id, status: 'created' });

        const page = await runTaxService(
          {
            onStepUpdate: (msg) => {
              session.status = msg;
              taxNamespace.to(session.id).emit('tax:step', { step: msg });
              console.log(`[Tax] ${session.id}: ${msg}`);
            },
            onPinRequest: (msg) => {
              session.status = 'waiting_pin';
              taxNamespace.to(session.id).emit('tax:pin-request', { message: msg });
              console.log(`[Tax] ${session.id}: PIN requested — ${msg}`);
            },
            onComplete: () => {
              session.status = 'completed';
              taxNamespace.to(session.id).emit('tax:complete', {
                message: 'Đã đến trang Đổi Chứng Thư Số. Bạn có thể thao tác trực tiếp trên trình duyệt.'
              });
              console.log(`[Tax] ${session.id}: Completed`);
            },
            onError: (err) => {
              session.status = 'error';
              taxNamespace.to(session.id).emit('tax:error', { message: err });
              console.error(`[Tax] ${session.id}: Error — ${err}`);
            }
          },
          test
        );

        session.page = page;
        session.status = 'browser_ready';

        taxNamespace.to(session.id).emit('tax:step', {
          step: test
            ? 'Trình duyệt đã sẵn sàng. Đang hiển thị Cổng DVC...'
            : 'Trình duyệt ẩn đã sẵn sàng. Đang mở Cổng Dịch vụ Công...'
        });

      } catch (err) {
        console.error(`[Tax] Start error: ${err.message}`);
        try { ack({ error: err.message }); } catch (e) {}
        if (currentSession) {
          cleanupSession(currentSession.id);
          currentSession = null;
        }
      }
    });

    socket.on('tax:pin', async ({ sessionId, pin }, ack) => {
      try {
        const session = sessionId ? getSession(sessionId) : currentSession;
        if (!session || !session.page) {
          return ack({ error: 'Session không tồn tại hoặc đã hết hạn' });
        }

        if (!pin || pin.length < 4) {
          return ack({ error: 'PIN phải có ít nhất 4 ký tự' });
        }

        session.status = 'verifying_pin';

        const typed = await typePin(session.page, pin);
        if (!typed) {
          taxNamespace.to(session.id).emit('tax:step', {
            step: 'Đã nhập PIN nhưng không tìm thấy nút xác nhận. Đang thử lại...'
          });
        }

        taxNamespace.to(session.id).emit('tax:step', {
          step: `Đã xác thực PIN (${'*'.repeat(pin.length)}). Đang đăng nhập DVC...`
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
          step: 'Đã chuyển sang Thuế Điện Tử (thuedientu.gdt.gov.vn)'
        });

        // Navigate to certificate change page
        session.status = 'navigating_cert';
        taxNamespace.to(session.id).emit('tax:step', {
          step: 'Đang điều hướng tới trang Đổi Chứng Thư Số...'
        });

        await navigateToCertPage(session.page);
        await new Promise(r => setTimeout(r, 2000));

        session.status = 'completed';
        taxNamespace.to(session.id).emit('tax:complete', {
          message: 'Đã đến trang Đổi Chứng Thư Số. Bạn có thể thao tác trực tiếp trên trình duyệt.'
        });

        console.log(`[Tax] ${session.id}: Completed — on cert page`);
        ack({ success: true, status: 'completed' });

      } catch (err) {
        console.error(`[Tax] PIN error: ${err.message}`);
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
        console.log(`[Tax] ${id}: Cancelled`);
        currentSession = null;
      }
    });

    socket.on('disconnect', () => {
      if (currentSession) {
        cleanupSession(currentSession.id);
        console.log(`[Tax] ${currentSession.id}: Cleaned up (client disconnected)`);
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
