export const MOBILE_PAYMENT_SUCCESS_URL = 'https://beninfy.com/en/mobile/payments/success'
export const MOBILE_PAYMENT_CANCEL_URL = 'https://beninfy.com/en/mobile/payments/cancel'

export function mobilePaymentNavigationTargets() {
  return {
    successUrl: MOBILE_PAYMENT_SUCCESS_URL,
    cancelUrl: MOBILE_PAYMENT_CANCEL_URL,
  }
}
