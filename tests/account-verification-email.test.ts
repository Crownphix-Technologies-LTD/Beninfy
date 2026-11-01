import test from 'node:test'
import assert from 'node:assert/strict'
import { buildAccountVerificationEmail } from '../src/lib/account-verification-email'

for (const locale of ['en', 'fr'] as const) {
  test(`${locale} account verification HTML and text agree and use actual expiry`, () => {
    const email = buildAccountVerificationEmail({ email: 'fixture@example.test', code: '042731', expiresAt: new Date('2030-05-06T12:17:00Z'), locale })
    assert.ok(email.html.includes('042731'))
    assert.ok(email.text.includes('042731'))
    assert.match(email.html, /font-size:32px/)
    assert.match(email.html, /user-select:text/)
    assert.match(email.html, /width="100%"/)
    assert.match(email.html, /max-width:560px/)
    assert.match(email.html, new RegExp(`lang="${locale}"`))
    assert.match(email.text, /12:17:00/)
    assert.match(email.html, /12:17:00/)
    assert.match(email.text, /UTC/)
    assert.ok(email.text.includes(email.subject))
    assert.doesNotMatch(email.html, /<img|payment|Paystack|href=|ride|login/i)
    assert.doesNotMatch(email.text, /payment|Paystack|login/i)
    assert.ok(email.text.includes(locale === 'fr' ? 'Ne partagez jamais' : 'Never share'))
    assert.ok(email.text.includes(locale === 'fr' ? 'ignorer ce message' : 'ignore this message'))
    if (locale === 'fr') assert.doesNotMatch(email.html, /Verification code|Expires|Account email/)
  })
}
test('untrusted values are escaped and expiry is not a hardcoded TTL', () => {
  const email = buildAccountVerificationEmail({ email: 'fixture@example.test', code: '<script>', expiresAt: new Date('2030-05-06T13:42:00Z') })
  assert.doesNotMatch(email.html, /<script>/)
  assert.match(email.html, /&lt;script&gt;/)
  assert.match(email.text, /13:42:00/)
})
