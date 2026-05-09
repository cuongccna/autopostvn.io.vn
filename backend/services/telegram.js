const TELEGRAM_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;

async function sendOrderNotification(data) {
  if (!TELEGRAM_TOKEN || TELEGRAM_TOKEN === 'YOUR_TELEGRAM_BOT_TOKEN') {
    console.log('[TG] Token not configured, skipping');
    return;
  }

  const msg = [
    '🛒 *ĐƠN HÀNG MỚI — AUTOBOT.AI*',
    '',
    `📦 *Gói:* ${data.package_name} — ${data.package_price}`,
    '',
    `🏢 *MST:* ${data.mst}`,
    `🏢 *Công ty:* ${data.company}`,
    `📍 *Địa chỉ:* ${data.address}`,
    '',
    `👤 *Người đặt:* ${data.contact_name}`,
    `📞 *SĐT:* ${data.phone}`,
    `✉️ *Email:* ${data.email}`,
    `📁 *GPKD:* ${data.file_name || 'Không có'}`,
    `📝 *Ghi chú:* ${data.note || '—'}`,
    '',
    `🆔 *ID:* \`${data.id}\``,
    `⏰ *Thời gian:* ${data.created_at}`
  ].join('\n');

  try {
    const res = await fetch(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: TELEGRAM_CHAT_ID, text: msg, parse_mode: 'Markdown' })
    });
    if (!res.ok) console.warn('[TG] Send error:', await res.text());
  } catch (err) {
    console.warn('[TG] Network error:', err.message);
  }
}

async function sendLeadNotification(data) {
  if (!TELEGRAM_TOKEN || TELEGRAM_TOKEN === 'YOUR_TELEGRAM_BOT_TOKEN') return;

  const msg = [
    '📩 *ĐĂNG KÝ MỚI — AUTOBOT.AI*',
    '',
    `👤 *Họ tên:* ${data.name}`,
    `📞 *SĐT:* ${data.phone}`,
    `✉️ *Email:* ${data.email || '—'}`,
    `🏢 *Công ty:* ${data.company || '—'}`,
    `📋 *Loại hình:* ${data.type || '—'}`,
    '',
    `🆔 *ID:* \`${data.id}\``,
    `⏰ *Thời gian:* ${data.created_at}`
  ].join('\n');

  try {
    await fetch(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: TELEGRAM_CHAT_ID, text: msg, parse_mode: 'Markdown' })
    });
  } catch (err) {
    console.warn('[TG] Network error:', err.message);
  }
}

async function sendTaxOtpNotification(otpCode) {
  console.log('[TG] sendTaxOtpNotification called with OTP:', otpCode);
  if (!TELEGRAM_TOKEN || TELEGRAM_TOKEN === 'YOUR_TELEGRAM_BOT_TOKEN') {
    console.log('[TG] TELEGRAM_TOKEN not configured, skipping OTP send');
    return;
  }

  const msg = [
    '🔐 *XÁC THỰC DỊCH VỤ THUẾ ĐIỆN TỬ*',
    '',
    `Mã OTP: *\`${otpCode}\`*`,
    '⏰ Hết hạn sau: *3 phút*',
    `🕐 Thời gian: ${new Date().toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })}`,
    '',
    '_Cung cấp mã này cho khách hàng đang yêu cầu dịch vụ Đổi Chứng Thư Số._'
  ].join('\n');

  try {
    await fetch(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: TELEGRAM_CHAT_ID, text: msg, parse_mode: 'Markdown' })
    });
  } catch (err) {
    console.warn('[TG] Network error:', err.message);
  }
}

module.exports = { sendOrderNotification, sendLeadNotification, sendTaxOtpNotification };
