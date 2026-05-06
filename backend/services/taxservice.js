/**
 * DVC Tax Service Automation
 *
 * Luồng thực tế (headless, không hiển thị):
 * 1. Mở dichvucong.gov.vn trong headless browser
 * 2. Tìm & click "Đăng nhập" → chọn "USB Token" / "Tài khoản DVCQG"
 * 3. Phát hiện popup/iframe yêu cầu PIN → gửi WebSocket cho user
 * 4. User nhập PIN → backend điền PIN, submit
 * 5. Đăng nhập thành công → điều hướng sang thuedientu.gdt.gov.vn
 * 6. Điều hướng tới trang Đổi Chứng Thư Số
 * 7. Hoàn tất — browser ở trạng thái sẵn sàng
 */

const { newPage } = require('./browser');

const DVC_URL = 'https://dichvucong.gov.vn/p/home/dvc-trang-chu.html';
const ETAX_URL = 'https://thuedientu.gdt.gov.vn';

/**
 * Run the tax service automation in headless browser (real DVC mode)
 *
 * @param {Object} callbacks - { onPinRequest, onStepUpdate, onComplete, onError }
 * @param {boolean} isTest - if true, use simulation page instead of real DVC
 */
async function runTaxService(callbacks, isTest = false) {
  const page = await newPage();

  try {
    if (isTest) {
      return await runTestMode(page, callbacks);
    }

    return await runRealMode(page, callbacks);

  } catch (err) {
    callbacks.onError(err.message);
    try { await page.close(); } catch (e) { /* ignore */ }
    throw err;
  }
}

/**
 * Test mode: inject simulation HTML page
 */
async function runTestMode(page, callbacks) {
  callbacks.onStepUpdate('Khởi tạo trình duyệt...');

  const testHtml = createTestPage(callbacks);
  await page.setContent(testHtml, { waitUntil: 'networkidle0' });

  await page.exposeFunction('_onPinRequested', () => {
    callbacks.onStepUpdate('Plugin yêu cầu mã PIN...');
    callbacks.onPinRequest('PIN USB Token yêu cầu bởi BKAV CA');
  });

  await page.exposeFunction('_onPinEntered', async (pin) => {
    callbacks.onStepUpdate(`Đã nhận PIN (${'*'.repeat(pin.length)}), đang xác thực...`);
    await new Promise(r => setTimeout(r, 1500));
    callbacks.onStepUpdate('Xác thực thành công! Đã đăng nhập DVC.');
  });

  await page.exposeFunction('_onETaxReady', () => {
    callbacks.onStepUpdate('Đã chuyển sang Thuế Điện Tử (thuedientu.gdt.gov.vn)');
  });

  await page.exposeFunction('_onCertPage', () => {
    callbacks.onStepUpdate('Đã đến trang Đổi Chứng Thư Số');
    callbacks.onComplete();
  });

  return page;
}

/**
 * Real mode: navigate to actual DVC, handle login, redirect to eTax
 */
async function runRealMode(page, callbacks) {
  // Step 1: Navigate to DVC
  callbacks.onStepUpdate('Đang mở Cổng Dịch vụ Công Quốc gia...');
  await page.goto(DVC_URL, { waitUntil: 'networkidle2', timeout: 45000 });
  await new Promise(r => setTimeout(r, 2000));

  // Detect if we're already on a login page (DVC SSO redirect)
  const currentUrl = page.url();
  callbacks.onStepUpdate(`Trang hiện tại: ${new URL(currentUrl).hostname}`);

  // Step 2: Find and click login / USB Token option on DVC homepage
  callbacks.onStepUpdate('Đang tìm tùy chọn đăng nhập...');

  const loginFound = await page.evaluate(() => {
    const keywords = [
      'đăng nhập', 'usb token', 'tài khoản dvcqg', 'cổng dvcqg',
      'chữ ký số', 'usbtoken', 'token', 'dvc-qg'
    ];
    const all = Array.from(document.querySelectorAll('a, button, div[role="button"], span[role="button"], .btn, [onclick]'));
    for (const el of all) {
      const text = (el.textContent || '').toLowerCase();
      for (const kw of keywords) {
        if (text.includes(kw)) {
          el.click();
          return kw;
        }
      }
    }
    return null;
  });

  if (loginFound) {
    callbacks.onStepUpdate(`Đã click: "${loginFound}". Đang chờ trang đăng nhập...`);
  } else {
    callbacks.onStepUpdate('Đang thử URL đăng nhập trực tiếp...');
    // Try navigating directly to DVC login page
    await page.goto('https://dichvucong.gov.vn/p/home/dvc-trang-chu.html', { waitUntil: 'networkidle2', timeout: 30000 });
  }

  // Wait for navigation / page content to settle
  await new Promise(r => setTimeout(r, 3000));

  // Step 3: Detect PIN input field (plugin popup / iframe / modal)
  callbacks.onStepUpdate('Đang chờ plugin chữ ký số...');

  const pinDetected = await detectPinInput(page);
  if (pinDetected) {
    callbacks.onStepUpdate('Plugin chữ ký số đã sẵn sàng');
    callbacks.onPinRequest('Plugin chữ ký số yêu cầu mã PIN để đăng nhập USB Token');
  } else {
    callbacks.onStepUpdate('Chưa phát hiện PIN input, tiếp tục tìm...');
    // Try clicking login link again after page load
    await tryClickSSOLogin(page, callbacks);
    await new Promise(r => setTimeout(r, 2000));

    const pinDetected2 = await detectPinInput(page);
    if (pinDetected2) {
      callbacks.onPinRequest('Plugin chữ ký số yêu cầu mã PIN để đăng nhập USB Token');
    } else {
      // If no PIN input found, keep browser alive and notify user
      callbacks.onStepUpdate('Đã đến trang đăng nhập DVC. Vui lòng nhập PIN nếu được yêu cầu.');
      callbacks.onPinRequest('Chưa phát hiện ô nhập PIN. Vui lòng kiểm tra USB Token và thử lại, hoặc nhập PIN thủ công.');
    }
  }

  return page;
}

/**
 * Detect PIN input fields on the page (including iframes and popups)
 */
async function detectPinInput(page) {
  try {
    // Check main page
    const onMainPage = await page.evaluate(() => {
      const inputs = document.querySelectorAll(
        'input[type="password"], input[type="pin"], input[placeholder*="PIN"], ' +
        'input[placeholder*="Mã PIN"], input[placeholder*="mật khẩu"], ' +
        'input[name*="pin"], input[id*="pin"], input[class*="pin"], ' +
        'input[placeholder*="Token PIN"]'
      );
      return inputs.length > 0;
    });

    if (onMainPage) return true;

    // Check iframes
    const frames = page.frames();
    for (const frame of frames) {
      if (frame === page.mainFrame()) continue;
      try {
        const inFrame = await frame.evaluate(() => {
          const inputs = document.querySelectorAll(
            'input[type="password"], input[type="pin"], input[placeholder*="PIN"], ' +
            'input[name*="pin"], input[id*="pin"]'
          );
          return inputs.length > 0;
        });
        if (inFrame) return true;
      } catch (e) {
        // cross-origin iframe, can't access
      }
    }

    return false;

  } catch (e) {
    return false;
  }
}

/**
 * Try to click SSO login link on DVC
 */
async function tryClickSSOLogin(page, callbacks) {
  try {
    const clicked = await page.evaluate(() => {
      const links = Array.from(document.querySelectorAll('a[href*="login"], a[href*="sso"], a[href*="dang-nhap"], button'));
      for (const el of links) {
        const text = (el.textContent || '').toLowerCase();
        if (text.includes('đăng nhập') || text.includes('login') || text.includes('usb') || text.includes('token')) {
          el.click();
          return text.slice(0, 30);
        }
      }
      return null;
    });

    if (clicked) {
      callbacks.onStepUpdate(`Đã click liên kết: ${clicked}`);
    }
  } catch (e) {
    // ignore
  }
}

/**
 * Type PIN into the page (handles main page, iframes, and popups)
 */
async function typePin(page, pin) {
  // Try on main page first
  const typed = await page.evaluate((pinValue) => {
    const selector = [
      'input[type="password"]', 'input[type="pin"]',
      'input[placeholder*="PIN"]', 'input[name*="pin"]',
      'input[id*="pin"]', 'input[class*="pin"]',
      'input[placeholder*="Token PIN"]'
    ].join(', ');

    const inputs = document.querySelectorAll(selector);
    if (inputs.length > 0) {
      const input = inputs[0];
      input.focus();
      input.value = '';
      input.value = pinValue;
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));

      // Try to find and click submit button
      const submitSelector = [
        'button[type="submit"]', 'input[type="submit"]',
        'button:has-text("Xác nhận")', 'button:has-text("Đăng nhập")',
        'button:has-text("OK")', 'button:has-text("Submit")',
        '.btn-submit', '.btn-primary', '[class*="submit"]', '[class*="login"]'
      ].join(', ');

      const btns = document.querySelectorAll(submitSelector);
      for (const btn of btns) {
        const txt = (btn.textContent || '').toLowerCase();
        if (txt.includes('xác nhận') || txt.includes('đăng nhập') || txt.includes('ok') || txt.includes('submit') || txt.includes('login') || txt.includes('tiếp')) {
          btn.click();
          return 'clicked';
        }
      }

      // Fallback: press Enter
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, bubbles: true }));
      input.dispatchEvent(new KeyboardEvent('keypress', { key: 'Enter', code: 'Enter', keyCode: 13, bubbles: true }));
      return 'entered';
    }

    // Check for test page
    if (window._taxService && typeof window._taxService.submitPIN === 'function') {
      const pinField = document.getElementById('pin-field');
      if (pinField) {
        pinField.value = pinValue;
        window._taxService.submitPIN();
        return 'test';
      }
    }

    return false;
  }, pin);

  // Try iframes
  if (!typed) {
    const frames = page.frames();
    for (const frame of frames) {
      if (frame === page.mainFrame()) continue;
      try {
        const frameResult = await frame.evaluate((pinValue) => {
          const inputs = document.querySelectorAll(
            'input[type="password"], input[type="pin"], input[placeholder*="PIN"], input[name*="pin"], input[id*="pin"]'
          );
          if (inputs.length > 0) {
            const input = inputs[0];
            input.focus();
            input.value = pinValue;
            input.dispatchEvent(new Event('input', { bubbles: true }));
            input.dispatchEvent(new Event('change', { bubbles: true }));
            input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, bubbles: true }));
            return true;
          }
          return false;
        }, pin);

        if (frameResult) {
          return true;
        }
      } catch (e) {
        // cross-origin iframe
      }
    }
  }

  return !!typed;
}

/**
 * Navigate to Thuế Điện Tử (via SSO after DVC login)
 */
async function navigateToETax(page) {
  await page.goto(ETAX_URL, { waitUntil: 'networkidle2', timeout: 30000 });
  await new Promise(r => setTimeout(r, 3000));

  // Check if we need to click through SSO
  const currentUrl = page.url();
  if (currentUrl.includes('dichvucong.gov.vn') || currentUrl.includes('sso') || currentUrl.includes('login')) {
    // Still on SSO page, try clicking through
    await page.evaluate(() => {
      const links = Array.from(document.querySelectorAll('a[href*="thuedientu"], a[href*="gdt.gov"]'));
      if (links.length > 0) links[0].click();
    });
    await new Promise(r => setTimeout(r, 3000));
  }
}

/**
 * Navigate to the digital certificate change page on eTax
 */
async function navigateToCertPage(page) {
  // Try direct navigation to eTax cert management
  await page.goto('https://thuedientu.gdt.gov.vn/etaxnnt/Request', {
    waitUntil: 'networkidle2',
    timeout: 30000
  });
  await new Promise(r => setTimeout(r, 2000));

  // Try alternative paths if needed
  const currentUrl = page.url();
  if (currentUrl.includes('login') || currentUrl.includes('sso')) {
    // Need to click through the portal
    await page.evaluate(() => {
      const certKeywords = ['chứng thư', 'đổi chứng thư', 'cert', 'chữ ký số', 'token'];
      const links = Array.from(document.querySelectorAll('a, button, div[role="button"]'));
      for (const el of links) {
        const text = (el.textContent || '').toLowerCase();
        for (const kw of certKeywords) {
          if (text.includes(kw)) {
            el.click();
            return;
          }
        }
      }
    });
    await new Promise(r => setTimeout(r, 3000));
  }
}

/**
 * Trigger a named action on the page
 */
async function triggerAction(page, action) {
  if (action === 'navToETax') {
    await navigateToETax(page);
  } else if (action === 'callChangeCert') {
    await navigateToCertPage(page);
  } else {
    // Legacy test-mode DOM manipulation
    await page.evaluate((actionName) => {
      if (actionName === 'selectUSBToken') {
        const step1 = document.getElementById('tax-step-1');
        const pin = document.getElementById('tax-step-pin');
        if (step1) step1.style.display = 'none';
        if (pin) pin.style.display = 'block';
      } else if (actionName === 'navToETax') {
        const step2 = document.getElementById('tax-step-2');
        const step3 = document.getElementById('tax-step-3');
        if (step2) step2.style.display = 'none';
        if (step3) step3.style.display = 'block';
      } else if (actionName === 'callChangeCert') {
        // already on step 3
      }
    }, action);
  }
}

/**
 * Creates a test HTML page that simulates the DVC/eTax login flow
 */
function createTestPage() {
  return `
<!DOCTYPE html>
<html><head><meta charset="UTF-8"><title>DVC Simulation</title>
<style>
  body { font-family: 'Be Vietnam Pro', sans-serif; margin: 40px; background: #F3F4F6; }
  .container { max-width: 600px; margin: 0 auto; background: white; border-radius: 16px; padding: 32px; }
  .step { background: #6366F1; color: white; width: 28px; height: 28px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-weight: 800; font-size: 13px; }
  h2 { color: #111827; }
  .dvc-box { background: #EEF2FF; border: 2px solid #C7D2FE; border-radius: 14px; padding: 24px; margin: 20px 0; }
  .dvc-box h3 { color: #4338CA; margin-top: 0; }
  .btn { background: linear-gradient(135deg, #6366F1, #4338CA); color: white; border: none; padding: 12px 28px; border-radius: 10px; cursor: pointer; font-size: 15px; font-weight: 700; margin: 8px 4px; }
  .btn:hover { opacity: 0.9; }
  .usb-option { display: flex; gap: 12px; padding: 16px; border: 2px solid #E5E7EB; border-radius: 10px; cursor: pointer; align-items: center; transition: border 0.2s; }
  .usb-option:hover { border-color: #6366F1; }
  .usb-option.active { border-color: #6366F1; background: #EEF2FF; }
  .pin-input { width: 200px; padding: 12px; border: 2px solid #E5E7EB; border-radius: 10px; font-size: 18px; font-weight: 700; letter-spacing: 4px; text-align: center; }
  .pin-input:focus { border-color: #6366F1; }
  .status { font-size: 13px; color: #6B7280; margin-top: 8px; }
  #tax-step-3 { display: none; }
</style></head>
<body>
<div class="container">
  <div id="tax-step-1">
    <div style="display:flex;align-items:center;gap:10px;"><span class="step">1</span><h2>Cổng Dịch vụ Công Quốc gia</h2></div>
    <p>Chọn phương thức đăng nhập:</p>
    <div class="dvc-box">
      <div class="usb-option active" style="margin-bottom:12px;">
        <span style="font-size:24px;">🔑</span>
        <div><strong>Tài khoản cấp bởi Cổng DVCQG</strong><br><span style="font-size:13px;color:#6B7280;">Dành cho doanh nghiệp</span></div>
      </div>
      <div class="usb-option" style="margin-bottom:12px;">
        <span style="font-size:24px;">📱</span>
        <div><strong>VNeID</strong><br><span style="font-size:13px;color:#6B7280;">Công dân</span></div>
      </div>
      <button class="btn" onclick="selectUSBToken()">Tiếp tục với USB Token</button>
    </div>
    <div class="status" id="step1-status"></div>
  </div>
  <div id="tax-step-pin" style="display:none;">
    <div style="display:flex;align-items:center;gap:10px;"><span class="step">🔒</span><h2>Nhập mã PIN USB Token</h2></div>
    <p>Plugin chữ ký số yêu cầu mã PIN để đăng nhập.</p>
    <p class="status">Token: <strong>BKAV CA</strong> — Serial: <strong>5401123456789</strong></p>
    <div style="margin:20px 0;">
      <input class="pin-input" type="password" id="pin-field" maxlength="8" placeholder="••••••••" autofocus>
    </div>
    <button class="btn" onclick="submitPIN()">Xác nhận PIN</button>
    <p style="font-size:12px;color:#9CA3AF;margin-top:8px;">PIN của bạn được gửi an toàn, không lưu trữ trên server</p>
  </div>
  <div id="tax-step-2" style="display:none;">
    <div style="display:flex;align-items:center;gap:10px;"><span class="step">2</span><h2>Đã đăng nhập DVC thành công</h2></div>
    <p>Sẵn sàng chuyển sang Thuế Điện Tử...</p>
    <div class="dvc-box" style="background:#ECFDF5;border-color:#A7F3D0;">
      <strong style="color:#065F46;">✓ Đăng nhập thành công</strong>
      <p style="font-size:13px;color:#059669;">MST: 0319267826 — CÔNG TY TNHH AUTOPOST VN</p>
    </div>
    <button class="btn" onclick="navToETax()">Chuyển sang Thuế Điện Tử →</button>
  </div>
  <div id="tax-step-3">
    <div style="display:flex;align-items:center;gap:10px;"><span class="step">3</span><h2>Thuế Điện Tử</h2></div>
    <p>Đang ở trang: <strong>thuedientu.gdt.gov.vn/etaxnnt/Request</strong></p>
    <div class="dvc-box" style="background:#FEF3C7;border-color:#FDE68A;">
      <strong style="color:#92400E;">Trang Đổi Chứng Thư Số</strong>
      <p style="font-size:13px;color:#B45309;">Bạn có thể đổi chứng thư số tại đây. Phiên làm việc đã sẵn sàng.</p>
    </div>
    <button class="btn" onclick="callChangeCert()">Đi tới Đổi Chứng Thư Số</button>
    <div class="status">Phiên trình duyệt đang hoạt động. Bạn có thể thao tác trực tiếp.</div>
  </div>
</div>
<script>
  window._taxService = {
    selectUSBToken: function() {
      document.getElementById('tax-step-1').style.display = 'none';
      document.getElementById('tax-step-pin').style.display = 'block';
      document.getElementById('pin-field').focus();
      window._onPinRequested && window._onPinRequested();
    },
    submitPIN: function() {
      const pin = document.getElementById('pin-field').value;
      if (!pin || pin.length < 4) { alert('Vui lòng nhập PIN (tối thiểu 4 ký tự)'); return; }
      document.getElementById('tax-step-pin').style.display = 'none';
      document.getElementById('tax-step-2').style.display = 'block';
      window._onPinEntered && window._onPinEntered(pin);
    },
    navToETax: function() {
      document.getElementById('tax-step-2').style.display = 'none';
      document.getElementById('tax-step-3').style.display = 'block';
      window._onETaxReady && window._onETaxReady();
    },
    callChangeCert: function() {
      window._onCertPage && window._onCertPage();
    }
  };
</script>
</body></html>`;
}

module.exports = { runTaxService, typePin, triggerAction, navigateToETax, navigateToCertPage };
