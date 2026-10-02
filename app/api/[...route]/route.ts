import { NextRequest, NextResponse } from 'next/server'
import { AppError } from '@/lib/server/errors'
import { COOKIE, SESSION_MAX_AGE, makeSession, readSession } from '@/lib/server/auth'
import * as S from '@/lib/server/service'
import type { User } from '@/lib/types'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

type Ctx = { params: Promise<{ route: string[] }> }
const json = (data: unknown, status = 200) => NextResponse.json(data, { status, headers: { 'Cache-Control': 'no-store' } })

async function body(req: NextRequest): Promise<Record<string, unknown>> {
  if (req.method === 'GET' || req.method === 'DELETE') return {}
  try { const b = await req.json(); return b && typeof b === 'object' ? (b as Record<string, unknown>) : {} } catch { throw new AppError(400, 'Invalid request body.') }
}

async function handle(req: NextRequest, ctx: Ctx) {
  try {
    const seg = (await ctx.params).route ?? []
    const m = req.method
    const q = Object.fromEntries(req.nextUrl.searchParams.entries())
    const b = await body(req)
    const key = seg[0]
    const secure = req.nextUrl.protocol === 'https:' || req.headers.get('x-forwarded-proto') === 'https'

    // ---- public auth endpoints ----
    if (key === 'auth') {
      if (seg[1] === 'login' && m === 'POST') {
        const u = S.login(b.login, b.password)
        const res = json({ user: S.pub(u) })
        res.cookies.set(COOKIE, makeSession(u.id), { httpOnly: true, sameSite: 'lax', secure, path: '/', maxAge: SESSION_MAX_AGE })
        return res
      }
      if (seg[1] === 'register' && m === 'POST') {
        const u = S.register(b)
        const res = json({ user: S.pub(u) }, 201)
        res.cookies.set(COOKIE, makeSession(u.id), { httpOnly: true, sameSite: 'lax', secure, path: '/', maxAge: SESSION_MAX_AGE })
        return res
      }
      if (seg[1] === 'logout' && m === 'POST') { const res = json({ ok: true }); res.cookies.delete(COOKIE); return res }
    }

    // ---- everything below needs a session ----
    const user: User | null = S.userById(readSession(req.cookies.get(COOKIE)?.value))
    if (key === 'auth' && seg[1] === 'me') return json({ user: user ? S.pub(user) : null })
    if (!user) throw new AppError(401, 'Please sign in to continue.')

    if (key === 'meta') return json(S.meta())
    if (key === 'slots' && m === 'GET') return json(S.slots(q.centerId, q.date))
    if (key === 'queue' && m === 'GET') return json(S.queue(user, q.centerId, q.date))
    if (key === 'notifications') return m === 'POST' ? json(S.markRead(user, typeof b.id === 'string' ? b.id : undefined)) : json(S.notifications(user))
    if (key === 'dashboard') return json(S.dashboard(user, q.centerId))
    if (key === 'analytics') return json(S.analytics(user))
    if (key === 'inspections') return json(S.inspections(user))

    if (key === 'bookings') {
      if (seg.length === 1) return m === 'POST' ? json(S.createBooking(user, b), 201) : json(S.listBookings(user, q))
      if (seg[1] === 'verify' && m === 'POST') return json(S.verifyToken(user, String(b.token ?? ''), String(b.date ?? '')))
      if (seg.length === 2 && m === 'GET') return json(S.bookingDetail(user, seg[1]))
      if (seg.length === 3 && m === 'POST') return json(seg[2] === 'cancel' ? S.cancel(user, seg[1]) : S.action(user, seg[1], seg[2], b))
    }

    // ---- admin ----
    if (key === 'admin') {
      if (seg[1] === 'users') {
        if (seg.length === 2) return m === 'POST' ? json(S.createStaff(user, b), 201) : json(S.adminUsers(user))
        if (seg.length === 3 && m === 'PATCH') return json(S.setUserActive(user, seg[2], b.active === true))
      }
      if (seg[1] === 'centers') {
        if (m === 'POST') return json(S.saveCenter(user, null, b), 201)
        if (m === 'PATCH' && seg[2]) return json(S.saveCenter(user, seg[2], b))
      }
      if (seg[1] === 'crops') {
        if (m === 'POST') return json(S.saveCrop(user, null, b), 201)
        if (m === 'PATCH' && seg[2]) return json(S.saveCrop(user, seg[2], b))
      }
      if (seg[1] === 'logs') return json(S.logs(user))
      if (seg[1] === 'reset' && m === 'POST') return json(S.reset(user))
    }
    throw new AppError(404, 'Endpoint not found.')
  } catch (e) {
    if (e instanceof AppError) return json({ error: e.message }, e.status)
    console.error('[api] unexpected error', e)
    return json({ error: 'Something went wrong on the server. Please try again.' }, 500)
  }
}
export const GET = handle, POST = handle, PATCH = handle, DELETE = handle
