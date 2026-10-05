export type GoogleVerificationFailure =
  | 'provider_transport_failure'
  | 'provider_rejected'
  | 'provider_response_malformed'
  | 'issuer_mismatch'
  | 'audience_mismatch'
  | 'expired_or_invalid_expiry'
  | 'missing_subject'
  | 'missing_email'
  | 'unverified_email'

function decodedClaims(token: string): Record<string, unknown> | null {
  try {
    const parts = token.split('.')
    if (parts.length !== 3 || token.length > 12000) return null
    const claims: unknown = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'))
    return claims !== null && typeof claims === 'object' && !Array.isArray(claims)
      ? (claims as Record<string, unknown>)
      : null
  } catch {
    return null
  }
}

// These diagnostics inform operations only. Unverified claims never affect authentication.
export function safeGoogleVerificationDiagnostic(input: {
  token: string
  audiences: string[]
  iosClient: string | undefined
  reason: GoogleVerificationFailure
  providerStatus?: number
  verifiedClaims?: Record<string, unknown>
}) {
  const claims = input.verifiedClaims ?? decodedClaims(input.token)
  const authorizedPartyPresent = claims
    ? typeof claims.azp === 'string' && claims.azp.length > 0
    : null

  return {
    event: 'mobile_google_verification_failed',
    reason: input.reason,
    providerStatus: input.providerStatus ?? null,
    metadataSource: input.verifiedClaims ? 'google_tokeninfo' : 'unverified_token_payload',
    malformedCredential: claims === null,
    audienceAllowed: claims
      ? typeof claims.aud === 'string' && input.audiences.includes(claims.aud)
      : null,
    authorizedPartyPresent,
    authorizedPartyMatchesIosClient:
      authorizedPartyPresent && input.iosClient ? claims!.azp === input.iosClient : null,
    issuerValid: claims
      ? claims.iss === 'accounts.google.com' || claims.iss === 'https://accounts.google.com'
      : null,
    expiryValid: claims
      ? Number.isFinite(Number(claims.exp)) && Number(claims.exp) * 1000 > Date.now()
      : null,
    subjectPresent: claims ? typeof claims.sub === 'string' && claims.sub.trim().length > 0 : null,
    emailPresent: claims
      ? typeof claims.email === 'string' && claims.email.trim().length > 0
      : null,
    emailVerified: claims
      ? claims.email_verified === true || claims.email_verified === 'true'
      : null,
    signatureJwkDiagnostic: input.verifiedClaims ? 'provider_accepted' : 'not_available',
  }
}
