const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  host:   process.env.SMTP_HOST || 'smtp.gmail.com',
  port:   parseInt(process.env.SMTP_PORT) || 587,
  secure: false,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS
  }
});

async function sendNotification(data) {
  if (!process.env.SMTP_USER) {
    console.warn('⚠️  SMTP not configured — skipping email');
    return;
  }

  const serviceLabels = {
    tender:  'Public Tender Management',
    sourcing:'Supplier Sourcing',
    import:  'Import & Logistics',
    rep:     'Commercial Representation',
    docs:    'Document Management',
    other:   'Other'
  };

  const html = `
<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"></head>
<body style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;color:#111">
  <div style="border-top:3px solid #B8923A;padding-top:20px;margin-bottom:24px">
    <h1 style="font-size:22px;margin:0;color:#111">New Lead — CSG Consulting</h1>
    <p style="color:#6A6762;font-size:13px;margin:4px 0 0">Received at ${new Date().toISOString()}</p>
  </div>

  <table style="width:100%;border-collapse:collapse">
    <tr><td style="padding:10px 0;border-bottom:1px solid #E8E6E3;font-size:13px;color:#6A6762;width:140px">Name</td>
        <td style="padding:10px 0;border-bottom:1px solid #E8E6E3;font-size:14px;font-weight:600">${data.name}</td></tr>
    <tr><td style="padding:10px 0;border-bottom:1px solid #E8E6E3;font-size:13px;color:#6A6762">Company</td>
        <td style="padding:10px 0;border-bottom:1px solid #E8E6E3;font-size:14px;font-weight:600">${data.company}</td></tr>
    <tr><td style="padding:10px 0;border-bottom:1px solid #E8E6E3;font-size:13px;color:#6A6762">Country</td>
        <td style="padding:10px 0;border-bottom:1px solid #E8E6E3;font-size:14px">${data.country}</td></tr>
    <tr><td style="padding:10px 0;border-bottom:1px solid #E8E6E3;font-size:13px;color:#6A6762">Sector</td>
        <td style="padding:10px 0;border-bottom:1px solid #E8E6E3;font-size:14px">${data.sector}</td></tr>
    <tr><td style="padding:10px 0;border-bottom:1px solid #E8E6E3;font-size:13px;color:#6A6762">Email</td>
        <td style="padding:10px 0;border-bottom:1px solid #E8E6E3;font-size:14px"><a href="mailto:${data.email}" style="color:#B8923A">${data.email}</a></td></tr>
    <tr><td style="padding:10px 0;border-bottom:1px solid #E8E6E3;font-size:13px;color:#6A6762">Phone</td>
        <td style="padding:10px 0;border-bottom:1px solid #E8E6E3;font-size:14px">${data.phone || '—'}</td></tr>
    <tr><td style="padding:10px 0;border-bottom:1px solid #E8E6E3;font-size:13px;color:#6A6762">Service</td>
        <td style="padding:10px 0;border-bottom:1px solid #E8E6E3;font-size:14px">
          <span style="background:#B8923A;color:#fff;padding:2px 10px;font-size:12px">${serviceLabels[data.service] || data.service}</span>
        </td></tr>
    <tr><td style="padding:10px 0;border-bottom:1px solid #E8E6E3;font-size:13px;color:#6A6762">Language</td>
        <td style="padding:10px 0;border-bottom:1px solid #E8E6E3;font-size:14px">${data.lang?.toUpperCase() || 'EN'}</td></tr>
  </table>

  ${data.message ? `
  <div style="margin-top:20px;padding:16px;background:#F8F7F5;border-left:3px solid #B8923A">
    <p style="font-size:12px;color:#6A6762;margin:0 0 6px;text-transform:uppercase;letter-spacing:.1em">Message</p>
    <p style="font-size:14px;margin:0;line-height:1.7">${data.message}</p>
  </div>` : ''}

  <div style="margin-top:28px;padding-top:16px;border-top:1px solid #E8E6E3">
    <a href="mailto:${data.email}" style="display:inline-block;background:#111;color:#fff;padding:12px 24px;font-size:12px;letter-spacing:.1em;text-transform:uppercase;text-decoration:none">Reply to lead</a>
  </div>

  <p style="margin-top:32px;font-size:11px;color:#A09D98">CSG Consulting · Casablanca, Morocco · csgconsulting.ma</p>
</body>
</html>`;

  await transporter.sendMail({
    from:    process.env.EMAIL_FROM || process.env.SMTP_USER,
    to:      process.env.EMAIL_TO,
    subject: `🟡 New lead: ${data.name} — ${data.company} (${data.country})`,
    html
  });

  console.log(`✅ Email sent to ${process.env.EMAIL_TO}`);
}

module.exports = { sendNotification };
