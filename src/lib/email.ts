// Transactional email bodies. Mail clients ignore <style> and external CSS unevenly, so the HTML
// is table-based with inline styles only, and every message also carries a plain-text part.

const SITE = "https://trysometh.ing";
const C = { coral: "#ff6a45", ink: "#17141f", ink2: "#4a4553", muted: "#7a7482", cream: "#f4f1ec", paper: "#ffffff", line: "#e7e2da" };
const FONT = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";

const escapeHtml = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

export interface EmailBody {
  subject: string;
  text: string;
  html: string;
}

export function signInCodeEmail(otp: string): EmailBody {
  const code = escapeHtml(otp);
  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light only">
<title>Your sign-in code</title>
</head>
<body style="margin:0;padding:0;background:${C.cream};">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">Your code is ${code}. It expires in 10 minutes.</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${C.cream};">
<tr><td align="center" style="padding:32px 16px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:480px;">
<tr><td style="padding:0 4px 18px;font-family:${FONT};font-size:20px;font-weight:700;color:${C.ink};letter-spacing:-0.01em;">
trysometh<span style="color:${C.coral};">.ing</span>
</td></tr>
<tr><td style="background:${C.paper};border:1px solid ${C.line};border-radius:20px;padding:32px 28px;font-family:${FONT};color:${C.ink};">
<p style="margin:0 0 8px;font-size:13px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:${C.muted};">Sign-in code</p>
<h1 style="margin:0 0 14px;font-size:24px;line-height:1.25;font-weight:800;color:${C.ink};">Here's your code</h1>
<p style="margin:0 0 22px;font-size:16px;line-height:1.55;color:${C.ink2};">Enter it on the sign-in page to continue to Try Something.</p>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
<tr><td align="center" style="background:${C.cream};border-radius:14px;border-bottom:3px solid ${C.coral};padding:18px 12px;font-family:'SFMono-Regular',Menlo,Consolas,monospace;font-size:34px;font-weight:700;letter-spacing:0.3em;color:${C.ink};">${code}</td></tr>
</table>
<p style="margin:22px 0 0;font-size:14px;line-height:1.55;color:${C.muted};">It expires in 10 minutes and works once. If you didn't ask for it, you can ignore this email; nobody can sign in without the code.</p>
</td></tr>
<tr><td style="padding:18px 4px 0;font-family:${FONT};font-size:13px;line-height:1.5;color:${C.muted};">
Try Something · an open-source home for things worth trying<br>
<a href="${SITE}" style="color:${C.ink2};">trysometh.ing</a>
</td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;
  return {
    subject: `${otp} is your Try Something sign-in code`,
    text: `Your sign-in code is ${otp}\n\nIt expires in 10 minutes and works once.\nIf you didn't request it, ignore this email.\n\n— Try Something (${SITE})`,
    html,
  };
}
