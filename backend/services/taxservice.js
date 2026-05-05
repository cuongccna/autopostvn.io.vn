/**
 * DVC Tax Service Automation
 *
 * Luồng tự động:
 * 1. Mở dichvucong.gov.vn
 * 2. Chọn đăng nhập = Tài khoản cấp bởi Cổng DVCQG
 * 3. Chọn USB Token → nếu cần PIN → gửi WebSocket request cho user
 * 4. Sau khi đăng nhập → chọn "Nộp thuế doanh nghiệp"
 * 5. Chuyển qua thuedientu.gdt.gov.vn
 * 6. Điều hướng đến trang đổi chứng thư số
 *
 * TEST MODE: nếu có flag `isTest=true`, dùng trang HTML local mô phỏng DVC
 */

const { newPage } = require('./browser');

const DVC_URL = 'https://dichvucong.gov.vn/p/home/dvc-trang-chu.html';
const ETAX_URL = 'https://thuedientu.gdt.gov.vn';

/**
 * Creates a test HTML page that simulates the DVC/eTax login flow
 */
function createTestPage(onPinRequest, onStepUpdate) {
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
  // Bridge to Puppeteer
  window._taxService = {
    selectUSBToken: function() {
      document.getElementById('tax-step-1').style.display = 'none';
      document.getElementById('tax-step-pin').style.display = 'block';
      document.getElementById('pin-field').focus();
      // Notify Puppeteer
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

/**
 * Run the tax service automation in headless browser
 *
 * @param {Object} callbacks - { onPinRequest, onStepUpdate, onComplete, onError }
 * @param {boolean} isTest - use test simulation page
 */
async function runTaxService(callbacks, isTest = false) {
  const page = await newPage();

  try {
    callbacks.onStepUpdate('Khởi tạo trình duyệt...');

    if (isTest) {
      // TEST MODE: inject simulation page directly
      const testHtml = createTestPage(
        () => { callbacks.onPinRequest('PIN USB Token yêu cầu bởi BKAV CA (Serial: 5401123456789)'); },
        () => {}
      );

      await page.setContent(testHtml, { waitUntil: 'networkidle0' });

      // Expose callbacks to the page
      await page.exposeFunction('_onPinRequested', () => {
        callbacks.onStepUpdate('Plugin yêu cầu mã PIN...');
        callbacks.onPinRequest('PIN USB Token yêu cầu bởi BKAV CA');
      });

      await page.exposeFunction('_onPinEntered', async (pin) => {
        callbacks.onStepUpdate(`Đã nhận PIN (${'*'.repeat(pin.length)}), đang xác thực...`);
        // Simulate verification delay
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

      // Wait for user to complete through the flow
      // The actual steps are driven by evaluate calls from the API route
      return page;

    } else {
      // REAL MODE: navigate to actual DVC
      callbacks.onStepUpdate('Đang mở Cổng Dịch vụ Công...');
      await page.goto(DVC_URL, { waitUntil: 'networkidle2', timeout: 30000 });

      // Wait for login options to load
      await page.waitForSelector('body', { timeout: 10000 });

      // Look for USB Token option and click
      const usbLoginFound = await page.evaluate(() => {
        const links = Array.from(document.querySelectorAll('a, button, div[class*="login"], span[class*="login"]'));
        for (const el of links) {
          const text = el.textContent.toLowerCase();
          if (text.includes('usb') || text.includes('token') || text.includes('dvcqg') || text.includes('cổng dvc')) {
            el.click();
            return true;
          }
        }
        return false;
      });

      if (!usbLoginFound) {
        callbacks.onStepUpdate('Không tìm thấy nút USB Token, đang thử cách khác...');
        // Try to find and click the SSO login
      }

      // Wait for PIN dialog (plugin popup or form)
      callbacks.onStepUpdate('Đang chờ plugin chữ ký số...');

      // Monitor for PIN input fields
      const pinDetected = await page.evaluate(() => {
        const inputs = document.querySelectorAll('input[type="password"], input[type="pin"], input[placeholder*="PIN"], input[placeholder*="Mã PIN"]');
        return inputs.length > 0;
      });

      if (pinDetected) {
        callbacks.onPinRequest('Plugin chữ ký số yêu cầu nhập mã PIN');
      }

      return page;
    }
  } catch (err) {
    callbacks.onError(err.message);
    try { await page.close(); } catch (e) { /* ignore */ }
    throw err;
  }
}

/**
 * Type PIN into the headless browser
 */
async function typePin(page, pin) {
  await page.evaluate((pinValue) => {
    const input = document.querySelector('input[type="password"], input[type="pin"], #pin-field, input.pin-input');
    if (input) {
      input.value = pinValue;
      input.dispatchEvent(new Event('input', { bubbles: true }));
      // Try to submit
      const btn = document.querySelector('button, input[type="submit"]');
      if (btn && (btn.textContent.toLowerCase().includes('xác nhận') || btn.textContent.toLowerCase().includes('submit') || btn.textContent.toLowerCase().includes('pin') || btn.className.includes('submit'))) {
        btn.click();
        return true;
      }
      // If test page, call submitPIN
      if (window._taxService && window._taxService.submitPIN) {
        document.getElementById('pin-field').value = pinValue;
        window._taxService.submitPIN();
        return true;
      }
    }
    return false;
  }, pin);
}

/**
 * Click a specific button on the page (for test mode)
 */
async function triggerAction(page, action) {
  await page.evaluate((actionName) => {
    if (actionName === 'selectUSBToken') {
      if (document.getElementById('tax-step-1')) {
        document.getElementById('tax-step-1').style.display = 'none';
      }
      if (document.getElementById('tax-step-pin')) {
        document.getElementById('tax-step-pin').style.display = 'block';
      }
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

module.exports = { runTaxService, typePin, triggerAction };
