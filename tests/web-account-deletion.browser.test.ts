import test from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { createServer } from 'node:net'
import { setTimeout as delay } from 'node:timers/promises'
import { createRequire } from 'node:module'
import { mkdir } from 'node:fs/promises'
import { chromium } from 'playwright-core'
import { prisma } from '../src/lib/prisma'
import bcrypt from 'bcryptjs'

const base = process.env.WEB_DELETION_TEST_BASE_URL
const database = process.env.WEB_DELETION_TEST_DATABASE_URL

// Run against the production build on localhost with SMTP at 127.0.0.1:2527.
// The SMTP sink accepts only example.test recipients and never relays messages.
test(
  'EN/FR mobile public deletion: real HTTP, local SMTP, ownership confirmation and accessibility',
  { skip: !base || !database, timeout: 120000 },
  async () => {
    assert.ok(['localhost', '127.0.0.1'].includes(new URL(base!).hostname))
    assert.ok(['localhost', '127.0.0.1'].includes(new URL(database!).hostname))
    assert.match(new URL(database!).pathname, /^\/beninfy_dispatch_test/)
    assert.equal(process.env.DATABASE_URL, database)
    const emails: string[] = []
    const smtp = createServer((socket) => {
      socket.setTimeout(15000, () => socket.destroy())
      socket.write('220 localhost fixture SMTP\r\n')
      let buffer = '',
        dataMode = false,
        content = ''
      socket.on('data', (chunk) => {
        buffer += chunk.toString()
        let index: number
        while ((index = buffer.indexOf('\r\n')) >= 0) {
          const line = buffer.slice(0, index)
          buffer = buffer.slice(index + 2)
          if (dataMode) {
            if (line === '.') {
              emails.push(content)
              content = ''
              dataMode = false
              socket.write('250 accepted fixture\r\n')
            } else content += line + '\n'
          } else if (/^EHLO|^HELO/.test(line))
            socket.write('250-localhost\r\n250-AUTH PLAIN\r\n250 SIZE 100000\r\n')
          else if (/^AUTH PLAIN/.test(line)) socket.write('235 fixture authenticated\r\n')
          else if (/^MAIL FROM:|^RSET|^NOOP/.test(line)) socket.write('250 OK\r\n')
          else if (/^RCPT TO:/.test(line))
            socket.write(
              /@example\.test>$/i.test(line) ? '250 OK\r\n' : '550 fixture recipients only\r\n'
            )
          else if (line === 'DATA') {
            dataMode = true
            socket.write('354 End with dot\r\n')
          } else if (line === 'QUIT') socket.end('221 Bye\r\n')
          else socket.write('500 unsupported fixture command\r\n')
        }
      })
    })
    await new Promise<void>((resolve, reject) => {
      smtp.once('error', reject)
      smtp.listen(2527, '127.0.0.1', resolve)
    })
    const browser = await chromium.launch({ headless: true })
    const ids: string[] = []
    const require = createRequire(import.meta.url)
    await mkdir('node_modules/.cache/deletion-ui', { recursive: true })
    try {
      for (const locale of ['en', 'fr'] as const) {
        const user = await prisma.user.create({
          data: {
            email: `browser-${randomUUID()}@example.test`,
            name: 'Synthetic browser deletion',
            role: 'user',
            hashedPassword: locale === 'en' ? await bcrypt.hash('fixture-password-only', 4) : null,
          },
        })
        ids.push(user.id)
        const authContext = await browser.newContext({ baseURL: base })
        async function websiteLogin() {
          const csrf = await (await authContext.request.get('/api/auth/csrf')).json()
          await authContext.request.post('/api/auth/callback/credentials', {
            form: {
              csrfToken: csrf.csrfToken,
              email: user.email!,
              password: 'fixture-password-only',
              callbackUrl: `${base}/en/profile`,
            },
          })
          return (await authContext.request.get('/api/auth/session')).json()
        }
        if (locale === 'en') assert.equal((await websiteLogin()).user?.id, user.id)
        const context = await browser.newContext({
          viewport: { width: 360, height: 800 },
          locale,
          reducedMotion: 'reduce',
        })
        const fixtureIp = `fixture-${randomUUID()}`
        // Preserve production origin protection while testing a localhost production build.
        await context.route('**/api/account-deletion/**', async (route) => {
          const response = await route.fetch({
            headers: {
              ...route.request().headers(),
              origin: 'https://www.beninfy.com',
              'sec-fetch-site': 'same-origin',
              'x-forwarded-for': fixtureIp,
            },
          })
          await route.fulfill({ response })
        })
        const page = await context.newPage()
        await page.goto(`${base}/${locale === 'en' ? 'delete-account' : 'fr/delete-account'}`, {
          waitUntil: 'networkidle',
        })
        assert.equal(new URL(page.url()).pathname, `/${locale}/delete-account`)
        assert.equal(await page.locator('html').getAttribute('lang'), locale)
        assert.equal(await page.locator('[data-testid="account-deletion-page"] h1').count(), 1)
        assert.equal(
          await page
            .locator('[data-testid="account-deletion-page"] a[href="mailto:support@beninfy.com"]')
            .count(),
          1
        )
        assert.equal(
          await page
            .locator(`[data-testid="account-deletion-page"] a[href="/${locale}/privacy"]`)
            .count(),
          1
        )
        for (const width of [320, 390, 1280]) {
          await page.setViewportSize({ width, height: 850 })
          assert.equal(
            await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
            true,
            `${locale}: no overflow at ${width}px`
          )
        }
        await page.setViewportSize({ width: 390, height: 844 })
        await page.addScriptTag({ path: require.resolve('axe-core/axe.min.js') })
        async function accessibility(stage: string) {
          const violations = await page.evaluate(async () => {
            const axe = (
              window as unknown as {
                axe: {
                  run: (
                    context: unknown,
                    options: unknown
                  ) => Promise<{
                    violations: Array<{ id: string; impact: string; nodes: unknown[] }>
                  }>
                }
              }
            ).axe
            const result = await axe.run(
              { include: ['[data-testid="account-deletion-page"]'] },
              { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa'] } }
            )
            return result.violations.map(({ id, impact, nodes }) => ({
              id,
              impact,
              count: nodes.length,
            }))
          })
          assert.deepEqual(violations, [], `${locale}/${stage}: accessibility`)
        }
        await accessibility('email')
        await page.screenshot({
          path: `node_modules/.cache/deletion-ui/${locale}-mobile.png`,
          fullPage: true,
        })
        const emailInput = page.locator('#deletion-email')
        await emailInput.focus()
        await page.keyboard.type(user.email!)
        await page.keyboard.press('Tab')
        assert.equal(
          await page.evaluate(() => document.activeElement?.getAttribute('type')),
          'submit'
        )
        const before = emails.length
        const sentResponse = page.waitForResponse((response) =>
          response.url().endsWith('/api/account-deletion/request')
        )
        await page.keyboard.press('Enter')
        const sentResult = await sentResponse
        assert.equal(sentResult.status(), 202, `Request response: ${await sentResult.text()}`)
        await page.locator('#deletion-code').waitFor()
        assert.equal(await page.evaluate(() => document.activeElement?.id), 'deletion-form-title')
        assert.equal(
          (await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).disabledAt,
          null
        )
        for (let i = 0; emails.length === before && i < 100; i++) await delay(100)
        assert.equal(
          emails.length,
          before + 1,
          'Verification email delivered only to local SMTP sink'
        )
        // Match the verification sentence, not arbitrary eight-digit strings in
        // MIME Message-ID/recipient headers. Unfold quoted-printable soft wraps.
        const verificationMail = emails.at(-1)!.replace(/=\r?\n/g, '').replace(/=20/g, ' ')
        const code = verificationMail.match(/(?:code is|Beninfy est)\s*:\s*(\d{8})/)?.[1]
        assert.ok(code, `${locale}: eight-digit code present in verification message`)
        await page.locator('#deletion-code').fill(code === '00000000' ? '11111111' : '00000000')
        await page.locator('input[name="consent"]').check()
        await page.locator('form button[type="submit"]').click()
        await page.getByRole('alert').waitFor()
        await page.waitForFunction(() => document.activeElement?.getAttribute('role') === 'alert')
        assert.equal(
          await page.evaluate(() => document.activeElement?.getAttribute('role')),
          'alert'
        )
        await accessibility('invalid-code')
        await page.locator('#deletion-code').fill(code)
        const confirmationResponse = page.waitForResponse((response) =>
          response.url().endsWith('/api/account-deletion/confirm')
        )
        await page.locator('form button[type="submit"]').click()
        const confirmationResult = await confirmationResponse
        assert.equal(
          confirmationResult.status(),
          200,
          `${locale}: verified confirmation returned ${await confirmationResult.text()}`
        )
        await page.waitForFunction(() =>
          document.querySelector('#deletion-form-title')?.textContent?.includes('confirm')
        )
        await page.locator('form').waitFor({ state: 'detached' })
        const deleted = await prisma.user.findUniqueOrThrow({ where: { id: user.id } })
        assert.ok(deleted.deletionRequestedAt)
        assert.ok(deleted.disabledAt)
        assert.equal(deleted.anonymizedAt, null)
        if (locale === 'en') {
          assert.equal(
            (await (await authContext.request.get('/api/auth/session')).json()).user?.id,
            undefined
          )
          assert.equal((await websiteLogin()).user?.id, undefined)
        }
        await accessibility('confirmed')
        await context.close()
        await authContext.close()
      }
    } finally {
      for (const context of browser.contexts()) await context.unrouteAll({ behavior: 'wait' })
      await browser.close()
      await new Promise<void>((resolve) => smtp.close(() => resolve()))
      await prisma.auditLog.deleteMany({ where: { actorId: { in: ids } } })
      await prisma.user.deleteMany({ where: { id: { in: ids } } })
      await prisma.$disconnect()
    }
  }
)
