import { randomBytes } from 'crypto'
import bcrypt from 'bcryptjs'
import { Prisma, type Driver, type User } from '@prisma/client'
import { isAdminRole } from '@/lib/roles'
import { validateMobilePassword } from '@/lib/mobile/onboarding'

export type DriverAccountCredentials = {
  email: string
  temporaryPassword: string
  generated: boolean
}

export type DriverWithLoginAccount = Driver & {
  user?: Pick<User, 'id' | 'email' | 'role' | 'disabledAt'> | null
}

export function normalizeDriverLoginEmail(email: string | null | undefined) {
  const normalized = email?.trim().toLowerCase()
  return normalized || null
}

export function generateDriverTemporaryPassword() {
  return `Bfy-${randomBytes(12).toString('base64url')}`
}

export function resolveDriverInitialPassword(password?: string | null): DriverAccountCredentials['temporaryPassword'] {
  const resolved = password?.trim() || generateDriverTemporaryPassword()
  if (!validateMobilePassword(resolved)) {
    throw new Error('PASSWORD_INVALID')
  }
  return resolved
}

export function sanitizeDriverForAdmin(driver: DriverWithLoginAccount) {
  return {
    ...driver,
    loginAccount: driver.user
      ? {
          exists: true,
          userId: driver.user.id,
          email: driver.user.email,
          role: driver.user.role,
          disabled: Boolean(driver.user.disabledAt),
        }
      : {
          exists: false,
          userId: null,
          email: null,
          role: null,
          disabled: false,
        },
    user: undefined,
  }
}

export function canLinkExistingUserToDriver(
  user: Pick<User, 'role' | 'disabledAt'> & { driver?: { id: string } | null }
) {
  if (isAdminRole(user.role)) return false
  if (user.driver) return false
  return true
}

export async function hashDriverPassword(password: string) {
  return bcrypt.hash(password, 12)
}

export function uniqueConstraintTarget(error: unknown) {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2002') {
    return null
  }
  return Array.isArray(error.meta?.target) ? error.meta.target.join(', ') : 'unique value'
}
