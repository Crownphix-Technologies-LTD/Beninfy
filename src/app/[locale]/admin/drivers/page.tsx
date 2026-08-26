'use client'

import { useState } from 'react'
import { CrudTable } from '@/components/admin/CrudTable'

interface LoginAccount {
  exists: boolean
  userId: string | null
  email: string | null
  role: string | null
  disabled: boolean
}

interface Driver {
  id: string
  name: string
  phone: string
  email: string | null
  status: string
  homeCity: string | null
  licenseNumber: string | null
  notes: string | null
  loginAccount?: LoginAccount
  [key: string]: unknown
}

interface DriverCredentials {
  email: string
  temporaryPassword: string
  generated: boolean
}

function isDriverCredentials(value: unknown): value is DriverCredentials {
  if (!value || typeof value !== 'object') return false
  const candidate = value as Partial<DriverCredentials>
  return (
    typeof candidate.email === 'string' &&
    typeof candidate.temporaryPassword === 'string' &&
    typeof candidate.generated === 'boolean'
  )
}

export default function AdminDriversPage() {
  const [credentials, setCredentials] = useState<DriverCredentials | null>(null)
  const [passwordVisible, setPasswordVisible] = useState(false)
  const [copied, setCopied] = useState<string | null>(null)
  const [provisioningId, setProvisioningId] = useState<string | null>(null)

  const dismissCredentials = () => {
    setCredentials(null)
    setPasswordVisible(false)
    setCopied(null)
  }

  const copyText = async (label: string, value: string) => {
    await navigator.clipboard.writeText(value)
    setCopied(label)
    window.setTimeout(() => setCopied(null), 2200)
  }

  const createLoginAccount = async (
    driver: Driver,
    helpers: { reload: () => Promise<void>; setError: (message: string | null) => void }
  ) => {
    if (!driver.email) {
      helpers.setError('Add a valid driver email before creating a login account.')
      return
    }
    const confirmed = window.confirm(
      `Create a Driver app login account for ${driver.name} using ${driver.email}?`
    )
    if (!confirmed) return

    setProvisioningId(driver.id)
    helpers.setError(null)
    try {
      let res = await fetch(`/api/admin/drivers/${driver.id}/account`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ resetExistingPassword: true }),
      })
      let data = await res.json().catch(() => ({}))
      if (res.status === 409 && data.code === 'LINK_CONFIRMATION_REQUIRED') {
        const linkConfirmed = window.confirm(
          'A safe unlinked user already exists for this email. Link it to this driver and reset a temporary password?'
        )
        if (!linkConfirmed) return
        res = await fetch(`/api/admin/drivers/${driver.id}/account`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ linkExistingUser: true, resetExistingPassword: true }),
        })
        data = await res.json().catch(() => ({}))
      }
      if (!res.ok) throw new Error(typeof data.error === 'string' ? data.error : 'Login account creation failed')
      if (isDriverCredentials(data.credentials)) setCredentials(data.credentials)
      await helpers.reload()
    } catch (error) {
      helpers.setError(error instanceof Error ? error.message : 'Login account creation failed')
    } finally {
      setProvisioningId(null)
    }
  }

  return (
    <div className="space-y-4">
      {credentials && (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-5 py-4 text-sm text-emerald-950 shadow-[0_12px_30px_rgba(16,185,129,0.12)]">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="font-semibold">Driver created successfully</p>
              <p className="mt-1 text-emerald-800">
                Save these credentials now. The temporary password cannot be viewed again after this message is closed.
              </p>
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                <div className="rounded-xl bg-white/80 px-3 py-2">
                  <p className="text-xs uppercase tracking-[0.14em] text-emerald-600">Email</p>
                  <div className="mt-1 flex items-center gap-2">
                    <p className="font-mono text-sm text-gray-900">{credentials.email}</p>
                    <button
                      type="button"
                      onClick={() => void copyText('email', credentials.email)}
                      className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-emerald-100 text-emerald-700 hover:bg-emerald-50"
                      title="Copy email"
                    >
                      <span className="material-symbols-outlined text-[15px]">content_copy</span>
                    </button>
                  </div>
                </div>
                <div className="rounded-xl bg-white/80 px-3 py-2">
                  <p className="text-xs uppercase tracking-[0.14em] text-emerald-600">
                    {credentials.generated ? 'Temporary password' : 'Initial password'}
                  </p>
                  <div className="mt-1 flex flex-wrap items-center gap-2">
                    <p className="font-mono text-sm text-gray-900">
                      {passwordVisible ? credentials.temporaryPassword : '••••••••••••'}
                    </p>
                    <button
                      type="button"
                      onClick={() => setPasswordVisible((visible) => !visible)}
                      className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-emerald-100 text-emerald-700 hover:bg-emerald-50"
                      title={passwordVisible ? 'Hide password' : 'Reveal password'}
                    >
                      <span className="material-symbols-outlined text-[15px]">
                        {passwordVisible ? 'visibility_off' : 'visibility'}
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={() => void copyText('password', credentials.temporaryPassword)}
                      className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-emerald-100 text-emerald-700 hover:bg-emerald-50"
                      title="Copy password"
                    >
                      <span className="material-symbols-outlined text-[15px]">content_copy</span>
                    </button>
                  </div>
                </div>
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() =>
                    void copyText(
                      'credentials',
                      `Beninfy Driver App Login\nEmail: ${credentials.email}\nTemporary password: ${credentials.temporaryPassword}`
                    )
                  }
                  className="inline-flex items-center gap-2 rounded-lg border border-emerald-200 bg-white px-3 py-2 text-xs font-semibold text-emerald-800 hover:bg-emerald-50"
                >
                  <span className="material-symbols-outlined text-[15px]">content_copy</span>
                  Copy credentials
                </button>
                {copied && <span className="text-xs font-semibold text-emerald-700">Copied {copied}</span>}
              </div>
            </div>
            <button
              type="button"
              onClick={dismissCredentials}
              className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-emerald-200 bg-white text-emerald-800"
              title="Dismiss"
            >
              <span className="material-symbols-outlined text-[17px]">close</span>
            </button>
          </div>
        </div>
      )}

      <CrudTable<Driver>
        title="Drivers"
        description="Manage driver records, login accounts, and operational duty status."
        fetchUrl="/api/admin/drivers"
        collectionKey="drivers"
        itemKey="id"
        createUrl="/api/admin/drivers"
        itemUrl={(id) => `/api/admin/drivers/${id}`}
        onSaveSuccess={(data, mode) => {
          if (mode === 'create' && isDriverCredentials(data.credentials)) {
            setCredentials(data.credentials)
          }
        }}
        rowActions={(driver, helpers) =>
          driver.loginAccount?.exists ? null : (
            <button
              onClick={() => void createLoginAccount(driver, helpers)}
              disabled={provisioningId === driver.id}
              className="mr-2 inline-flex h-8 w-8 items-center justify-center rounded-lg border border-emerald-100 text-emerald-700 transition-colors hover:bg-emerald-50 disabled:opacity-50"
              title="Create Driver app login"
            >
              <span className="material-symbols-outlined text-[17px]">
                {provisioningId === driver.id ? 'more_horiz' : 'person_add'}
              </span>
            </button>
          )
        }
        columns={[
          { header: 'Name', render: (d) => <p className="font-medium text-gray-800">{d.name}</p> },
          { header: 'Phone', render: (d) => d.phone },
          { header: 'Email', render: (d) => d.email ?? '—' },
          {
            header: 'Login',
            render: (d) => (
              <div className="space-y-1">
                <span className={d.loginAccount?.exists ? 'text-xs font-semibold text-emerald-700' : 'text-xs font-semibold text-red-600'}>
                  {d.loginAccount?.exists ? 'Linked' : 'No login'}
                </span>
                {d.loginAccount?.email && <p className="text-xs text-gray-500">{d.loginAccount.email}</p>}
                {d.loginAccount?.disabled && <p className="text-xs text-amber-700">User disabled</p>}
              </div>
            ),
          },
          { header: 'Status', render: (d) => <span className={d.status === 'available' ? 'text-green-700 text-xs' : 'text-amber-700 text-xs'}>{d.status}</span> },
          { header: 'Home city', render: (d) => d.homeCity ?? '—' },
          { header: 'License', render: (d) => d.licenseNumber ?? '—' },
        ]}
        fields={[
          { name: 'name', label: 'Name', type: 'text', required: true },
          { name: 'phone', label: 'Phone', type: 'text', required: true },
          { name: 'email', label: 'Login email', type: 'text', required: true },
          {
            name: 'driverAppLoginSection',
            label: 'Driver App Login',
            type: 'section',
            createOnly: true,
            description:
              'A login account will be created for this driver to access the Beninfy Driver app. Leave the password blank to generate a secure temporary password.',
          },
          {
            name: 'initialPassword',
            label: 'Initial password',
            type: 'password',
            placeholder: 'Leave blank to generate securely',
            createOnly: true,
          },
          {
            name: 'status',
            label: 'Operational status',
            type: 'select',
            required: true,
            options: [
              { label: 'Available', value: 'available' },
              { label: 'Off duty', value: 'off_duty' },
              { label: 'Inactive', value: 'inactive' },
            ],
          },
          { name: 'homeCity', label: 'Home city', type: 'text' },
          { name: 'licenseNumber', label: 'License number', type: 'text' },
          { name: 'notes', label: 'Notes', type: 'textarea' },
        ]}
        defaultValues={{ status: 'available' }}
      />
    </div>
  )
}
