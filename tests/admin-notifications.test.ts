import { isSameOriginNotificationRequest } from '../src/lib/admin/notificationHttp'
import test from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { prisma } from '../src/lib/prisma'
import {
  previewAdminNotification,
  queueAdminNotification,
  authorizeNotificationActor,
  adminNotificationDashboard,
  adminNotificationDetail,
  searchNotificationRecipients,
} from '../src/lib/admin/notificationManagement'
import {
  announcementContentSchema,
  notificationPreviewSchema,
  confirmationPhrase,
} from '../src/lib/admin/notificationContract'
import {
  customerPushData,
  deliverNotification,
  processDueNotificationDeliveries,
  type PushNotificationProvider,
} from '../src/lib/mobile/notifications'
import { adminRoleCan } from '../src/lib/roles'

const content = {
  en: { title: 'Service announcement', body: 'English information' },
  fr: { title: 'Annonce de service', body: 'Informations en français' },
}
test('plain-text EN/FR limits, audience shape and no raw browser counts', () => {
  assert.equal(announcementContentSchema.safeParse(content).success, true)
  for (const bad of ['<script>alert(1)</script>', '<b>hello</b>', 'hello\u0000', 'a'.repeat(101)])
    assert.equal(
      announcementContentSchema.safeParse({ ...content, en: { ...content.en, title: bad } })
        .success,
      false
    )
  assert.equal(
    announcementContentSchema.safeParse({ ...content, fr: { title: 'ok', body: 'x'.repeat(1001) } })
      .success,
    false
  )
  const input = { requestId: randomUUID(), audience: 'all_customers', content }
  for (const extra of [
    { recipientCount: 1 },
    { recipientIds: ['attacker'] },
    { token: 'not-allowed' },
    { recipientId: 'user' },
  ])
    assert.equal(notificationPreviewSchema.safeParse({ ...input, ...extra }).success, false)
  assert.equal(
    notificationPreviewSchema.safeParse({ ...input, audience: 'customer' }).success,
    false
  )
  assert.equal(confirmationPhrase('all_customers', 1248), 'Send to 1,248 Customers')
})
test('notification management uses existing restrictive users permission', () => {
  for (const role of ['admin', 'super_admin']) assert.equal(adminRoleCan(role, 'users'), true)
  for (const role of [
    'user',
    'driver',
    'operations_admin',
    'support_admin',
    'finance_admin',
    'content_admin',
  ])
    assert.equal(adminRoleCan(role, 'users'), false)
})
test('admin.message uses inbox identity without fabricated business navigation', () => {
  assert.deepEqual(
    customerPushData({
      id: 'notification',
      type: 'admin.message',
      payload: { bookingId: 'must-not-leak', url: 'https://untrusted.test' },
    }),
    { version: '1', type: 'admin.message', notificationId: 'notification' }
  )
})

const url = process.env.ADMIN_NOTIFICATION_TEST_DATABASE_URL
test(
  'Admin notification PostgreSQL persistence, authorization, fanout and safety',
  { skip: !url, timeout: 120000 },
  async (t) => {
    assert.equal(process.env.DATABASE_URL, url)
    const target = new URL(url!)
    assert.ok(['localhost', '127.0.0.1'].includes(target.hostname))
    assert.match(target.pathname, /^\/beninfy_dispatch_test/)
    t.mock.method(globalThis, 'fetch', async () => {
      assert.fail('Live network prohibited in notification tests')
    })
    t.mock.method(console, 'info', () => {})
    const prefix = 'admin-notify-' + randomUUID()
    const actor = await prisma.user.create({ data: { id: prefix + '-actor', role: 'admin' } })
    const support = await prisma.user.create({
      data: { id: prefix + '-support', role: 'support_admin' },
    })
    const a = await prisma.user.create({
      data: {
        id: prefix + '-a',
        name: prefix + ' Customer',
        email: prefix + '@example.test',
        locale: 'en',
        role: 'user',
      },
    })
    const b = await prisma.user.create({ data: { id: prefix + '-b', locale: 'fr', role: 'user' } })
    const driver = await prisma.user.create({
      data: { id: prefix + '-driver', name: prefix + ' Driver', locale: 'fr', role: 'driver' },
    })
    const disabled = await prisma.user.create({
      data: { id: prefix + '-disabled', role: 'user', disabledAt: new Date() },
    })
    const extraIds: string[] = []
    const contentInput = (audience = 'customer', recipientId: string | undefined = a.id) => ({
      requestId: randomUUID(),
      audience,
      ...(!audience.startsWith('all_') && recipientId ? { recipientId } : {}),
      content,
    })
    async function device(userId: string, appType = 'customer', language = 'en', active = true) {
      const session = await prisma.mobileSession.create({
        data: {
          userId,
          refreshTokenHash: randomUUID(),
          expiresAt: new Date(Date.now() + 3600000),
          revokedAt: active ? null : new Date(),
        },
      })
      return prisma.pushDevice.create({
        data: {
          userId,
          appType,
          language,
          sessionId: session.id,
          principalType: appType === 'customer' ? 'CUSTOMER' : 'DRIVER',
          platform: 'android',
          token: 'synthetic-' + randomUUID(),
          tokenHash: randomUUID(),
          deviceId: randomUUID(),
        },
      })
    }
    const d1 = await device(a.id)
    await device(a.id, 'customer', 'fr')
    await device(a.id, 'customer', 'en', false)
    await device(driver.id, 'driver', 'fr')
    let sends = 0
    const sentCopies: Array<{ title: string; body: string; data: Record<string, string> }> = []
    const provider: PushNotificationProvider = {
      name: 'mock',
      async send(input) {
        sends++
        sentCopies.push({ title: input.title, body: input.body, data: input.data })
        return { ok: true }
      },
    }
    async function queue(audience = 'customer', recipientId: string | undefined = a.id) {
      const preview = await previewAdminNotification(actor.id, contentInput(audience, recipientId))
      return {
        preview,
        result: await queueAdminNotification(actor.id, {
          campaignId: preview.id,
          confirmation: preview.confirmation,
        }),
      }
    }
    try {
      await t.test(
        'unauthenticated, insufficient permission, inactive and wrong-role recipients rejected',
        async () => {
          await assert.rejects(authorizeNotificationActor(undefined), /Forbidden/)
          await assert.rejects(previewAdminNotification(support.id, contentInput()), /Forbidden/)
          await assert.rejects(
            queueAdminNotification(support.id, { campaignId: 'unknown', confirmation: '' }),
            /Forbidden/
          )
          await assert.rejects(
            previewAdminNotification(actor.id, contentInput('driver', a.id)),
            /No eligible/
          )
          await assert.rejects(
            previewAdminNotification(actor.id, contentInput('customer', disabled.id)),
            /No eligible/
          )
          const found = await searchNotificationRecipients(actor.id, 'customer', prefix)
          assert.deepEqual(
            found.map((u) => u.id),
            [a.id]
          )
          assert.ok(!JSON.stringify(found).includes('synthetic-'))
        }
      )
      await t.test(
        'individual Customer: immutable preview, two eligible devices, persistence first and atomic audit',
        async () => {
          const input = contentInput()
          const preview = await previewAdminNotification(actor.id, input)
          const retryPreview = await previewAdminNotification(actor.id, input)
          assert.equal(preview.id, retryPreview.id)
          assert.equal(preview.recipientCount, 1)
          assert.equal(preview.deviceCount, 2)
          assert.equal(await prisma.notification.count({ where: { campaignId: preview.id } }), 0)
          await assert.rejects(
            previewAdminNotification(actor.id, {
              ...input,
              content: { ...content, en: { ...content.en, title: 'Different' } },
            }),
            /different content/
          )
          const inputSend = { campaignId: preview.id, confirmation: preview.confirmation }
          const attempts = await Promise.all([
            queueAdminNotification(actor.id, inputSend),
            queueAdminNotification(actor.id, inputSend),
          ])
          assert.equal(attempts.filter((r) => r.duplicate).length, 1)
          const rows = await prisma.notification.findMany({
            where: { campaignId: preview.id },
            include: { deliveries: true },
          })
          assert.equal(rows.length, 1)
          assert.equal(rows[0].title, content.en.title)
          assert.equal(rows[0].deliveries.length, 2)
          assert.ok(rows[0].deliveries.every((d) => d.status === 'pending' && d.attempts === 0))
          assert.equal(sends, 0)
          const audit = await prisma.auditLog.findMany({
            where: { entityId: preview.id, action: 'notification.queued' },
          })
          assert.equal(audit.length, 1)
          assert.equal(audit[0].actorId, actor.id)
          assert.equal((audit[0].metadata as { result: string }).result, 'queued')
          await deliverNotification(rows[0].id, provider)
          assert.equal(sends, 2)
          assert.deepEqual(
            new Set(sentCopies.map((c) => c.title)),
            new Set([content.en.title, content.fr.title])
          )
          for (const sent of sentCopies)
            assert.deepEqual(sent.data, {
              version: '1',
              type: 'admin.message',
              notificationId: rows[0].id,
            })
          await deliverNotification(rows[0].id, provider)
          assert.equal(sends, 2)
          const detail = await adminNotificationDetail(actor.id, preview.id)
          assert.equal(detail.deliverySummary.sent, 2)
          assert.ok(!JSON.stringify(detail).includes('synthetic-'))
        }
      )
      await t.test(
        'individual Driver receives localized general notification with no navigation',
        async () => {
          const { preview } = await queue('driver', driver.id)
          const n = await prisma.notification.findFirstOrThrow({
            where: { campaignId: preview.id },
          })
          assert.equal(n.language, 'fr')
          assert.equal(n.title, content.fr.title)
          await processDueNotificationDeliveries({ provider })
          assert.equal(sentCopies.at(-1)!.data.type, 'admin.message')
          assert.equal(sentCopies.at(-1)!.data.entityId, undefined)
        }
      )
      await t.test(
        'Customer without active device gets durable localized inbox notification, no delivery rows',
        async () => {
          const { preview } = await queue('customer', b.id)
          assert.equal(preview.deviceCount, 0)
          const row = await prisma.notification.findFirstOrThrow({
            where: { campaignId: preview.id },
            include: { deliveries: true },
          })
          assert.equal(row.title, content.fr.title)
          assert.equal(row.deliveryState, 'skipped_no_device')
          assert.equal(row.deliveries.length, 0)
          assert.equal((await adminNotificationDetail(actor.id, preview.id)).noActiveDevice, 1)
        }
      )
      await t.test(
        'all Customers and all Drivers use server counts, exact broadcast confirmation and role isolation',
        async () => {
          for (const [audience, role] of [
            ['all_customers', 'user'],
            ['all_drivers', 'driver'],
          ]) {
            const preview = await previewAdminNotification(
              actor.id,
              contentInput(audience, undefined)
            )
            const count = await prisma.user.count({
              where: { role, disabledAt: null, deletionRequestedAt: null, anonymizedAt: null },
            })
            assert.equal(preview.recipientCount, count)
            await assert.rejects(
              queueAdminNotification(actor.id, { campaignId: preview.id, confirmation: 'yes' }),
              /exact confirmation/
            )
            await assert.rejects(
              queueAdminNotification(actor.id, {
                campaignId: preview.id,
                confirmation: preview.confirmation,
                recipientCount: 1,
              }),
              /Invalid confirmation/
            )
            await queueAdminNotification(actor.id, {
              campaignId: preview.id,
              confirmation: preview.confirmation,
            })
            const notifications = await prisma.notification.findMany({
              where: { campaignId: preview.id },
              include: { user: true },
            })
            assert.equal(notifications.length, count)
            assert.ok(notifications.every((n) => n.user.role === role))
          }
        }
      )
      await t.test(
        'changed audience/device set, expired preview and another actor cannot confirm',
        async () => {
          const preview = await previewAdminNotification(actor.id, contentInput())
          const input = { campaignId: preview.id, confirmation: preview.confirmation }
          await prisma.pushDevice.update({ where: { id: d1.id }, data: { revokedAt: new Date() } })
          await assert.rejects(queueAdminNotification(actor.id, input), /changed/)
          await prisma.pushDevice.update({ where: { id: d1.id }, data: { revokedAt: null } })
          await prisma.adminNotificationCampaign.update({
            where: { id: preview.id },
            data: { expiresAt: new Date(0) },
          })
          await assert.rejects(queueAdminNotification(actor.id, input), /expired/)
          await prisma.user.update({ where: { id: support.id }, data: { role: 'admin' } })
          await assert.rejects(queueAdminNotification(support.id, input), /not found/)
          const broadcast = await previewAdminNotification(
            actor.id,
            contentInput('all_drivers', undefined)
          )
          const added = await prisma.user.create({
            data: { id: prefix + '-added', role: 'driver' },
          })
          extraIds.push(added.id)
          await assert.rejects(
            queueAdminNotification(actor.id, {
              campaignId: broadcast.id,
              confirmation: broadcast.confirmation,
            }),
            /changed/
          )
        }
      )
      await t.test(
        'provider failure preserves inbox, audit and retryable delivery; pending rows survive worker deadlines',
        async () => {
          const { preview } = await queue()
          const row = await prisma.notification.findFirstOrThrow({
            where: { campaignId: preview.id },
          })
          await deliverNotification(row.id, provider, 0)
          assert.equal(
            (await prisma.notification.findUniqueOrThrow({ where: { id: row.id } })).deliveryState,
            'pending'
          )
          const fail: PushNotificationProvider = {
            name: 'mock',
            async send() {
              throw new Error('synthetic failure')
            },
          }
          await deliverNotification(row.id, fail)
          assert.equal(
            (await prisma.notification.findUniqueOrThrow({ where: { id: row.id } })).deliveryState,
            'failed'
          )
          assert.equal(await prisma.auditLog.count({ where: { entityId: preview.id } }), 1)
          assert.equal(
            await prisma.notificationDelivery.count({
              where: { notificationId: row.id, status: 'failed' },
            }),
            2
          )
        }
      )
      await t.test('revoked devices are skipped without provider contact', async () => {
        const { preview } = await queue()
        const row = await prisma.notification.findFirstOrThrow({
          where: { campaignId: preview.id },
        })
        const before = sends
        await prisma.pushDevice.updateMany({
          where: { userId: a.id },
          data: { revokedAt: new Date() },
        })
        await deliverNotification(row.id, provider)
        assert.equal(sends, before)
        assert.equal(
          await prisma.notificationDelivery.count({
            where: { notificationId: row.id, status: 'pending' },
          }),
          0
        )
        assert.equal(
          (await prisma.notification.findUniqueOrThrow({ where: { id: row.id } })).deliveryState,
          'skipped_no_device'
        )
      })
      await t.test(
        'audit storage failure rolls back the entire enqueue and permits a safe retry',
        async () => {
          const preview = await previewAdminNotification(actor.id, contentInput('customer', b.id))
          const input = { campaignId: preview.id, confirmation: preview.confirmation }
          await prisma.$executeRawUnsafe(
            `CREATE FUNCTION admin_notification_test_reject_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.action = 'notification.queued' THEN RAISE EXCEPTION 'Synthetic audit storage failure'; END IF; RETURN NEW; END $$`
          )
          await prisma.$executeRawUnsafe(
            `CREATE TRIGGER admin_notification_test_audit BEFORE INSERT ON "AuditLog" FOR EACH ROW EXECUTE FUNCTION admin_notification_test_reject_audit()`
          )
          try {
            await assert.rejects(queueAdminNotification(actor.id, input))
            assert.equal(await prisma.notification.count({ where: { campaignId: preview.id } }), 0)
            assert.equal(
              (
                await prisma.adminNotificationCampaign.findUniqueOrThrow({
                  where: { id: preview.id },
                })
              ).status,
              'preview'
            )
          } finally {
            await prisma.$executeRawUnsafe(
              `DROP TRIGGER admin_notification_test_audit ON "AuditLog"`
            )
            await prisma.$executeRawUnsafe(`DROP FUNCTION admin_notification_test_reject_audit()`)
          }
          assert.equal((await queueAdminNotification(actor.id, input)).duplicate, false)
        }
      )
      await t.test(
        'broadcast persists more than one insert batch without contacting the provider',
        async () => {
          const ids = Array.from({ length: 501 }, (_, i) => prefix + '-batch-' + i)
          extraIds.push(...ids)
          await prisma.user.createMany({
            data: ids.map((id) => ({ id, role: 'driver', locale: 'fr' })),
          })
          const before = sends
          const { preview } = await queue('all_drivers', undefined)
          assert.ok(preview.recipientCount >= 501)
          assert.equal(
            await prisma.notification.count({ where: { campaignId: preview.id } }),
            preview.recipientCount
          )
          assert.equal(
            await prisma.notification.count({
              where: { campaignId: preview.id, userId: { in: ids }, title: content.fr.title },
            }),
            501
          )
          assert.equal(sends, before)
          await prisma.user.deleteMany({ where: { id: { in: ids } } })
        }
      )
      await t.test('bulk cap refuses oversized audience before notification creation', async () => {
        const ids = Array.from({ length: 5001 }, (_, i) => prefix + '-bulk-' + i)
        extraIds.push(...ids)
        await prisma.user.createMany({ data: ids.map((id) => ({ id, role: 'driver' })) })
        const before = await prisma.notification.count()
        await assert.rejects(
          previewAdminNotification(actor.id, contentInput('all_drivers', undefined)),
          /at most 5,000/
        )
        assert.equal(await prisma.notification.count(), before)
        await prisma.user.deleteMany({ where: { id: { in: ids } } })
      })
      await t.test('dashboard reports aggregate counts and safe paginated history', async () => {
        const dashboard = await adminNotificationDashboard(actor.id)
        assert.ok(dashboard.metrics.notifications > 0)
        assert.ok(dashboard.history.length > 0)
        assert.ok(dashboard.history.every((row) => row.type === 'admin.message'))
        assert.ok(!JSON.stringify(dashboard).includes('synthetic-'))
      })
    } finally {
      const campaigns = await prisma.adminNotificationCampaign.findMany({
        where: { actorId: actor.id },
        select: { id: true },
      })
      const ids = campaigns.map((c) => c.id)
      await prisma.notification.deleteMany({ where: { campaignId: { in: ids } } })
      await prisma.auditLog.deleteMany({ where: { actorId: actor.id } })
      await prisma.adminNotificationCampaign.deleteMany({ where: { actorId: actor.id } })
      await prisma.user.deleteMany({
        where: {
          id: { in: [actor.id, support.id, a.id, b.id, driver.id, disabled.id, ...extraIds] },
        },
      })
      await prisma.$disconnect()
    }
  }
)

test('Admin mutations reject absent, malformed and foreign Origin while supporting proxy Host', () => {
  const request = (origin?: string) =>
    new Request('http://internal:3000/api/admin/notifications', {
      headers: {
        host: 'www.beninfy.com',
        'x-forwarded-proto': 'https',
        ...(origin ? { Origin: origin } : {}),
      },
    })
  assert.equal(isSameOriginNotificationRequest(request('https://www.beninfy.com')), true)
  for (const origin of [
    undefined,
    'null',
    'https://untrusted.test',
    'https://www.beninfy.com/untrusted',
    'http://www.beninfy.com',
    'https://www.beninfy.com:9999',
  ])
    assert.equal(isSameOriginNotificationRequest(request(origin)), false)
})
