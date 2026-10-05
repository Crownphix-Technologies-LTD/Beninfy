import test from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { prisma } from '../src/lib/prisma'
import { issueMobileTokens } from '../src/lib/mobile/auth'
import { GET, POST } from '../src/app/api/mobile/v1/customer/saved-travellers/route'
import {
  DELETE,
  PATCH,
} from '../src/app/api/mobile/v1/customer/saved-travellers/[savedTravellerId]/route'

const url = process.env.SAVED_TRAVELLERS_TEST_DATABASE_URL

test(
  'Saved Traveller PostgreSQL API enforces ownership and preserves booking snapshots',
  { skip: !url, timeout: 60000 },
  async (t) => {
    assert.equal(process.env.DATABASE_URL, url)
    const target = new URL(url!)
    assert.ok(['localhost', '127.0.0.1'].includes(target.hostname))
    assert.match(target.pathname, /^\/beninfy_(dispatch|tour|saved_travellers)_test/)

    const previousSecret = process.env.MOBILE_AUTH_SECRET
    process.env.MOBILE_AUTH_SECRET = 'fixture-saved-traveller-auth-secret'
    const prefix = `saved-traveller-${randomUUID()}`
    const users = await Promise.all(
      [0, 1].map((index) =>
        prisma.user.create({
          data: {
            name: `${prefix}-${index}`,
            email: `${prefix}-${index}@example.test`,
            phone: '+2290102030405',
            emailVerified: new Date(),
          },
        })
      )
    )
    const vehicle = await prisma.vehicle.create({
      data: { id: prefix, name: 'Saved traveller fixture', capacity: 4 },
    })

    async function headers(userIndex: number) {
      const auth = await issueMobileTokens({
        user: users[userIndex],
        principalType: 'CUSTOMER',
        device: { deviceId: `${prefix}-${userIndex}`, platform: 'ios' },
      })
      return { Authorization: `Bearer ${auth.accessToken}`, 'Content-Type': 'application/json' }
    }
    const aHeaders = await headers(0)
    const bHeaders = await headers(1)
    const collectionUrl = 'https://test/api/mobile/v1/customer/saved-travellers'
    const itemContext = (id: string) => ({ params: Promise.resolve({ savedTravellerId: id }) })

    try {
      await t.test('authentication and empty list', async () => {
        assert.equal((await GET(new Request(collectionUrl))).status, 401)
        const response = await GET(new Request(collectionUrl, { headers: aHeaders }))
        assert.equal(response.status, 200)
        assert.deepEqual(await response.json(), { savedTravellers: [] })
      })

      const spoofedCreate = await POST(
        new Request(collectionUrl, {
          method: 'POST',
          headers: aHeaders,
          body: JSON.stringify({
            fullName: 'Ada Traveller',
            phone: '00229 01 02 03 04 05',
            email: 'ADA@EXAMPLE.COM',
            label: 'Colleague',
            customerId: users[1].id,
          }),
        })
      )
      assert.equal(spoofedCreate.status, 400)

      const createdResponse = await POST(
        new Request(collectionUrl, {
          method: 'POST',
          headers: aHeaders,
          body: JSON.stringify({
            fullName: 'Ada Traveller',
            phone: '00229 01 02 03 04 05',
            email: 'ADA@EXAMPLE.COM',
            label: 'Colleague',
          }),
        })
      )
      assert.equal(createdResponse.status, 201)
      const created = (await createdResponse.json()).savedTraveller
      assert.equal(created.phone, '+2290102030405')
      assert.equal(created.email, 'ada@example.com')
      assert.equal('userId' in created, false)
      assert.equal(
        (await prisma.savedTraveller.findUniqueOrThrow({ where: { id: created.id } })).userId,
        users[0].id
      )

      await t.test('list and update return the owned profile', async () => {
        const list = await GET(new Request(collectionUrl, { headers: aHeaders }))
        assert.equal((await list.json()).savedTravellers.length, 1)
        const otherCustomerList = await GET(new Request(collectionUrl, { headers: bHeaders }))
        assert.deepEqual(await otherCustomerList.json(), { savedTravellers: [] })
        const updated = await PATCH(
          new Request(`${collectionUrl}/${created.id}`, {
            method: 'PATCH',
            headers: aHeaders,
            body: JSON.stringify({ label: 'Wife', email: null }),
          }),
          itemContext(created.id)
        )
        assert.equal(updated.status, 200)
        const updatedTraveller = (await updated.json()).savedTraveller
        assert.equal(updatedTraveller.id, created.id)
        assert.equal(updatedTraveller.fullName, created.fullName)
        assert.equal(updatedTraveller.label, 'Wife')
        assert.equal(updatedTraveller.email, null)
      })

      await t.test('validation and ownership isolation', async () => {
        const invalid = await POST(
          new Request(collectionUrl, {
            method: 'POST',
            headers: aHeaders,
            body: JSON.stringify({ fullName: '', phone: 'invalid' }),
          })
        )
        assert.equal(invalid.status, 400)
        const crossUpdate = await PATCH(
          new Request(`${collectionUrl}/${created.id}`, {
            method: 'PATCH',
            headers: bHeaders,
            body: JSON.stringify({ label: 'Stolen' }),
          }),
          itemContext(created.id)
        )
        assert.equal(crossUpdate.status, 404)
        const crossDelete = await DELETE(
          new Request(`${collectionUrl}/${created.id}`, { method: 'DELETE', headers: bHeaders }),
          itemContext(created.id)
        )
        assert.equal(crossDelete.status, 404)
      })

      const snapshot = {
        fullName: created.fullName,
        email: created.email,
        phone: created.phone,
        lead: true,
        sequence: 1,
      }
      const booking = await prisma.booking.create({
        data: {
          userId: users[0].id,
          from: 'Lagos',
          to: 'Cotonou',
          date: new Date('2099-01-01'),
          passengerName: snapshot.fullName,
          passengerEmail: snapshot.email,
          passengerPhone: snapshot.phone,
          travelers: [snapshot],
          vehicleId: vehicle.id,
          passengers: 1,
          priceNGN: 100000,
        },
      })

      await t.test(
        'delete is isolated, repeat-safe, and preserves historical snapshots',
        async () => {
          const deleted = await DELETE(
            new Request(`${collectionUrl}/${created.id}`, { method: 'DELETE', headers: aHeaders }),
            itemContext(created.id)
          )
          assert.equal(deleted.status, 200)
          assert.deepEqual(await deleted.json(), { deleted: true })
          const repeated = await DELETE(
            new Request(`${collectionUrl}/${created.id}`, { method: 'DELETE', headers: aHeaders }),
            itemContext(created.id)
          )
          assert.equal(repeated.status, 404)
          const persisted = await prisma.booking.findUniqueOrThrow({ where: { id: booking.id } })
          assert.equal(persisted.passengerName, snapshot.fullName)
          assert.equal(persisted.passengerPhone, snapshot.phone)
          assert.deepEqual(persisted.travelers, [snapshot])
        }
      )
    } finally {
      await prisma.booking.deleteMany({ where: { userId: { in: users.map((user) => user.id) } } })
      await prisma.savedTraveller.deleteMany({
        where: { userId: { in: users.map((user) => user.id) } },
      })
      await prisma.mobileSession.deleteMany({
        where: { userId: { in: users.map((user) => user.id) } },
      })
      await prisma.user.deleteMany({ where: { id: { in: users.map((user) => user.id) } } })
      await prisma.vehicle.delete({ where: { id: vehicle.id } })
      if (previousSecret === undefined) delete process.env.MOBILE_AUTH_SECRET
      else process.env.MOBILE_AUTH_SECRET = previousSecret
    }
  }
)
