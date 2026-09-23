import test from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID, createHash } from 'node:crypto'
import { encode } from 'next-auth/jwt'
import { prisma } from '../src/lib/prisma'

const base = process.env.ADMIN_NOTIFICATION_TEST_BASE_URL
const database = process.env.ADMIN_NOTIFICATION_TEST_DATABASE_URL
const secret = 'local-notification-http-fixture-only'
test(
  'Admin notification HTTP authorization, confirmation and inbox integration',
  { skip: !base || !database, timeout: 60000 },
  async (t) => {
    assert.equal(process.env.DATABASE_URL, database)
    assert.ok(['127.0.0.1', 'localhost'].includes(new URL(base!).hostname))
    assert.ok(['127.0.0.1', 'localhost'].includes(new URL(database!).hostname))
    assert.match(new URL(database!).pathname, /^\/beninfy_dispatch_test/)
    const prefix = 'admin-http-' + randomUUID()
    const admin = await prisma.user.create({ data: { id: prefix + '-admin', role: 'admin' } })
    const support = await prisma.user.create({
      data: { id: prefix + '-support', role: 'support_admin' },
    })
    const customer = await prisma.user.create({
      data: {
        id: prefix + '-customer',
        role: 'user',
        name: prefix,
        email: prefix + '@example.test',
      },
    })
    async function cookie(id: string) {
      const salt = 'authjs.session-token'
      return (
        salt + '=' + (await encode({ secret, salt, token: { sub: id, id, sessionVersion: 0 } }))
      )
    }
    const adminCookie = await cookie(admin.id)
    const supportCookie = await cookie(support.id)
    async function request(path: string, authCookie?: string, body?: unknown, origin = base!) {
      return fetch(base + '/api/admin/notifications' + path, {
        method: body === undefined ? 'GET' : 'POST',
        headers: {
          ...(authCookie ? { Cookie: authCookie } : {}),
          Origin: origin,
          'Content-Type': 'application/json',
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        redirect: 'manual',
      })
    }
    try {
      await t.test('all routes deny anonymous and insufficient-role requests', async () => {
        for (const authCookie of [undefined, supportCookie]) {
          for (const [path, body] of [
            ['', undefined],
            ['', {}],
            ['/preview', {}],
            ['/recipients?audience=customer&q=test', undefined],
            ['/missing', undefined],
          ] as const)
            assert.equal((await request(path, authCookie, body)).status, 403)
        }
      })
      await t.test(
        'same-origin required and selected identities come from authenticated search',
        async () => {
          assert.equal(
            (await request('/preview', adminCookie, {}, 'https://untrusted.test')).status,
            403
          )
          const r = await request(
            '/recipients?audience=customer&q=' + encodeURIComponent(prefix),
            adminCookie
          )
          assert.equal(r.status, 200)
          const data = await r.json()
          assert.deepEqual(
            data.recipients.map((u: { id: string }) => u.id),
            [customer.id]
          )
        }
      )
      await t.test(
        'preview then confirm persists only one inbox record and reports no-device state',
        async () => {
          const content = {
            en: { title: 'HTTP fixture', body: 'Synthetic local message' },
            fr: { title: 'Essai HTTP', body: 'Message local' },
          }
          const r = await request('/preview', adminCookie, {
            requestId: randomUUID(),
            audience: 'customer',
            recipientId: customer.id,
            content,
          })
          assert.equal(r.status, 200, r.status === 200 ? undefined : await r.text())
          const preview = await r.json()
          assert.equal(preview.recipientCount, 1)
          assert.equal(preview.deviceCount, 0)
          const body = { campaignId: preview.id, confirmation: preview.confirmation }
          assert.equal((await request('', adminCookie, body)).status, 200)
          const duplicate = await request('', adminCookie, body)
          assert.equal((await duplicate.json()).duplicate, true)
          assert.equal(await prisma.notification.count({ where: { campaignId: preview.id } }), 1)
          const detail = await (await request('/' + preview.id, adminCookie)).json()
          assert.equal(detail.noActiveDevice, 1)
          const history = await (await request('', adminCookie)).json()
          assert.ok(history.history.some((row: { id: string }) => row.id === preview.id))
          assert.equal(
            (await request('', adminCookie, { campaignId: preview.id, confirmation: 'wrong' }))
              .status,
            400
          )
          assert.equal(
            await prisma.auditLog.count({
              where: { actorId: admin.id, action: 'notification.rejected' },
            }),
            1
          )
        }
      )
      await t.test('oversized body and markup rejected before notification creation', async () => {
        assert.equal(
          (await request('/preview', adminCookie, { huge: 'x'.repeat(17000) })).status,
          413
        )
        assert.equal(
          (
            await request('/preview', adminCookie, {
              requestId: randomUUID(),
              audience: 'all_customers',
              content: {
                en: { title: '<script>bad</script>', body: 'bad' },
                fr: { title: 'Test', body: 'Test' },
              },
            })
          ).status,
          400
        )
      })
      await t.test(
        'Admin page renders existing layout/navigation and send action; support page denies access',
        async () => {
          const r = await fetch(base + '/en/admin/notifications', {
            headers: { Cookie: adminCookie },
          })
          assert.equal(r.status, 200)
          const html = await r.text()
          assert.ok(html.includes('Send notification'))
          assert.ok(html.includes('Backoffice'))
          const denied = await fetch(base + '/en/admin/notifications', {
            headers: { Cookie: supportCookie },
          })
          assert.ok((await denied.text()).includes('Access denied.'))
        }
      )
    } finally {
      const rows = await prisma.adminNotificationCampaign.findMany({
        where: { actorId: admin.id },
        select: { id: true },
      })
      await prisma.notification.deleteMany({ where: { campaignId: { in: rows.map((r) => r.id) } } })
      await prisma.adminNotificationCampaign.deleteMany({ where: { actorId: admin.id } })
      await prisma.auditLog.deleteMany({ where: { actorId: admin.id } })
      await prisma.rateLimitBucket.deleteMany({
        where: {
          key: createHash('sha256')
            .update('admin.notifications:' + admin.id)
            .digest('hex'),
        },
      })
      await prisma.user.deleteMany({ where: { id: { in: [admin.id, support.id, customer.id] } } })
      await prisma.$disconnect()
    }
  }
)
