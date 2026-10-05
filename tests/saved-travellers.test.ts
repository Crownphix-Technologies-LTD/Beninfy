import test from 'node:test'
import assert from 'node:assert/strict'
import {
  normalizeSavedTravellerPhone,
  savedTravellerCreateSchema,
  savedTravellerUpdateSchema,
  toSavedTravellerDto,
} from '../src/lib/mobile/savedTravellers'

test('Saved Traveller phone normalization supports Benin, Nigeria and international E.164', () => {
  assert.equal(normalizeSavedTravellerPhone('+229 01 02 03 04 05'), '+2290102030405')
  assert.equal(normalizeSavedTravellerPhone('00233 20 123 4567'), '+233201234567')
  assert.equal(normalizeSavedTravellerPhone('08012345678'), '+2348012345678')
  assert.equal(normalizeSavedTravellerPhone('12345'), null)
})

test('Saved Traveller validation normalizes optional values and rejects malformed input', () => {
  const valid = savedTravellerCreateSchema.parse({
    fullName: '  Ada Example  ',
    phone: '+2290102030405',
    email: ' ADA@EXAMPLE.COM ',
    label: '',
  })
  assert.deepEqual(valid, {
    fullName: 'Ada Example',
    phone: '+2290102030405',
    email: 'ada@example.com',
    label: null,
  })
  assert.equal(
    savedTravellerCreateSchema.safeParse({ fullName: '', phone: '+2290102030405' }).success,
    false
  )
  assert.equal(
    savedTravellerCreateSchema.safeParse({ fullName: 'Ada', phone: '+2290102030405', email: 'bad' })
      .success,
    false
  )
  assert.equal(
    savedTravellerCreateSchema.safeParse({
      fullName: 'Ada',
      phone: '+2290102030405',
      customerId: 'customer-b',
    }).success,
    false
  )
  assert.equal(savedTravellerUpdateSchema.safeParse({}).success, false)
  assert.equal(savedTravellerUpdateSchema.safeParse({ userId: 'customer-b' }).success, false)
})

test('Saved Traveller DTO contains customer-safe fields only', () => {
  const dto = toSavedTravellerDto({
    id: 'traveller-1',
    fullName: 'Ada Example',
    phone: '+2290102030405',
    email: null,
    label: 'Myself',
    createdAt: '2026-09-30T12:00:00.000Z',
    updatedAt: '2026-09-30T12:01:00.000Z',
  })
  assert.deepEqual(Object.keys(dto), [
    'id',
    'fullName',
    'phone',
    'email',
    'label',
    'createdAt',
    'updatedAt',
  ])
  assert.equal('userId' in dto, false)
})
