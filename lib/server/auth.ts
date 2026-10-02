import crypto from 'node:crypto'
import { AppError } from './errors'

const SECRET = process.env.AUTH_SECRET || 'agriqueue-dev-secret-change-me'
export const COOKIE = 'aq_session'
const TTL_MS = 1000 * 60 * 60 * 12

export function hashPassword(pw: string) {
  const salt = crypto.randomBytes(16).toString('hex')
  return `${salt}:${crypto.scryptSync(pw, salt, 32).toString('hex')}`
}
export function verifyPassword(pw: string, stored: string) {
  const [salt, hash] = stored.split(':')
  if (!salt || !hash) return false
  const a = Buffer.from(hash, 'hex'); const b = crypto.scryptSync(pw, salt, 32)
  return a.length === b.length && crypto.timingSafeEqual(a, b)
}
const sign = (v: string) => crypto.createHmac('sha256', SECRET).update(v).digest('hex')
export function makeSession(userId: string) {
  const exp = Date.now() + TTL_MS
  const body = `${userId}.${exp}`
  return `${body}.${sign(body)}`
}
export function readSession(cookie?: string): string | null {
  if (!cookie) return null
  const i = cookie.lastIndexOf('.')
  if (i < 0) return null
  const body = cookie.slice(0, i); const sig = cookie.slice(i + 1)
  const expect = sign(body)
  if (sig.length !== expect.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expect))) return null
  const [userId, exp] = body.split('.')
  if (!userId || Number(exp) < Date.now()) return null
  return userId
}
export const SESSION_MAX_AGE = TTL_MS / 1000
export function forbid(): never { throw new AppError(403, 'You do not have permission to do this.') }
