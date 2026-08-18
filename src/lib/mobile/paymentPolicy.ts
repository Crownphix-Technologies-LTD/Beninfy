export const MOBILE_LAUNCH_CURRENCY = 'NGN' as const
export const MOBILE_PAYMENT_PROVIDERS = ['paystack', 'payonus'] as const

export type MobileLaunchCurrency = typeof MOBILE_LAUNCH_CURRENCY
export type MobileLaunchPaymentProvider = (typeof MOBILE_PAYMENT_PROVIDERS)[number]

export function isMobileLaunchCurrency(value: unknown): value is MobileLaunchCurrency {
  return String(value ?? '').toUpperCase() === MOBILE_LAUNCH_CURRENCY
}

export function assertMobileLaunchCurrency(value: unknown) {
  return isMobileLaunchCurrency(value)
    ? { ok: true as const, currency: MOBILE_LAUNCH_CURRENCY }
    : {
        ok: false as const,
        code: 'UNSUPPORTED_PAYMENT_CURRENCY' as const,
        message: 'Only NGN payments are supported at launch',
      }
}

export function normalizeMobileLaunchPaymentProvider(value: unknown): MobileLaunchPaymentProvider {
  return value === 'payonus' ? 'payonus' : 'paystack'
}

