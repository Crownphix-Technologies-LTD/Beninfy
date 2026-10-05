import { isEmailConfigured, sendEmail } from '@/lib/email'

export type CustomerOtpChannel = 'email' | 'sms'

export class OtpDeliveryError extends Error {
  constructor(public readonly reason: 'not_configured' | 'rejected' | 'timeout') {
    super(`OTP delivery ${reason}`)
    this.name = 'OtpDeliveryError'
  }
}

function smsConfig() {
  return {
    apiKey: process.env.BREVO_API_KEY?.trim() ?? '',
    sender: process.env.BREVO_SMS_SENDER?.trim() ?? 'Beninfy',
  }
}

export function otpDeliveryReadiness() {
  const sms = smsConfig()
  return {
    email: isEmailConfigured(),
    sms: Boolean(sms.apiKey && sms.sender),
  }
}

async function deliverEmail(input: {
  destination: string
  code: string
  expiresInMinutes: number
  locale: 'en' | 'fr'
}) {
  if (!isEmailConfigured()) throw new OtpDeliveryError('not_configured')
  const french = input.locale === 'fr'
  try {
    await sendEmail({
      to: input.destination,
      subject: french ? 'Votre code de connexion Beninfy' : 'Your Beninfy sign-in code',
      html: `<div style="font-family:Arial,sans-serif;color:#24112b"><h1>${
        french ? 'Code de verification Beninfy' : 'Beninfy verification code'
      }</h1><p>${
        french
          ? 'Utilisez ce code pour continuer dans Beninfy.'
          : 'Use this code to continue in Beninfy.'
      }</p><p style="font-size:30px;font-weight:700;letter-spacing:6px">${input.code}</p><p>${
        french
          ? `Ce code expire dans ${input.expiresInMinutes} minutes.`
          : `This code expires in ${input.expiresInMinutes} minutes.`
      }</p><p>${
        french
          ? "Si vous n'avez pas demande ce code, ignorez ce message."
          : 'If you did not request this code, ignore this message.'
      }</p></div>`,
      text: french
        ? `Votre code Beninfy est ${input.code}. Il expire dans ${input.expiresInMinutes} minutes.`
        : `Your Beninfy code is ${input.code}. It expires in ${input.expiresInMinutes} minutes.`,
    })
  } catch {
    throw new OtpDeliveryError('rejected')
  }
}

async function deliverSms(input: {
  destination: string
  code: string
  expiresInMinutes: number
  locale: 'en' | 'fr'
}) {
  const config = smsConfig()
  if (!config.apiKey || !config.sender) throw new OtpDeliveryError('not_configured')

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 10_000)
  try {
    const response = await fetch('https://api.brevo.com/v3/transactionalSMS/send', {
      method: 'POST',
      signal: controller.signal,
      headers: {
        accept: 'application/json',
        'api-key': config.apiKey,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        sender: config.sender,
        recipient: input.destination.replace(/^\+/, ''),
        content:
          input.locale === 'fr'
            ? `Votre code Beninfy est ${input.code}. Il expire dans ${input.expiresInMinutes} minutes.`
            : `Your Beninfy code is ${input.code}. It expires in ${input.expiresInMinutes} minutes.`,
        type: 'transactional',
        tag: 'customer-auth-otp',
      }),
    })
    if (!response.ok) throw new OtpDeliveryError('rejected')
  } catch (error) {
    if (error instanceof OtpDeliveryError) throw error
    if (error instanceof Error && error.name === 'AbortError') throw new OtpDeliveryError('timeout')
    throw new OtpDeliveryError('rejected')
  } finally {
    clearTimeout(timeout)
  }
}

export async function deliverCustomerOtp(input: {
  channel: CustomerOtpChannel
  destination: string
  code: string
  expiresInMinutes: number
  locale: 'en' | 'fr'
}) {
  if (input.channel === 'email') return deliverEmail(input)
  return deliverSms(input)
}
