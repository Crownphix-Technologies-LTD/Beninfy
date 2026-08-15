export type AppRole =
  | 'user'
  | 'driver'
  | 'admin'
  | 'super_admin'
  | 'operations_admin'
  | 'finance_admin'
  | 'fleet_admin'
  | 'pricing_admin'
  | 'support_admin'
  | 'content_admin'

export type AdminPermission =
  | 'overview'
  | 'bookings'
  | 'payments'
  | 'coupons'
  | 'pricing'
  | 'users'
  | 'vehicles'
  | 'fleet'
  | 'drivers'
  | 'routes'
  | 'tours'
  | 'border_fees'
  | 'audit'
  | 'settings'

const ALL_PERMISSIONS: AdminPermission[] = [
  'overview',
  'bookings',
  'payments',
  'coupons',
  'pricing',
  'users',
  'vehicles',
  'fleet',
  'drivers',
  'routes',
  'tours',
  'border_fees',
  'audit',
  'settings',
]

const ROLE_PERMISSIONS: Record<Exclude<AppRole, 'user' | 'driver'>, AdminPermission[]> = {
  super_admin: ALL_PERMISSIONS,
  admin: ALL_PERMISSIONS,
  operations_admin: ['overview', 'bookings', 'vehicles', 'fleet', 'drivers', 'routes', 'tours', 'border_fees', 'settings'],
  finance_admin: ['overview', 'bookings', 'payments', 'coupons', 'pricing', 'audit', 'settings'],
  fleet_admin: ['overview', 'bookings', 'vehicles', 'fleet', 'drivers', 'routes', 'settings'],
  pricing_admin: ['overview', 'coupons', 'pricing', 'routes', 'border_fees', 'settings'],
  support_admin: ['overview', 'bookings', 'payments', 'settings'],
  content_admin: ['overview', 'vehicles', 'routes', 'tours', 'border_fees', 'settings'],
}

export const ADMIN_ROLE_LABELS: Record<AppRole, string> = {
  user: 'User',
  driver: 'Driver',
  admin: 'Admin',
  super_admin: 'Super admin',
  operations_admin: 'Operations admin',
  finance_admin: 'Finance admin',
  fleet_admin: 'Fleet admin',
  pricing_admin: 'Pricing admin',
  support_admin: 'Support admin',
  content_admin: 'Content admin',
}

export function isAdminRole(role: unknown): role is Exclude<AppRole, 'user' | 'driver'> {
  return typeof role === 'string' && role in ROLE_PERMISSIONS
}

export function isCustomerRole(role: unknown): role is 'user' {
  return role === 'user'
}

export function isDriverRole(role: unknown): role is 'driver' {
  return role === 'driver'
}

export function adminRoleCan(role: unknown, permission: AdminPermission) {
  if (!isAdminRole(role)) return false
  return ROLE_PERMISSIONS[role].includes(permission)
}
