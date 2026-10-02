import type { Booking, BookingView, Center, Crop, PublicUser, Role, User, DB } from '../types'
import { db, save, resetDb } from './store'
import { AppError } from './errors'
import { hashPassword, verifyPassword } from './auth'
import { todayStr, addDays, dateOf, hourOf, minutesBetween, round1 } from './util'
import * as W from './workflow'

export const pub = (u: User): PublicUser => { const { passwordHash: _p, ...rest } = u; return rest }
const str = (v: unknown, min: number, max: number, label: string) => {
  const s = typeof v === 'string' ? v.trim() : ''
  if (s.length < min || s.length > max) throw new AppError(400, `${label} must be ${min}-${max} characters.`)
  return s
}
const PHONE = /^[0-9+\-\s]{10,15}$/

// ---------------- auth ----------------
export function register(input: Record<string, unknown>) {
  const d = db()
  const name = str(input.name, 2, 60, 'Name')
  const phone = str(input.phone, 10, 15, 'Phone')
  if (!PHONE.test(phone)) throw new AppError(400, 'Enter a valid phone number (digits, +, - only).')
  const location = str(input.location, 2, 80, 'Location')
  const identification = str(input.identification, 5, 20, 'CNIC / ID number')
  const password = str(input.password, 6, 64, 'Password')
  const login = phone.replace(/[\s-]/g, '')
  if (d.users.some((u) => u.login === login || u.phone.replace(/[\s-]/g, '') === login)) throw new AppError(409, 'An account with this phone number already exists.')
  if (d.users.some((u) => u.role === 'farmer' && u.identification === identification)) throw new AppError(409, 'This ID number is already registered.')
  const u: User = { id: W.uid('u'), role: 'farmer', login, name, phone: login, location, identification, registrationStatus: 'Approved', active: true, passwordHash: hashPassword(password), createdAt: new Date().toISOString() }
  d.users.push(u)
  W.log(d, u, 'auth.register', `Farmer ${name} registered`)
  W.notify(d, u.id, 'welcome', 'Welcome to AgriQueue', 'Your account is ready. Book your first procurement slot.')
  save()
  return u
}
export function login(loginId: unknown, password: unknown) {
  const d = db()
  const id = typeof loginId === 'string' ? loginId.trim().replace(/[\s-]/g, '') : ''
  const u = d.users.find((x) => x.login.replace(/[\s-]/g, '') === id)
  if (!u || typeof password !== 'string' || !verifyPassword(password, u.passwordHash)) throw new AppError(401, 'Incorrect phone/username or password.')
  if (!u.active || u.registrationStatus === 'Suspended') throw new AppError(403, 'Your account is suspended. Please contact the administrator.')
  W.log(d, u, 'auth.login', `${u.name} signed in`); save()
  return u
}
export function userById(id: string | null) { return id ? db().users.find((u) => u.id === id && u.active) ?? null : null }

// ---------------- views ----------------
export function view(d: DB, b: Booking): BookingView {
  const f = d.users.find((u) => u.id === b.farmerId)
  return {
    ...b, farmerName: f?.name ?? 'Unknown', farmerPhone: f?.phone ?? '', centerName: d.centers.find((c) => c.id === b.centerId)?.name ?? '',
    procurement: d.procurements.find((p) => p.bookingId === b.id), position: W.positionOf(d, b), etaMin: W.etaOf(d, b),
  }
}
const canSee = (u: User, b: Booking) => u.role === 'admin' || (u.role === 'farmer' ? b.farmerId === u.id : !u.centerId || u.centerId === b.centerId)
function getBooking(d: DB, id: string) { const b = d.bookings.find((x) => x.id === id); if (!b) throw new AppError(404, 'Booking not found.'); return b }
function scoped(u: User, b: Booking) {
  if (!canSee(u, b)) throw new AppError(403, 'This booking belongs to a different center or farmer.')
  return b
}
const run = <T,>(fn: () => T): T => { const r = fn(); save(); return r }

export function meta() { const d = db(); return { centers: d.centers, crops: d.crops, today: todayStr() } }
export function slots(centerId: string, date: string) {
  const d = db(); const c = d.centers.find((x) => x.id === centerId)
  if (!c) throw new AppError(404, 'Center not found.')
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new AppError(400, 'Invalid date.')
  return W.slotsFor(d, c, date)
}

export function listBookings(u: User, q: Record<string, string>) {
  const d = db()
  if (W.sweep(d)) save()
  const term = (q.q ?? '').toLowerCase().trim()
  let list = d.bookings.filter((b) => canSee(u, b))
  if (q.centerId) list = list.filter((b) => b.centerId === q.centerId)
  if (q.crop) list = list.filter((b) => b.cropId === q.crop || b.cropName.toLowerCase() === q.crop.toLowerCase())
  if (q.date) list = list.filter((b) => b.date === q.date)
  if (q.from) list = list.filter((b) => b.date >= q.from)
  if (q.to) list = list.filter((b) => b.date <= q.to)
  if (q.status) list = list.filter((b) => (q.status === 'Delayed' ? b.delayed && !['Completed', 'Cancelled', 'Missed', 'Rejected'].includes(b.status) : b.status === q.status))
  if (q.payment) list = list.filter((b) => (d.procurements.find((p) => p.bookingId === b.id)?.paymentStatus ?? (['Cancelled', 'Missed', 'Rejected'].includes(b.status) ? 'Not applicable' : 'Pending')) === q.payment)
  let out = list.map((b) => view(d, b))
  if (term) out = out.filter((b) => `${b.token} ${b.cropName} ${b.centerName} ${b.farmerName} ${b.farmerPhone}`.toLowerCase().includes(term))
  out.sort((a, b) => (a.date === b.date ? b.token.localeCompare(a.token) : b.date.localeCompare(a.date)))
  return out.slice(0, 500)
}
export function bookingDetail(u: User, id: string) { const d = db(); return view(d, scoped(u, getBooking(d, id))) }

export function createBooking(u: User, input: Record<string, unknown>) {
  return run(() => { const d = db(); const b = W.createBooking(d, u, { centerId: String(input.centerId), cropId: String(input.cropId), date: String(input.date), slot: String(input.slot), estimatedKg: Number(input.estimatedKg) }); return view(d, b) })
}
export function cancel(u: User, id: string) {
  return run(() => { const d = db(); const b = scoped(u, getBooking(d, id)); if (u.role !== 'farmer' && u.role !== 'admin') throw new AppError(403, 'Only the farmer or an administrator can cancel a booking.'); W.cancelBooking(d, b, u); return view(d, b) })
}

// ---------------- queue ----------------
export function queue(u: User, centerId: string, date: string) {
  const d = db()
  if (!d.centers.some((c) => c.id === centerId)) throw new AppError(404, 'Center not found.')
  const mask = (n: string) => { const p = n.split(' '); return `${p[0]} ${p[1] ? p[1][0] + '.' : ''}`.trim() }
  const rows = (list: Booking[]) => list.map((b) => { const v = view(d, b); return { ...v, farmerName: u.role === 'farmer' && b.farmerId !== u.id ? mask(v.farmerName) : v.farmerName, farmerPhone: u.role === 'farmer' ? '' : v.farmerPhone, procurement: u.role === 'farmer' ? undefined : v.procurement, history: u.role === 'farmer' ? [] : v.history } })
  const waiting = W.waitingQueue(d, centerId, date)
  const processing = W.inProcess(d, centerId, date).sort((a, b) => (a.calledAt ?? '').localeCompare(b.calledAt ?? ''))
  const done = d.bookings.filter((b) => b.centerId === centerId && b.date === date && ['Payment Pending', 'Completed'].includes(b.status)).sort((a, b) => (b.completedAt ?? b.history[b.history.length - 1].at).localeCompare(a.completedAt ?? a.history[a.history.length - 1].at))
  const booked = d.bookings.filter((b) => b.centerId === centerId && b.date === date && b.status === 'Booked')
  const center = d.centers.find((c) => c.id === centerId)!
  return { center, waiting: rows(waiting), processing: rows(processing), recentlyDone: rows([...done.filter((b) => b.status === 'Payment Pending'), ...done.filter((b) => b.status === 'Completed').slice(0, 5)]), bookedCount: booked.length, avgCycleMin: W.avgCycleMin(d, centerId), updatedAt: new Date().toISOString() }
}

// ---------------- staff / inspector actions ----------------
const requireRole = (u: User, ...roles: Role[]) => { if (!roles.includes(u.role)) throw new AppError(403, 'You do not have permission to do this.') }
const staffLike = (u: User) => requireRole(u, 'staff', 'admin')

export function verifyToken(u: User, token: string, date: string) {
  staffLike(u); const d = db()
  const t = token.trim().toUpperCase()
  const b = d.bookings.find((x) => x.token === t && x.date === (date || todayStr()) && canSee(u, x))
  if (!b) throw new AppError(404, `No booking found for token ${t} on ${date || todayStr()} at your center.`)
  return view(d, b)
}
export function action(u: User, id: string, act: string, body: Record<string, unknown>) {
  return run(() => {
    const d = db(); const b = scoped(u, getBooking(d, id))
    if (act === 'inspect') { requireRole(u, 'inspector', 'admin'); W.inspect(d, b, u, { grade: body.grade as string, moisture: Number(body.moisture), damagedPct: Number(body.damagedPct), foreignMaterial: Number(body.foreignMaterial), remarks: String(body.remarks ?? ''), accepted: body.accepted === true }) }
    else {
      staffLike(u)
      if (act === 'checkin') W.checkIn(d, b, u)
      else if (act === 'call') W.callForWeighing(d, b, u)
      else if (act === 'weight') W.recordWeight(d, b, u, { grossKg: Number(body.grossKg), emptyKg: Number(body.emptyKg) })
      else if (act === 'unload') W.confirmUnloading(d, b, u)
      else if (act === 'complete') W.completeProcurement(d, b, u)
      else if (act === 'missed') W.markMissed(d, b, u)
      else if (act === 'delay') W.setDelayed(d, b, u, body.delayed !== false, typeof body.reason === 'string' ? body.reason : undefined)
      else if (act === 'move') W.moveInQueue(d, b, u, body.direction === 'down' ? 'down' : 'up')
      else throw new AppError(404, 'Unknown action.')
    }
    if (act !== 'delay') W.refreshQueue(d, b.centerId, b.date)
    return view(d, b)
  })
}
export function inspections(u: User) {
  requireRole(u, 'inspector', 'admin'); const d = db()
  const mine = d.bookings.filter((b) => canSee(u, b))
  const pending = mine.filter((b) => b.status === 'Quality Check').map((b) => view(d, b))
  const done = mine.filter((b) => d.procurements.find((p) => p.bookingId === b.id)?.inspectedAt).map((b) => view(d, b))
    .sort((a, b) => (b.procurement!.inspectedAt!).localeCompare(a.procurement!.inspectedAt!)).slice(0, 30)
  return { pending, done }
}

// ---------------- notifications ----------------
export function notifications(u: User) {
  const d = db(); if (W.sweep(d)) save()
  const list = d.notifications.filter((n) => n.userId === u.id).sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 60)
  return { items: list, unread: list.filter((n) => !n.read).length }
}
export function markRead(u: User, id?: string) {
  return run(() => { db().notifications.forEach((n) => { if (n.userId === u.id && (!id || n.id === id)) n.read = true }); return { ok: true } })
}

// ---------------- dashboards & analytics ----------------
function scopeBookings(d: DB, u: User, centerId?: string) {
  return d.bookings.filter((b) => canSee(u, b) && (!centerId || b.centerId === centerId))
}
export function dashboard(u: User, centerId?: string) {
  requireRole(u, 'staff', 'admin'); const d = db(); if (W.sweep(d)) save()
  const today = todayStr(); const all = scopeBookings(d, u, centerId); const t = all.filter((b) => b.date === today)
  const active = t.filter((b) => !W.NOT_COUNTED.includes(b.status))
  const procs = (list: Booking[]) => list.map((b) => d.procurements.find((p) => p.bookingId === b.id)).filter(Boolean) as NonNullable<ReturnType<typeof d.procurements.find>>[]
  const completed = t.filter((b) => b.status === 'Completed')
  const received = procs(t.filter((b) => ['Unloading', 'Payment Pending', 'Completed'].includes(b.status))).reduce((s, p) => s + (p.netKg ?? 0), 0)
  const waits = t.map((b) => minutesBetween(b.checkedInAt, b.calledAt)).filter((x): x is number => x !== undefined)
  const centers = d.centers.filter((c) => (!centerId || c.id === centerId) && (u.role === 'admin' || !u.centerId || u.centerId === c.id))
  const cap = centers.reduce((s, c) => s + c.dailyCapacityKg, 0)
  const reserved = centers.reduce((s, c) => s + W.reservedKg(d, c.id, today), 0)
  const cropTotals: Record<string, number> = {}
  all.forEach((b) => { const p = d.procurements.find((x) => x.bookingId === b.id); if (p?.netKg && p.accepted) cropTotals[b.cropName] = (cropTotals[b.cropName] ?? 0) + p.netKg })
  const top = Object.entries(cropTotals).sort((a, b) => b[1] - a[1])[0]
  return {
    date: today,
    expectedToday: active.length,
    waiting: t.filter((b) => b.status === 'Waiting').length,
    inProcess: t.filter((b) => W.IN_PROCESS.includes(b.status)).length,
    completed: completed.length,
    totalReceivedKg: Math.round(received),
    avgWaitMin: waits.length ? round1(waits.reduce((a, b) => a + b, 0) / waits.length) : 0,
    capacityUsedPct: cap ? Math.round((reserved / cap) * 100) : 0,
    capacityKg: cap, reservedKg: Math.round(reserved),
    mostReceivedCrop: top ? { name: top[0], kg: Math.round(top[1]) } : null,
    rejected: t.filter((b) => b.status === 'Rejected').length,
    paymentPending: all.filter((b) => b.status === 'Payment Pending').length,
    delayed: t.filter((b) => b.delayed && !['Completed', 'Cancelled', 'Missed', 'Rejected'].includes(b.status)).length,
    missed: t.filter((b) => b.status === 'Missed').length,
    byStatus: Object.fromEntries(['Booked', 'Waiting', 'Weighing', 'Quality Check', 'Unloading', 'Payment Pending', 'Completed', 'Rejected', 'Cancelled', 'Missed'].map((s) => [s, t.filter((b) => b.status === s).length])),
  }
}

export function analytics(u: User) {
  requireRole(u, 'admin', 'staff'); const d = db()
  const today = todayStr()
  const days = Array.from({ length: 7 }, (_, i) => addDays(today, i - 6))
  const all = scopeBookings(d, u)
  const pOf = (b: Booking) => d.procurements.find((p) => p.bookingId === b.id)
  const received = all.filter((b) => { const p = pOf(b); return p?.netKg && p.accepted })
  const kg = (list: Booking[]) => list.reduce((s, b) => s + (pOf(b)?.netKg ?? 0), 0)
  const byDay = days.map((date) => ({ date, kg: Math.round(kg(received.filter((b) => b.date === date))), trucks: all.filter((b) => b.date === date && !W.NOT_COUNTED.includes(b.status)).length }))
  const byCenter = d.centers.map((c) => ({ name: c.name, kg: Math.round(kg(received.filter((b) => b.centerId === c.id && days.includes(b.date)))) }))
  const byCrop = d.crops.map((c) => ({ name: c.name, kg: Math.round(kg(received.filter((b) => b.cropId === c.id))) })).sort((a, b) => b.kg - a.kg)
  const hours: Record<number, number> = {}
  all.filter((b) => b.checkedInAt).forEach((b) => { const h = hourOf(b.checkedInAt!); hours[h] = (hours[h] ?? 0) + 1 })
  const peak = Array.from({ length: 10 }, (_, i) => i + 7).map((h) => ({ hour: h, label: `${String(h).padStart(2, '0')}:00`, arrivals: hours[h] ?? 0 }))
  const avg = (xs: (number | undefined)[]) => { const v = xs.filter((x): x is number => x !== undefined); return v.length ? round1(v.reduce((a, b) => a + b, 0) / v.length) : 0 }
  const avgProcessing = avg(all.filter((b) => b.status === 'Completed').map((b) => minutesBetween(b.checkedInAt, b.completedAt)))
  const avgWait = avg(all.map((b) => minutesBetween(b.checkedInAt, b.calledAt)))
  const avgQueue = avg(all.map((b) => b.queueLenAtCheckIn))
  const grades = { A: 0, B: 0, C: 0, Rejected: 0 }
  all.forEach((b) => { const p = pOf(b); if (!p?.inspectedAt) return; if (p.accepted && p.grade) grades[p.grade]++; else grades.Rejected++ })
  const inspected = grades.A + grades.B + grades.C + grades.Rejected
  // weekly trend: last 4 weeks
  const weeks = Array.from({ length: 4 }, (_, i) => { const end = addDays(today, -7 * (3 - i)); const start = addDays(end, -6); return { label: i === 3 ? 'This week' : `${3 - i}w ago`, kg: Math.round(kg(received.filter((b) => b.date >= start && b.date <= end))) } })
  const weekKg = byDay.reduce((s, x) => s + x.kg, 0)
  return {
    byDay, byCenter, byCrop, peak, avgProcessingMin: avgProcessing, avgWaitMin: avgWait, avgQueueLength: avgQueue, grades,
    acceptanceRate: inspected ? round1(((grades.A + grades.B + grades.C) / inspected) * 100) : 0, weekly: weeks, weekKg,
    farmersServed: new Set(all.filter((b) => b.status === 'Completed' && days.includes(b.date)).map((b) => b.farmerId)).size,
    peakHour: [...peak].sort((a, b) => b.arrivals - a.arrivals)[0],
  }
}

// ---------------- admin ----------------
export function adminUsers(u: User) {
  requireRole(u, 'admin'); const d = db()
  return d.users.map((x) => ({ ...pub(x), bookings: d.bookings.filter((b) => b.farmerId === x.id).length }))
}
export function setUserActive(u: User, id: string, active: boolean) {
  requireRole(u, 'admin')
  return run(() => { const d = db(); const t = d.users.find((x) => x.id === id); if (!t) throw new AppError(404, 'User not found.'); if (t.id === u.id) throw new AppError(409, 'You cannot suspend your own account.'); t.active = active; t.registrationStatus = active ? 'Approved' : 'Suspended'; W.log(d, u, active ? 'user.activate' : 'user.suspend', `${t.name} (${t.role})`); return pub(t) })
}
export function createStaff(u: User, input: Record<string, unknown>) {
  requireRole(u, 'admin')
  return run(() => {
    const d = db(); const role = input.role === 'inspector' ? 'inspector' : 'staff'
    const name = str(input.name, 2, 60, 'Name'); const loginId = str(input.login, 3, 30, 'Username').toLowerCase(); const password = str(input.password, 6, 64, 'Password')
    if (!/^[a-z0-9._-]+$/.test(loginId)) throw new AppError(400, 'Username may only contain letters, numbers, dot, dash and underscore.')
    if (d.users.some((x) => x.login === loginId)) throw new AppError(409, 'That username is already taken.')
    const centerId = typeof input.centerId === 'string' && d.centers.some((c) => c.id === input.centerId) ? input.centerId : undefined
    if (!centerId) throw new AppError(400, 'Assign the account to a procurement center.')
    const nu: User = { id: W.uid('u'), role, login: loginId, name, phone: typeof input.phone === 'string' ? input.phone : '', location: '', identification: '', registrationStatus: 'Approved', active: true, centerId, passwordHash: hashPassword(password), createdAt: new Date().toISOString() }
    d.users.push(nu); W.log(d, u, 'user.create', `${role} ${name} @ ${centerId}`); return pub(nu)
  })
}
const num = (v: unknown, min: number, max: number, label: string) => { const n = Number(v); if (!Number.isFinite(n) || n < min || n > max) throw new AppError(400, `${label} must be between ${min} and ${max}.`); return Math.round(n) }
export function saveCenter(u: User, id: string | null, input: Record<string, unknown>) {
  requireRole(u, 'admin')
  return run(() => {
    const d = db()
    const fields = {
      name: str(input.name, 3, 60, 'Center name'), location: str(input.location, 2, 80, 'Location'),
      dailyCapacityKg: num(input.dailyCapacityKg, 1000, 1000000, 'Daily capacity (kg)'), weighingStations: num(input.weighingStations, 1, 20, 'Weighing stations'),
      unloadingPoints: num(input.unloadingPoints, 1, 20, 'Unloading points'), slotCapacity: num(input.slotCapacity, 1, 50, 'Bookings per slot'), open: input.open !== false,
    }
    let c: Center | undefined = id ? d.centers.find((x) => x.id === id) : undefined
    if (id && !c) throw new AppError(404, 'Center not found.')
    if (c) Object.assign(c, fields)
    else {
      const used = new Set(d.centers.map((x) => x.prefix))
      const prefix = [...'ABCDEFGHIJKLMNOPQRSTUVWXYZ'].find((l) => !used.has(l))
      if (!prefix) throw new AppError(409, 'Maximum number of centers reached.')
      c = { id: W.uid('c'), prefix, slots: d.centers[0]?.slots ?? ['08:00-09:00', '09:00-10:00', '10:00-11:00', '11:00-12:00', '14:00-15:00', '15:00-16:00'], ...fields }
      d.centers.push(c)
    }
    W.log(d, u, id ? 'center.update' : 'center.create', `${c.name} · ${c.dailyCapacityKg} kg/day`); return c
  })
}
export function saveCrop(u: User, id: string | null, input: Record<string, unknown>) {
  requireRole(u, 'admin')
  return run(() => {
    const d = db(); const name = str(input.name, 2, 40, 'Crop name'); const price = Number(input.pricePerKg)
    if (!Number.isFinite(price) || price <= 0 || price > 100000) throw new AppError(400, 'Price per kg must be greater than 0.')
    if (d.crops.some((c) => c.name.toLowerCase() === name.toLowerCase() && c.id !== id)) throw new AppError(409, 'A crop with this name already exists.')
    let c: Crop | undefined = id ? d.crops.find((x) => x.id === id) : undefined
    if (id && !c) throw new AppError(404, 'Crop not found.')
    if (c) { c.name = name; c.pricePerKg = price; c.active = input.active !== false }
    else { c = { id: W.uid('crop'), name, pricePerKg: price, active: true }; d.crops.push(c) }
    W.log(d, u, id ? 'crop.update' : 'crop.create', `${c.name} @ PKR ${price}/kg`); return c
  })
}
export function logs(u: User, limit = 150) { requireRole(u, 'admin'); return db().logs.slice(-limit).reverse() }
export function reset(u: User) { requireRole(u, 'admin'); resetDb(); return { ok: true } }
export { dateOf }
