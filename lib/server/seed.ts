import type { DB, User, Booking, Center } from '../types'
import { hashPassword } from './auth'
import { todayStr, addDays, atLocal, slotStart } from './util'
import * as W from './workflow'

function rng(seed: number) {
  return () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296 }
}
const SLOTS = ['08:00-09:00', '09:00-10:00', '10:00-11:00', '11:00-12:00', '12:00-13:00', '14:00-15:00', '15:00-16:00']

export function seedDb(): DB {
  const d: DB = { users: [], centers: [], crops: [], bookings: [], procurements: [], notifications: [], logs: [] }
  const rand = rng(20261001)
  const pick = <T,>(a: T[]) => a[Math.floor(rand() * a.length)]
  const between = (a: number, b: number) => a + rand() * (b - a)
  const created = new Date(Date.now() - 30 * 864e5).toISOString()

  d.centers.push(
    { id: 'c1', name: 'Main Procurement Center', location: 'Karachi', prefix: 'A', dailyCapacityKg: 30000, weighingStations: 3, unloadingPoints: 2, slotCapacity: 6, slots: SLOTS, open: true },
    { id: 'c2', name: 'North Collection Point', location: 'Karachi North', prefix: 'B', dailyCapacityKg: 22000, weighingStations: 2, unloadingPoints: 2, slotCapacity: 5, slots: SLOTS, open: true },
  )
  d.crops.push(
    { id: 'wheat', name: 'Wheat', pricePerKg: 98, active: true }, { id: 'rice', name: 'Rice', pricePerKg: 185, active: true },
    { id: 'corn', name: 'Corn', pricePerKg: 72, active: true }, { id: 'cotton', name: 'Cotton', pricePerKg: 205, active: true },
  )
  const mk = (id: string, role: User['role'], login: string, name: string, pw: string, extra: Partial<User> = {}): User => {
    const u: User = { id, role, login, name, phone: extra.phone ?? login, location: 'Karachi', identification: '', registrationStatus: 'Approved', active: true, passwordHash: hashPassword(pw), createdAt: created, ...extra }
    d.users.push(u); return u
  }
  const admin = mk('u_admin', 'admin', 'admin', 'Management Admin', 'admin123', { phone: '0300-0000000' })
  const staff = mk('u_staff', 'staff', 'staff', 'Hamza Qureshi', 'staff123', { centerId: 'c1', phone: '0300-0000001' })
  mk('u_staff2', 'staff', 'staff2', 'Rabia Siddiqui', 'staff123', { centerId: 'c2', phone: '0300-0000002' })
  const insp = mk('u_insp', 'inspector', 'inspector', 'Dr. Kamran Idrees', 'inspect123', { centerId: 'c1', phone: '0300-0000003' })
  const insp2 = mk('u_insp2', 'inspector', 'inspector2', 'Maria Anwar', 'inspect123', { centerId: 'c2', phone: '0300-0000004' })
  const names = ['Ahmed Khan', 'Ali Raza', 'Sana Noor', 'Irfan Malik', 'Farah Khan', 'Usman Tariq', 'Nadia Ali', 'Bilal Ahmed', 'Sara Ahmed', 'Imran Shah']
  const farmers = names.map((n, i) => {
    const phone = i === 0 ? '03001234567' : `0310${String(1000000 + i * 1111)}`
    return mk(`u_f${i}`, 'farmer', phone, n, 'farmer123', { phone, identification: `42101-${String(1234560 + i)}-${i % 9}`, location: pick(['Karachi', 'Thatta', 'Gadap', 'Malir', 'Hyderabad']) })
  })
  const actorFor = (c: string) => (c === 'c1' ? { staff, insp } : { staff: d.users.find((u) => u.id === 'u_staff2')!, insp: insp2 })

  /** Run a booking through the workflow until `upto`, using times based on t0 (ms). */
  type Target = 'Waiting' | 'Weighing' | 'Quality Check' | 'Unloading' | 'Payment Pending' | 'Completed' | 'Rejected'
  const ORDER: Target[] = ['Waiting', 'Weighing', 'Quality Check', 'Unloading', 'Payment Pending', 'Completed']
  function advance(b: Booking, upto: Target, t0: number, waitMin: number, skipDate = true) {
    const { staff: s, insp: i } = actorFor(b.centerId)
    const iso = (min: number) => new Date(t0 + min * 60000).toISOString()
    const target = upto === 'Rejected' ? 'Quality Check' : upto
    const reach = (t: Target) => ORDER.indexOf(target) >= ORDER.indexOf(t)
    W.checkIn(d, b, s, iso(0), skipDate)
    b.queueLenAtCheckIn = Math.round(between(1, 12))
    if (reach('Weighing')) W.callForWeighing(d, b, s, iso(waitMin))
    if (reach('Quality Check')) {
      const empty = Math.round(between(1800, 2600) / 10) * 10
      W.recordWeight(d, b, s, { grossKg: empty + Math.round(b.estimatedKg * between(0.92, 1.08)), emptyKg: empty }, iso(waitMin + 8))
    }
    if (upto === 'Rejected') {
      W.inspect(d, b, i, { moisture: Math.round(between(16, 22)), damagedPct: Math.round(between(8, 20)), foreignMaterial: Math.round(between(3, 8)), remarks: 'Moisture and damaged grain above acceptable limits.', accepted: false }, iso(waitMin + 18))
      return
    }
    if (reach('Unloading')) {
      const r = rand()
      W.inspect(d, b, i, { grade: r < 0.65 ? 'A' : r < 0.93 ? 'B' : 'C', moisture: Math.round(between(9, 14) * 10) / 10, damagedPct: Math.round(between(0.5, 4) * 10) / 10, foreignMaterial: Math.round(between(0.2, 2) * 10) / 10, remarks: '', accepted: true }, iso(waitMin + 18))
    }
    if (reach('Payment Pending')) W.confirmUnloading(d, b, s, iso(waitMin + 30))
    if (reach('Completed')) W.completeProcurement(d, b, s, iso(waitMin + 35))
  }

  // ---- history (previous 7 days) ----
  for (let back = 7; back >= 1; back--) {
    const date = addDays(todayStr(), -back)
    for (const c of d.centers) {
      const n = Math.round(between(5, 9))
      for (let k = 0; k < n; k++) {
        const f = pick(farmers); const crop = pick(d.crops)
        const slot = pick(c.slots)
        const at = atLocal(date, slotStart(slot) - 600)
        let b: Booking
        try { b = W.createBooking(d, f, { centerId: c.id, cropId: crop.id, date, slot, estimatedKg: Math.round(between(800, 5000) / 50) * 50 }, at, true) } catch { continue }
        const r = rand()
        if (r < 0.05) { b.status = 'Cancelled'; b.history.push({ status: 'Cancelled', at, by: f.name }); continue }
        if (r < 0.1) { b.status = 'Missed'; b.history.push({ status: 'Missed', at, by: 'System' }); continue }
        const t0 = Date.parse(atLocal(date, slotStart(slot) + Math.round(between(0, 25))))
        advance(b, r < 0.2 ? 'Rejected' : 'Completed', t0, Math.round(between(10, 55)))
        if (b.status === 'Completed' && rand() < 0.04) {
          // leave a few payments pending for realism
          const p = d.procurements.find((x) => x.bookingId === b.id)!
          p.paymentStatus = 'Pending'; p.paidAt = undefined; b.status = 'Payment Pending'; b.completedAt = undefined; b.history.pop()
        }
      }
    }
  }

  // ---- today ----
  const today = todayStr(); const now = Date.now()
  const mkBooking = (f: User, c: string, crop: string, slot: string, kg: number) =>
    W.createBooking(d, f, { centerId: c, cropId: crop, date: today, slot, estimatedKg: kg }, new Date(now - 6 * 3600e3).toISOString(), true)
  const plan: [number, string, string, string, number, Target | 'Booked', number][] = [
    // farmer idx, center, crop, slot, kg, state, minutes ago of check-in
    [1, 'c1', 'wheat', '08:00-09:00', 2500, 'Completed', 170],
    [2, 'c1', 'rice', '08:00-09:00', 2000, 'Completed', 150],
    [3, 'c1', 'corn', '09:00-10:00', 1800, 'Payment Pending', 110],
    [4, 'c1', 'wheat', '09:00-10:00', 3200, 'Unloading', 90],
    [5, 'c1', 'cotton', '10:00-11:00', 1500, 'Quality Check', 70],
    [6, 'c1', 'wheat', '10:00-11:00', 2800, 'Weighing', 55],
    [0, 'c1', 'wheat', '10:00-11:00', 3000, 'Waiting', 40],
    [7, 'c1', 'rice', '11:00-12:00', 2200, 'Waiting', 30],
    [8, 'c1', 'corn', '11:00-12:00', 1600, 'Waiting', 20],
    [9, 'c1', 'wheat', '12:00-13:00', 2400, 'Booked', 0],
    [1, 'c1', 'rice', '14:00-15:00', 1900, 'Booked', 0],
    [3, 'c2', 'wheat', '08:00-09:00', 2600, 'Completed', 140],
    [5, 'c2', 'corn', '09:00-10:00', 2100, 'Waiting', 45],
    [7, 'c2', 'rice', '10:00-11:00', 1700, 'Waiting', 25],
    [9, 'c2', 'cotton', '11:00-12:00', 1400, 'Booked', 0],
  ]
  for (const [fi, c, crop, slot, kg, state, ago] of plan) {
    const b = mkBooking(farmers[fi], c, crop, slot, kg)
    if (state !== 'Booked') advance(b, state, now - ago * 60000, Math.min(15, Math.max(4, ago / 5)))
  }
  const tomorrow = addDays(today, 1)
  W.createBooking(d, farmers[0], { centerId: 'c1', cropId: 'rice', date: tomorrow, slot: '09:00-10:00', estimatedKg: 2000 }, new Date().toISOString(), true)
  W.refreshQueue(d, 'c1', today); W.refreshQueue(d, 'c2', today)

  // history notifications are read; only today's recent ones stay unread
  const cutoff = now - 6 * 3600e3
  d.notifications.forEach((n) => { n.read = Date.parse(n.createdAt) < cutoff })
  W.log(d, admin, 'system.seed', 'Demo data initialised')
  return d
}
export type { Center }
