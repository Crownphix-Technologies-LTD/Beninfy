'use client'

import { useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { useRouter } from 'next/navigation'
import { useLocale } from 'next-intl'
import { getSession, signIn, signOut } from 'next-auth/react'
import { isAdminRole } from '@/lib/roles'

export default function LoginPage() {
  const locale = useLocale()
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [googleLoading, setGoogleLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [authError] = useState<string | null>(() =>
    typeof window === 'undefined' ? null : new URLSearchParams(window.location.search).get('error')
  )
  const authErrorMessage =
    authError === 'GoogleEmailUnverified'
      ? 'Google could not verify that email address. Please use another Google account or sign in with email.'
      : authError === 'OAuthAccountNotLinked'
        ? 'This email already exists. Try Google again with the verified email, or sign in with your password.'
        : null

  const callbackUrl = () => {
    const requested = new URLSearchParams(window.location.search).get('callbackUrl')
    return requested?.startsWith(`/${locale}/`) ? requested : `/${locale}/dashboard`
  }

  const handleGoogleLogin = async () => {
    setError(null)
    setGoogleLoading(true)
    try {
      await signIn('google', { callbackUrl: callbackUrl() })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Google sign in failed')
      setGoogleLoading(false)
    }
  }

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      const result = await signIn('credentials', { email, password, redirect: false })
      if (result?.error) throw new Error('Invalid email or password')
      const session = await getSession()
      const role = (session?.user as { role?: string } | undefined)?.role
      if (isAdminRole(role)) {
        await signOut({ redirect: false })
        throw new Error('Admin accounts must sign in from the backoffice.')
      }
      router.push(callbackUrl())
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sign in failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex min-h-screen flex-1 flex-col overflow-hidden md:flex-row">
      {/* Left brand panel */}
      <section className="bg-primary relative hidden flex-col overflow-hidden md:flex md:w-1/2 lg:w-7/12">
        <div className="from-primary via-primary/70 to-primary-container absolute inset-0 bg-gradient-to-tr" />
        <div className="relative z-10 flex h-full flex-col justify-between p-10 lg:p-14">
          {/* Logo */}
          <div>
            <Image
              src="/logo.png"
              alt="Beninfy"
              width={140}
              height={60}
              className="h-14 w-auto object-contain brightness-0 invert"
            />
          </div>

          {/* Main copy */}
          <div className="max-w-md">
            <h2 className="text-display-lg text-primary-fixed mb-5 leading-tight">
              West Africa&apos;s Premier Border Transit Service
            </h2>
            <p className="text-body-lg text-primary-fixed-dim mb-8">
              Join thousands of business travelers who trust Beninfy for safe, premium border
              crossings across Nigeria, Benin, Togo, and Ghana.
            </p>
            <div className="mb-8 flex items-center gap-4">
              <div className="flex -space-x-3">
                {['FK', 'AK', 'JM'].map((i) => (
                  <div
                    key={i}
                    className="bg-primary-container border-primary text-on-primary-container flex h-10 w-10 items-center justify-center rounded-full border-2 text-xs font-bold"
                  >
                    {i}
                  </div>
                ))}
              </div>
              <span className="text-label-md text-primary-fixed-dim">
                Join 2,000+ business travelers
              </span>
            </div>
            <div className="flex flex-wrap gap-3">
              {['Executive Vehicles', 'Border Facilitation', '24/7 Support', 'NGN Pricing'].map(
                (tag) => (
                  <span
                    key={tag}
                    className="bg-primary-container/40 text-primary-fixed text-label-sm border-primary-fixed/20 rounded-full border px-3 py-1.5"
                  >
                    {tag}
                  </span>
                )
              )}
            </div>
          </div>

          {/* Stats row */}
          <div className="flex gap-8">
            {[
              { n: '5+', l: 'Countries' },
              { n: '7', l: 'Vehicle Classes' },
              { n: '99%', l: 'On-time Rate' },
            ].map(({ n, l }) => (
              <div key={l}>
                <p className="text-headline-lg text-secondary-fixed font-bold">{n}</p>
                <p className="text-label-md text-primary-fixed-dim">{l}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Right: form panel */}
      <section className="bg-surface-container-lowest flex min-h-screen w-full items-center justify-center p-6 md:w-1/2 md:p-10 lg:w-5/12">
        <div className="flex w-full max-w-sm flex-col">
          {/* Mobile logo */}
          <div className="mb-8 flex justify-center md:hidden">
            <Image
              src="/logo.png"
              alt="Beninfy"
              width={120}
              height={52}
              className="h-12 w-auto object-contain"
            />
          </div>

          <div className="mb-8">
            <h3 className="text-headline-lg text-on-surface mb-2">Welcome back</h3>
            <p className="text-body-md text-on-surface-variant">
              Please enter your details to sign in.
            </p>
          </div>

          {/* Social login */}
          <div className="mb-6 flex flex-col gap-3">
            <button
              type="button"
              onClick={handleGoogleLogin}
              disabled={loading || googleLoading}
              className="border-outline-variant text-label-md text-on-surface hover:bg-surface-container flex w-full items-center justify-center gap-3 rounded-xl border px-4 py-3 transition-all disabled:cursor-wait disabled:opacity-70"
            >
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
              >
                <path
                  d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                  fill="#4285F4"
                />
                <path
                  d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                  fill="#34A853"
                />
                <path
                  d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                  fill="#FBBC05"
                />
                <path
                  d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                  fill="#EA4335"
                />
              </svg>
              {googleLoading ? 'Connecting to Google...' : 'Continue with Google'}
            </button>
          </div>

          {/* Divider */}
          <div className="relative mb-6 flex items-center">
            <div className="border-outline-variant flex-grow border-t" />
            <span className="text-label-sm text-on-surface-variant mx-4">or use email</span>
            <div className="border-outline-variant flex-grow border-t" />
          </div>

          {/* Email/password form */}
          <form onSubmit={handleLogin} className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <label className="text-label-md text-on-surface" htmlFor="email">
                Email Address
              </label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="name@company.com"
                required
                autoComplete="email"
                className="bg-surface border-outline-variant text-body-md text-on-surface placeholder:text-on-surface-variant/50 focus:border-primary focus:ring-primary/20 w-full rounded-xl border px-4 py-3 transition-all outline-none focus:ring-2"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between">
                <label className="text-label-md text-on-surface" htmlFor="password">
                  Password
                </label>
                <a href="#" className="text-label-sm text-secondary hover:underline">
                  Forgot?
                </a>
              </div>
              <div className="relative">
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                  autoComplete="current-password"
                  className="bg-surface border-outline-variant text-body-md text-on-surface placeholder:text-on-surface-variant/50 focus:border-primary focus:ring-primary/20 w-full rounded-xl border px-4 py-3 pr-12 transition-all outline-none focus:ring-2"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="text-on-surface-variant hover:text-on-surface absolute top-1/2 right-3 -translate-y-1/2 transition-colors"
                >
                  <span className="material-symbols-outlined text-[20px]">
                    {showPassword ? 'visibility_off' : 'visibility'}
                  </span>
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="bg-primary text-on-primary text-label-md mt-2 w-full rounded-xl py-3.5 font-semibold transition-all hover:opacity-95 active:scale-[0.98] disabled:cursor-wait disabled:opacity-70"
            >
              {loading ? 'Signing in…' : 'Sign In'}
            </button>
            {(error || authErrorMessage) && (
              <p className="text-body-sm text-error mt-1">{error ?? authErrorMessage}</p>
            )}
          </form>

          {/* Register link */}
          <p className="text-body-sm text-on-surface-variant mt-6 text-center">
            Don&apos;t have an account?{' '}
            <Link
              href={`/${locale}/register`}
              className="text-primary font-semibold hover:underline"
            >
              Create account
            </Link>
          </p>
        </div>
      </section>
    </div>
  )
}
