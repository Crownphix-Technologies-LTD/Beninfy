import nodemailer from 'nodemailer'

const SMTP_HOST = process.env.SMTP_HOST?.trim() || ''
const SMTP_PORT = Number(process.env.SMTP_PORT ?? 587)
const SMTP_USER = process.env.SMTP_USER?.trim() || ''
const SMTP_PASS = process.env.SMTP_PASS?.trim() || ''
const SMTP_SECURE = process.env.SMTP_SECURE === 'true'
const SMTP_SENDER_NAME = process.env.SMTP_SENDER_NAME?.trim() || 'Beninfy'
const SMTP_SENDER_EMAIL = process.env.SMTP_SENDER_EMAIL?.trim() || 'support@beninfy.com'
const SMTP_LOCAL_ADDRESS = process.env.SMTP_LOCAL_ADDRESS?.trim() || undefined

export function isEmailConfigured() {
  return Boolean(SMTP_HOST && SMTP_PORT && SMTP_USER && SMTP_PASS && SMTP_SENDER_EMAIL)
}

function createTransporter() {
  if (!isEmailConfigured()) {
    throw new Error('SMTP email is not fully configured')
  }

  return nodemailer.createTransport({
    host: SMTP_HOST,
    port: SMTP_PORT,
    secure: SMTP_SECURE,
    auth: {
      user: SMTP_USER,
      pass: SMTP_PASS,
    },
    localAddress: SMTP_LOCAL_ADDRESS,
  })
}

let transporter: ReturnType<typeof createTransporter> | null = null
function getTransporter() {
  if (!transporter) {
    transporter = createTransporter()
  }
  return transporter
}

export async function sendEmail(options: {
  to: string | Array<string>
  subject: string
  html: string
  text?: string
}) {
  const transport = getTransporter()
  return transport.sendMail({
    from: `"${SMTP_SENDER_NAME}" <${SMTP_SENDER_EMAIL}>`,
    to: options.to,
    subject: options.subject,
    html: options.html,
    text: options.text,
  })
}
