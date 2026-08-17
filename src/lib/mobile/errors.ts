import { NextResponse } from 'next/server'

export type MobileErrorCode =
  | 'UNAUTHENTICATED'
  | 'FORBIDDEN'
  | 'INVALID_CREDENTIALS'
  | 'ACCOUNT_DISABLED'
  | 'DRIVER_NOT_LINKED'
  | 'DRIVER_INACTIVE'
  | 'INVALID_DRIVER_STATUS'
  | 'ACTIVE_TRIP_PREVENTS_OFF_DUTY'
  | 'INVALID_TRIP_VIEW'
  | 'VALIDATION_ERROR'
  | 'BOOKING_NOT_FOUND'
  | 'BOOKING_NOT_CANCELLABLE'
  | 'BOOKING_ALREADY_CANCELLED'
  | 'INVALID_CANCELLATION_REASON'
  | 'TRIP_ALREADY_STARTED'
  | 'PARTIAL_CANCELLATION_NOT_SUPPORTED'
  | 'TRIP_NOT_FOUND'
  | 'TRIP_NOT_ASSIGNED'
  | 'TRIP_NOT_AVAILABLE'
  | 'TRIP_ALREADY_COMPLETED'
  | 'TRIP_TERMINAL'
  | 'ACTION_NOT_ALLOWED'
  | 'INVALID_TRANSITION'
  | 'PAYMENT_REQUIRED'
  | 'DRIVER_NOT_ASSIGNED'
  | 'VEHICLE_NOT_ASSIGNED'
  | 'RATE_LIMITED'
  | 'TRACKING_NOT_ALLOWED'
  | 'TRACKING_NOT_ACTIVE'
  | 'LOCATION_INVALID'
  | 'LOCATION_STALE'
  | 'LOCATION_RATE_LIMITED'
  | 'PUSH_TOKEN_INVALID'
  | 'PUSH_TOKEN_NOT_FOUND'
  | 'NOTIFICATION_NOT_FOUND'
  | 'CHAT_NOT_AVAILABLE'
  | 'CONVERSATION_NOT_FOUND'
  | 'MESSAGE_NOT_FOUND'
  | 'MESSAGE_EMPTY'
  | 'MESSAGE_TOO_LONG'
  | 'PAYMENT_NOT_FOUND'
  | 'PAYMENT_FAILED'
  | 'PAYMENT_CANCELLED'
  | 'PAYMENT_EXPIRED'
  | 'PAYMENT_AMOUNT_MISMATCH'
  | 'PAYMENT_ALREADY_COMPLETED'
  | 'BOOKING_NOT_PAYABLE'
  | 'PAYMENT_PROVIDER_UNAVAILABLE'
  | 'ROUTE_NOT_FOUND'
  | 'VEHICLE_NOT_FOUND'
  | 'ROUTE_NOT_AVAILABLE'
  | 'VEHICLE_NOT_AVAILABLE'
  | 'NO_AVAILABILITY'
  | 'INVALID_TRIP_DATES'
  | 'INVALID_RETURN_DATE'
  | 'PICKUP_AREA_REQUIRED'
  | 'COUPON_INVALID'
  | 'COUPON_EXPIRED'
  | 'QUOTE_UNAVAILABLE'
  | 'ONBOARDING_INCOMPLETE'
  | 'PHONE_INVALID'
  | 'PHONE_VERIFICATION_REQUIRED'
  | 'OTP_INVALID'
  | 'OTP_EXPIRED'
  | 'OTP_ATTEMPTS_EXCEEDED'
  | 'OTP_RESEND_TOO_SOON'
  | 'OTP_RATE_LIMITED'
  | 'RESET_TOKEN_INVALID'
  | 'RESET_TOKEN_EXPIRED'
  | 'PASSWORD_INVALID'
  | 'CURRENT_PASSWORD_INVALID'
  | 'SAVED_PLACE_NOT_FOUND'
  | 'SAVED_PLACE_TYPE_CONFLICT'
  | 'TRAVEL_PREFERENCE_INVALID'
  | 'REVIEW_NOT_FOUND'
  | 'REVIEW_NOT_ALLOWED'
  | 'REVIEW_ALREADY_EXISTS'
  | 'PAYMENT_RESOLUTION_NOT_FOUND'
  | 'EMAIL_ALREADY_IN_USE'
  | 'EMAIL_CHANGE_NOT_FOUND'
  | 'AVATAR_INVALID'
  | 'AVATAR_STORAGE_UNAVAILABLE'
  | 'ACCOUNT_DELETE_CONFIRMATION_INVALID'
  | 'TOUR_NOT_FOUND'
  | 'INTERNAL_ERROR'

export type MobileErrorBody = {
  error: {
    code: MobileErrorCode
    message: string
    details?: unknown
  }
}

export function mobileError(
  code: MobileErrorCode,
  message: string,
  status: number,
  details?: unknown
) {
  const body: MobileErrorBody = {
    error: {
      code,
      message,
      ...(details === undefined ? {} : { details }),
    },
  }

  return NextResponse.json(body, { status })
}

export function mobileValidationError(message = 'Invalid input', details?: unknown) {
  return mobileError('VALIDATION_ERROR', message, 400, details)
}

export function mobileUnauthenticated(message = 'Authentication required') {
  return mobileError('UNAUTHENTICATED', message, 401)
}

export function mobileForbidden(message = 'You are not allowed to perform this action') {
  return mobileError('FORBIDDEN', message, 403)
}

export function mobileErrorFromCode(code: MobileErrorCode, message?: string) {
  switch (code) {
    case 'UNAUTHENTICATED':
      return mobileError(code, message ?? 'Authentication required', 401)
    case 'INVALID_CREDENTIALS':
      return mobileError(code, message ?? 'Invalid email or password', 401)
    case 'FORBIDDEN':
      return mobileError(code, message ?? 'You are not allowed to perform this action', 403)
    case 'ACCOUNT_DISABLED':
      return mobileError(code, message ?? 'This account is disabled', 403)
    case 'DRIVER_NOT_LINKED':
      return mobileError(
        code,
        message ?? 'Driver account is not linked to an operational driver record',
        403
      )
    case 'DRIVER_INACTIVE':
      return mobileError(code, message ?? 'Driver account is not active', 403)
    case 'INVALID_DRIVER_STATUS':
      return mobileError(code, message ?? 'Driver status is invalid', 400)
    case 'ACTIVE_TRIP_PREVENTS_OFF_DUTY':
      return mobileError(code, message ?? 'An active trip prevents going off duty', 409)
    case 'INVALID_TRIP_VIEW':
      return mobileError(code, message ?? 'Trip view is invalid', 400)
    case 'BOOKING_NOT_FOUND':
      return mobileError(code, message ?? 'Booking not found', 404)
    case 'BOOKING_NOT_CANCELLABLE':
      return mobileError(code, message ?? 'Booking cannot be cancelled', 409)
    case 'BOOKING_ALREADY_CANCELLED':
      return mobileError(code, message ?? 'Booking is already cancelled', 409)
    case 'INVALID_CANCELLATION_REASON':
      return mobileError(code, message ?? 'Cancellation reason is invalid', 400)
    case 'TRIP_ALREADY_STARTED':
      return mobileError(code, message ?? 'Trip has already started', 409)
    case 'PARTIAL_CANCELLATION_NOT_SUPPORTED':
      return mobileError(code, message ?? 'Partial cancellation is not supported', 409)
    case 'TRIP_NOT_FOUND':
      return mobileError(code, message ?? 'Trip not found', 404)
    case 'TRIP_NOT_ASSIGNED':
      return mobileError(code, message ?? 'Trip is not assigned to this driver', 403)
    case 'TRIP_NOT_AVAILABLE':
      return mobileError(code, message ?? 'Trip is not available', 409)
    case 'TRIP_ALREADY_COMPLETED':
      return mobileError(code, message ?? 'Trip is already completed', 409)
    case 'TRIP_TERMINAL':
      return mobileError(code, message ?? 'Trip is already terminal', 409)
    case 'ACTION_NOT_ALLOWED':
      return mobileError(code, message ?? 'Trip action is not allowed', 409)
    case 'INVALID_TRANSITION':
      return mobileError(code, message ?? 'Trip transition is not allowed', 409)
    case 'PAYMENT_REQUIRED':
      return mobileError(code, message ?? 'Payment is required', 402)
    case 'VEHICLE_NOT_ASSIGNED':
      return mobileError(code, message ?? 'Vehicle is not assigned', 409)
    case 'RATE_LIMITED':
      return mobileError(code, message ?? 'Too many requests', 429)
    case 'TRACKING_NOT_ALLOWED':
      return mobileError(code, message ?? 'Tracking is not allowed for this trip', 403)
    case 'TRACKING_NOT_ACTIVE':
      return mobileError(code, message ?? 'Tracking is not active for this trip', 409)
    case 'LOCATION_INVALID':
      return mobileError(code, message ?? 'Location payload is invalid', 400)
    case 'LOCATION_STALE':
      return mobileError(code, message ?? 'Location update is stale', 409)
    case 'LOCATION_RATE_LIMITED':
      return mobileError(code, message ?? 'Too many location updates', 429)
    case 'PUSH_TOKEN_INVALID':
      return mobileError(code, message ?? 'Push token is invalid', 400)
    case 'PUSH_TOKEN_NOT_FOUND':
      return mobileError(code, message ?? 'Push token was not found', 404)
    case 'NOTIFICATION_NOT_FOUND':
      return mobileError(code, message ?? 'Notification not found', 404)
    case 'CHAT_NOT_AVAILABLE':
      return mobileError(code, message ?? 'Chat is not available for this trip', 409)
    case 'CONVERSATION_NOT_FOUND':
      return mobileError(code, message ?? 'Conversation not found', 404)
    case 'MESSAGE_NOT_FOUND':
      return mobileError(code, message ?? 'Message not found', 404)
    case 'MESSAGE_EMPTY':
      return mobileError(code, message ?? 'Message cannot be empty', 400)
    case 'MESSAGE_TOO_LONG':
      return mobileError(code, message ?? 'Message is too long', 400)
    case 'PAYMENT_NOT_FOUND':
      return mobileError(code, message ?? 'Payment not found', 404)
    case 'PAYMENT_ALREADY_COMPLETED':
      return mobileError(code, message ?? 'Payment has already been completed', 409)
    case 'BOOKING_NOT_PAYABLE':
      return mobileError(code, message ?? 'Booking is not payable', 409)
    case 'PAYMENT_PROVIDER_UNAVAILABLE':
      return mobileError(code, message ?? 'Payment provider is unavailable', 503)
    case 'ROUTE_NOT_FOUND':
      return mobileError(code, message ?? 'Route not found', 404)
    case 'VEHICLE_NOT_FOUND':
      return mobileError(code, message ?? 'Vehicle not found', 404)
    case 'ROUTE_NOT_AVAILABLE':
      return mobileError(code, message ?? 'Route is not available for booking', 409)
    case 'VEHICLE_NOT_AVAILABLE':
      return mobileError(code, message ?? 'Vehicle is not available for booking', 409)
    case 'NO_AVAILABILITY':
      return mobileError(code, message ?? 'No fleet unit is available for the selected date', 409)
    case 'INVALID_TRIP_DATES':
      return mobileError(code, message ?? 'Trip dates are invalid', 400)
    case 'INVALID_RETURN_DATE':
      return mobileError(code, message ?? 'Return date is required for round trips', 400)
    case 'PICKUP_AREA_REQUIRED':
      return mobileError(code, message ?? 'Pickup fare zone is required for this route', 400)
    case 'COUPON_INVALID':
      return mobileError(code, message ?? 'Coupon code is invalid', 400)
    case 'COUPON_EXPIRED':
      return mobileError(code, message ?? 'Coupon code has expired', 410)
    case 'QUOTE_UNAVAILABLE':
      return mobileError(code, message ?? 'Fare quote is unavailable for this selection', 409)
    case 'PAYMENT_AMOUNT_MISMATCH':
      return mobileError(code, message ?? 'Payment amount needs review', 409)
    case 'PAYMENT_FAILED':
    case 'PAYMENT_CANCELLED':
    case 'PAYMENT_EXPIRED':
      return mobileError(code, message ?? 'Payment was not completed', 409)
    case 'ONBOARDING_INCOMPLETE':
      return mobileError(code, message ?? 'Complete account onboarding to continue', 403)
    case 'PHONE_INVALID':
      return mobileError(code, message ?? 'Phone number is invalid', 400)
    case 'PHONE_VERIFICATION_REQUIRED':
      return mobileError(code, message ?? 'Use the onboarding flow to update phone details', 409)
    case 'OTP_INVALID':
      return mobileError(code, message ?? 'Verification code is invalid', 400)
    case 'OTP_EXPIRED':
      return mobileError(code, message ?? 'Verification code has expired', 410)
    case 'OTP_ATTEMPTS_EXCEEDED':
      return mobileError(code, message ?? 'Too many verification attempts', 429)
    case 'OTP_RESEND_TOO_SOON':
      return mobileError(code, message ?? 'Please wait before requesting another code', 429)
    case 'OTP_RATE_LIMITED':
      return mobileError(code, message ?? 'Too many verification code requests', 429)
    case 'RESET_TOKEN_INVALID':
      return mobileError(code, message ?? 'Password reset token is invalid', 400)
    case 'RESET_TOKEN_EXPIRED':
      return mobileError(code, message ?? 'Password reset token has expired', 410)
    case 'PASSWORD_INVALID':
      return mobileError(code, message ?? 'Password does not meet the required policy', 400)
    case 'CURRENT_PASSWORD_INVALID':
      return mobileError(code, message ?? 'Current password is invalid', 401)
    case 'SAVED_PLACE_NOT_FOUND':
      return mobileError(code, message ?? 'Saved place not found', 404)
    case 'SAVED_PLACE_TYPE_CONFLICT':
      return mobileError(code, message ?? 'A saved place with this type already exists', 409)
    case 'TRAVEL_PREFERENCE_INVALID':
      return mobileError(code, message ?? 'Travel preference is invalid', 400)
    case 'REVIEW_NOT_FOUND':
      return mobileError(code, message ?? 'Review not found', 404)
    case 'REVIEW_NOT_ALLOWED':
      return mobileError(code, message ?? 'This trip cannot be reviewed', 409)
    case 'REVIEW_ALREADY_EXISTS':
      return mobileError(code, message ?? 'This trip has already been reviewed', 409)
    case 'PAYMENT_RESOLUTION_NOT_FOUND':
      return mobileError(code, message ?? 'Payment follow-up was not found', 404)
    case 'EMAIL_ALREADY_IN_USE':
      return mobileError(code, message ?? 'Email address is already in use', 409)
    case 'EMAIL_CHANGE_NOT_FOUND':
      return mobileError(code, message ?? 'Email change request was not found', 404)
    case 'AVATAR_INVALID':
      return mobileError(code, message ?? 'Avatar image is invalid', 400)
    case 'AVATAR_STORAGE_UNAVAILABLE':
      return mobileError(code, message ?? 'Avatar storage is unavailable', 503)
    case 'ACCOUNT_DELETE_CONFIRMATION_INVALID':
      return mobileError(code, message ?? 'Account deletion confirmation is invalid', 400)
    case 'TOUR_NOT_FOUND':
      return mobileError(code, message ?? 'Tour not found', 404)
    case 'VALIDATION_ERROR':
      return mobileValidationError(message)
    case 'INTERNAL_ERROR':
    default:
      return mobileError('INTERNAL_ERROR', message ?? 'Server error', 500)
  }
}
