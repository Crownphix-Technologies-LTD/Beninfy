import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { X509Certificate } from 'node:crypto'
const read = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8')
const pkg = JSON.parse(read('package.json'))
const vercel = JSON.parse(read('vercel.json'))
test('deployment and install lifecycle cannot run schema mutations', () => {
  assert.equal(vercel.buildCommand, 'npm run build')
  for (const key of ['preinstall', 'install', 'postinstall', 'prebuild', 'build', 'postbuild']) {
    assert.doesNotMatch(pkg.scripts[key] ?? '', /migrate|db push|db:|seed/)
  }
  assert.match(pkg.scripts.build, /prisma generate/)
  assert.match(pkg.scripts.build, /next build/)
  assert.equal(pkg.scripts['db:migrate'], 'prisma migrate deploy')
})
test('payment schedule remains unchanged and deletion is not scheduled', () => {
  assert.deepEqual(vercel.crons, [{path: '/api/workers/payments/reconcile', schedule: '0 3 * * *'}])
})
test('verified public Supabase CA is bundled for strict runtime TLS', () => {
  const cert = new X509Certificate(read('certs/supabase-ca.crt'))
  assert.equal(cert.ca, true)
  assert.equal(cert.fingerprint256.replaceAll(':', '').toLowerCase(), '807025ad50d4ed219d2c9c7d299c004f824eb00cf7f65afef607d07b72e6cafa')
  assert.ok(new Date(cert.validTo).getTime() > Date.now())
  assert.match(read('next.config.ts'), /outputFileTracingIncludes:[\s\S]*?['"]\/\*['"]: \[.*certs\/supabase-ca\.crt/)
})
