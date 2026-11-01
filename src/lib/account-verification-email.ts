/** Account email verification only. Never use for booking or login messages. */
export type AccountVerificationEmailInput = {
  email: string
  code: string
  expiresAt: Date
  locale?: 'en' | 'fr'
}

const escape = (value: string) => value.replace(/[&<>"']/g, c => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[c]!))

export function buildAccountVerificationEmail(input: AccountVerificationEmailInput) {
  const fr = input.locale === 'fr'
  // Use the challenge's actual expiry, including configured TTL overrides.
  // UTC is explicit so the email never implies the recipient's local timezone.
  const expiry = new Intl.DateTimeFormat(fr ? 'fr-FR' : 'en-GB', {
    dateStyle: 'long', timeStyle: 'long', timeZone: 'UTC',
  }).format(input.expiresAt)
  const title = fr ? 'Vérifiez votre adresse e-mail' : 'Verify your email address'
  const intro = fr
    ? 'Saisissez ce code dans Beninfy pour vérifier l’adresse e-mail de votre compte.'
    : 'Enter this code in Beninfy to verify the email address for your account.'
  const label = fr ? 'Code de vérification' : 'Verification code'
  const expires = fr ? `Ce code expire le ${expiry}.` : `This code expires on ${expiry}.`
  const security = fr ? 'Ne partagez jamais ce code avec qui que ce soit.' : 'Never share this code with anyone.'
  const footer = fr
    ? 'Vous recevez cet e-mail car une vérification d’adresse e-mail a été demandée pour un compte Beninfy. Si vous n’êtes pas à l’origine de cette demande, vous pouvez ignorer ce message.'
    : "You received this email because an email verification was requested for a Beninfy account. If this wasn't you, you can safely ignore this message."
  const text = ['Beninfy', title, intro, label, input.code, expires, security, footer].join('\n\n')
  const html = `<!doctype html><html lang="${fr ? 'fr' : 'en'}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;background:#fbf7fc;color:#24112b;font-family:Arial,sans-serif">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:20px 12px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff"><tr><td style="padding:24px 20px">
<div style="font-size:24px;font-weight:bold;color:#3e004c">Beninfy</div>
<h1 style="font-size:24px;line-height:1.3;margin:24px 0 16px">${escape(title)}</h1>
<p style="font-size:16px;line-height:1.6">${escape(intro)}</p>
<p style="font-size:14px;margin-bottom:8px">${escape(label)}</p>
<div style="font-size:32px;line-height:1.5;font-weight:bold;letter-spacing:4px;color:#3e004c;user-select:text">${escape(input.code)}</div>
<p style="font-size:16px;line-height:1.6">${escape(expires)}</p>
<p style="font-size:16px;line-height:1.6">${escape(security)}</p>
<hr style="border:0;border-top:1px solid #eaddec;margin:24px 0">
<p style="font-size:13px;line-height:1.6;color:#6f6277">${escape(footer)}</p>
</td></tr></table></td></tr></table></body></html>`
  return { subject: title, html, text }
}
