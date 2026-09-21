import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  tourFeedbackSubmissionSchema,
  tourFeedbackRiskFlags,
  tourFeedbackTargets,
} from '../src/lib/mobile/tourFeedback'
import { adminRoleCan } from '../src/lib/roles'
import { mobileErrorFromCode } from '../src/lib/mobile/errors'

export const positiveAnswers = {
  professionalRespectful: true,
  feltSafe: true,
  followedAgreedService: 'yes' as const,
  uncomfortablePersonalQuestions: false,
  offPlatformSolicitation: false,
  unauthorizedPaymentRequest: false,
}

test('Tour feedback validates rating, bounded comments, exact answers and rejects authoritative IDs', () => {
  const body = { overallRating: 5, drivers: [{ targetId: 'a'.repeat(32), ...positiveAnswers }] }
  for (const rating of [1, 2, 3, 4, 5])
    assert.ok(tourFeedbackSubmissionSchema.safeParse({ ...body, overallRating: rating }).success)
  for (const rating of [0, 6, 1.5, '5'])
    assert.equal(
      tourFeedbackSubmissionSchema.safeParse({ ...body, overallRating: rating }).success,
      false
    )
  for (const extra of [
    { customerId: 'foreign' },
    { userId: 'foreign' },
    { riskFlags: ['safety_concern'] },
    { submittedAt: new Date().toISOString() },
  ])
    assert.equal(tourFeedbackSubmissionSchema.safeParse({ ...body, ...extra }).success, false)
  assert.equal(
    tourFeedbackSubmissionSchema.safeParse({ ...body, comment: 'x'.repeat(2001) }).success,
    false
  )
  assert.equal(
    tourFeedbackSubmissionSchema.safeParse({
      ...body,
      drivers: [{ ...body.drivers[0], comment: 'x'.repeat(1001) }],
    }).success,
    false
  )
  for (const changed of [
    { feltSafe: 'true' },
    { followedAgreedService: 'maybe' },
    { driverId: 'foreign' },
    { dayIds: ['foreign'] },
  ])
    assert.equal(
      tourFeedbackSubmissionSchema.safeParse({
        ...body,
        drivers: [{ ...body.drivers[0], ...changed }],
      }).success,
      false
    )
})

test('private Tour risk flags reflect reports without automatic penalties', () => {
  assert.deepEqual(tourFeedbackRiskFlags(positiveAnswers), [])
  for (const [changed, expected] of [
    [{ feltSafe: false }, 'safety_concern'],
    [{ offPlatformSolicitation: true }, 'off_platform_solicitation'],
    [{ unauthorizedPaymentRequest: true }, 'unauthorized_payment_request'],
    [{ professionalRespectful: false }, 'professionalism_concern'],
    [{ uncomfortablePersonalQuestions: true }, 'professionalism_concern'],
    [{ followedAgreedService: 'no' }, 'service_itinerary_concern'],
  ] as const)
    assert.deepEqual(tourFeedbackRiskFlags({ ...positiveAnswers, ...changed }), [expected])
  assert.deepEqual(
    tourFeedbackRiskFlags({ ...positiveAnswers, followedAgreedService: 'not_applicable' }),
    []
  )
  const source = readFileSync('src/lib/mobile/tourFeedback.ts', 'utf8')
  assert.doesNotMatch(source, /driver\.update|status:\s*'inactive'|earnings/)
})

test('one Driver across three completed Days has one target; different Drivers have separate attributed targets', () => {
  const days = [1, 2, 3].map((dayNumber) => ({
    id: 'day-' + dayNumber,
    status: 'completed',
    dayNumber,
    scheduledDate: new Date('2030-01-0' + dayNumber),
    sourceTourId: 'source-' + dayNumber,
    sourceTourTitle: 'Tour ' + dayNumber,
    title: 'Day',
    assignedDriverId: 'driver-1',
    assignedDriver: { id: 'driver-1', name: 'Fixture driver' },
  }))
  const single = tourFeedbackTargets('booking', days.reverse())
  assert.equal(single.length, 1)
  assert.deepEqual(
    single[0].days.map((d) => d.dayNumber),
    [1, 2, 3]
  )
  assert.equal(single[0].targetId.length, 32)
  days[0] = {
    ...days[0],
    assignedDriverId: 'driver-2',
    assignedDriver: { id: 'driver-2', name: 'Other driver' },
  }
  const multiple = tourFeedbackTargets('booking', days)
  assert.equal(multiple.length, 2)
  assert.equal(
    multiple.reduce((sum, d) => sum + d.days.length, 0),
    3
  )
  assert.notEqual(multiple[0].targetId, multiple[1].targetId)
  assert.notEqual(tourFeedbackTargets('foreign-booking', days)[0].targetId, multiple[0].targetId)
  assert.deepEqual(tourFeedbackTargets('booking', [{ ...days[0], status: 'upcoming' }]), [])
})

test('private feedback permission excludes Driver, Customer, content and finance admins', () => {
  for (const role of ['super_admin', 'admin', 'operations_admin'])
    assert.equal(adminRoleCan(role, 'tour_feedback'), true)
  for (const role of [
    'user',
    'driver',
    'content_admin',
    'finance_admin',
    'support_admin',
    'fleet_admin',
  ])
    assert.equal(adminRoleCan(role, 'tour_feedback'), false)
  const route = readFileSync('src/app/api/admin/tour-feedback/route.ts', 'utf8')
  assert.match(route, /requireAdminPermission\('tour_feedback'\)/)
  assert.match(route, /private, no-store/)
  const retention = readFileSync('src/lib/mobile/customerProduct.ts', 'utf8')
  assert.doesNotMatch(
    retention,
    /tourFeedback\.delete|tourDriverFeedback\.delete|tourFeedbackDay\.delete/
  )
})

test('Tour feedback domain failures map to stable 4xx responses', () => {
  assert.equal(mobileErrorFromCode('TOUR_FEEDBACK_NOT_ALLOWED').status, 409)
  assert.equal(mobileErrorFromCode('TOUR_FEEDBACK_ALREADY_SUBMITTED').status, 409)
  assert.equal(mobileErrorFromCode('TOUR_FEEDBACK_TARGET_INVALID').status, 400)
})
