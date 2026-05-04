const RESEND_KEY = process.env.RESEND_API_KEY;

async function sendOrderEmail(data) {
  if (!RESEND_KEY || RESEND_KEY === 'YOUR_RESEND_API_KEY') return;

  const html = `<div style="font-family:sans-serif;max-width:560px;margin:0 auto;padding:24px;background:#f9fafb;border-radius:12px;">
  <h2 style="color:#4338CA;margin-bottom:16px;">🛒 Đơn hàng mới — AUTOBOT.AI</h2>
  <div style="background:white;border-radius:10px;padding:20px;margin-bottom:16px;border:1px solid #e5e7eb;">
    <p style="font-weight:700;color:#6B7280;font-size:12px;text-transform:uppercase;margin-bottom:10px;">Thông tin gói</p>
    <p><b>Gói:</b> ${data.package_name}</p>
    <p><b>Giá:</b> ${data.package_price}</p>
  </div>
  <div style="background:white;border-radius:10px;padding:20px;margin-bottom:16px;border:1px solid #e5e7eb;">
    <p style="font-weight:700;color:#6B7280;font-size:12px;text-transform:uppercase;margin-bottom:10px;">Thông tin doanh nghiệp</p>
    <p><b>MST:</b> ${data.mst}</p>
    <p><b>Công ty:</b> ${data.company}</p>
    <p><b>Địa chỉ:</b> ${data.address}</p>
  </div>
  <div style="background:white;border-radius:10px;padding:20px;margin-bottom:16px;border:1px solid #e5e7eb;">
    <p style="font-weight:700;color:#6B7280;font-size:12px;text-transform:uppercase;margin-bottom:10px;">Thông tin liên hệ</p>
    <p><b>Người đặt:</b> ${data.contact_name}</p>
    <p><b>SĐT:</b> ${data.phone}</p>
    <p><b>Email:</b> ${data.email}</p>
    <p><b>GPKD:</b> ${data.file_name || 'Chưa có'}</p>
    <p><b>Ghi chú:</b> ${data.note || '—'}</p>
  </div>
  <p style="font-size:12px;color:#9ca3af;text-align:center;">🆔 ${data.id} · ⏰ ${data.created_at} · AUTOBOT.AI</p>
</div>`;

  try {
    await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${RESEND_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: 'AUTOBOT.AI Order <support@autopostvn.cloud>',
        to: ['support@autopostvn.cloud'],
        subject: `🛒 Đơn hàng mới: ${data.company} — ${data.package_name}`,
        html
      })
    });
  } catch (err) {
    console.warn('[Email] Error:', err.message);
  }
}

async function sendLeadEmail(data) {
  if (!RESEND_KEY || RESEND_KEY === 'YOUR_RESEND_API_KEY') return;

  try {
    await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${RESEND_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: 'AUTOBOT Lead <support@autopostvn.cloud>',
        to: ['support@autopostvn.cloud'],
        subject: `📩 Đăng ký mới từ ${data.name} — ${data.type || 'N/A'}`,
        html: `<h2>Khách hàng mới đăng ký AUTOBOT</h2>
          <p><b>Họ tên:</b> ${data.name}</p>
          <p><b>Số điện thoại:</b> ${data.phone}</p>
          <p><b>Email:</b> ${data.email || 'Chưa cung cấp'}</p>
          <p><b>Công ty:</b> ${data.company || 'Chưa cung cấp'}</p>
          <p><b>Loại hình:</b> ${data.type || 'N/A'}</p>
          <p><b>Thời gian:</b> ${data.created_at}</p>`
      })
    });
  } catch (err) {
    console.warn('[Email] Error:', err.message);
  }
}

module.exports = { sendOrderEmail, sendLeadEmail };
