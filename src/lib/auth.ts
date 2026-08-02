import NextAuth from 'next-auth'
import Credentials from 'next-auth/providers/credentials'
import Google from 'next-auth/providers/google'
import { PrismaAdapter } from '@auth/prisma-adapter'
import bcrypt from 'bcryptjs'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { checkRateLimit, requestIp } from '@/lib/rateLimit'
import { isAdminRole } from '@/lib/roles'

const credentialsSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
})

const googleClientId = process.env.GOOGLE_CLIENT_ID
const googleClientSecret = process.env.GOOGLE_CLIENT_SECRET
const customerSessionMaxAgeSeconds = Number(process.env.AUTH_SESSION_MAX_AGE_SECONDS ?? 24 * 60 * 60)
const adminSessionMaxAgeSeconds = Number(process.env.AUTH_ADMIN_SESSION_MAX_AGE_SECONDS ?? 8 * 60 * 60)

function tokenExpiredForRole(issuedAt: unknown, role: string) {
  if (typeof issuedAt !== 'number') return true
  const maxAgeSeconds = isAdminRole(role) ? adminSessionMaxAgeSeconds : customerSessionMaxAgeSeconds
  return Math.floor(Date.now() / 1000) - issuedAt > maxAgeSeconds
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(prisma),
  session: {
    strategy: 'jwt',
    maxAge: customerSessionMaxAgeSeconds,
    updateAge: 60 * 60,
  },
  trustHost: true,
  pages: { signIn: '/login' },
  providers: [
    ...(googleClientId && googleClientSecret
      ? [
          Google({
            clientId: googleClientId,
            clientSecret: googleClientSecret,
            allowDangerousEmailAccountLinking: true,
          }),
        ]
      : []),
    Credentials({
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials, request) {
        const rateLimit = await checkRateLimit({
          scope: 'credentials-login',
          identifier: requestIp(request),
          limit: 10,
          windowMs: 15 * 60 * 1000,
        })
        if (!rateLimit.allowed) return null

        const parsed = credentialsSchema.safeParse(credentials)
        if (!parsed.success) return null
        const email = parsed.data.email.trim().toLowerCase()
        const { password } = parsed.data
        const user = await prisma.user.findUnique({ where: { email } })
        if (!user || !user.hashedPassword) return null
        const ok = await bcrypt.compare(password, user.hashedPassword)
        if (!ok) return null
        return { id: user.id, email: user.email, name: user.name, image: user.image, role: user.role }
      },
    }),
  ],
  callbacks: {
    async signIn({ account, profile }) {
      if (account?.provider !== 'google') return true

      const googleProfile = profile as { email?: string; email_verified?: boolean } | undefined
      if (!googleProfile?.email || googleProfile.email_verified !== true) {
        return '/login?error=GoogleEmailUnverified'
      }

      // Defensive check: if there's an existing Account record for this providerAccountId,
      // ensure the linked User email matches the Google profile email. If it doesn't,
      // block the sign-in to avoid logging the user into someone else's account (commonly an admin).
      try {
        if (account?.providerAccountId) {
          const existing = await prisma.account.findFirst({
            where: { provider: 'google', providerAccountId: account.providerAccountId },
            include: { user: true },
          })
          if (existing?.user && existing.user.email && existing.user.email !== googleProfile.email) {
            console.warn('Google sign-in blocked: providerAccountId already linked to different email', {
              providerAccountId: account.providerAccountId,
              existingEmail: existing.user.email,
              incomingEmail: googleProfile.email,
            })
            return '/login?error=OAuthAccountConflict'
          }
        }
      } catch (err) {
        console.error('Error checking existing google account during signIn callback', err)
        // allow sign-in to proceed if the check fails for unexpected reasons
      }

      return true
    },
    async jwt({ token, user }) {
      const isFreshSignIn = Boolean(user)
      if (user) {
        token.id = user.id ?? token.sub
        delete token.sessionVersion
      }

      const tokenUserId = typeof token.id === 'string' ? token.id : typeof token.sub === 'string' ? token.sub : null
      const tokenEmail = typeof token.email === 'string' ? token.email : null

      if (tokenUserId || tokenEmail) {
        const dbUser = tokenUserId
          ? await prisma.user.findUnique({
              where: { id: tokenUserId },
              select: { id: true, role: true, sessionVersion: true },
            })
          : tokenEmail
            ? await prisma.user.findUnique({
                where: { email: tokenEmail },
                select: { id: true, role: true, sessionVersion: true },
              })
            : null
        const tokenVersion = typeof token.sessionVersion === 'number' ? token.sessionVersion : null

        if (
          !dbUser ||
          (!isFreshSignIn && tokenVersion !== dbUser.sessionVersion) ||
          (!isFreshSignIn && tokenExpiredForRole(token.iat, dbUser.role))
        ) {
          delete token.id
          delete token.role
          delete token.sessionVersion
        } else {
          token.id = dbUser.id
          token.role = dbUser.role
          token.sessionVersion = dbUser.sessionVersion
        }
      }
      return token
    },
    async session({ session, token }) {
      if (session.user) {
        const user = session.user as { id?: string; role?: string }
        if (token?.id) user.id = token.id as string
        else delete user.id
        if (token?.role) user.role = token.role as string
        else delete user.role
      }
      return session
    },
  },
})
