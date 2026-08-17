function clean(value: string | undefined) {
  const trimmed = value?.trim()
  return trimmed || null
}

function normalizeWhatsapp(value: string | null) {
  if (!value) return null
  const digits = value.replace(/[^\d]/g, '')
  if (digits.length < 8) return null
  return {
    display: value.startsWith('+') ? value : `+${digits}`,
    url: `https://wa.me/${digits}`,
  }
}

export function mobileSupportConfig() {
  const email =
    clean(process.env.SUPPORT_EMAIL) ||
    clean(process.env.SMTP_SENDER_EMAIL) ||
    'support@beninfy.com'
  const phone = clean(process.env.SUPPORT_PHONE)
  const whatsapp = normalizeWhatsapp(clean(process.env.SUPPORT_WHATSAPP))

  return {
    email,
    phone,
    whatsapp,
    emergency: {
      enabled: Boolean(phone || whatsapp),
      phone,
      whatsapp,
    },
  }
}
