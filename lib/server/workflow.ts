import type { DB, User, Booking, Procurement, Center, BookingStatus, SlotInfo } from '../types'
import { AppError } from './errors'
import { todayStr, parts, slotStart, slotEnd, minutesBetween } from './util'

let counter = 0
export const uid = (p: string) => `${p}_${Date.now().toString(36)}${(counter++).toString(36)}${Math.random().toString(36).slice(2, 6)}`
export const NOT_COUNTED: BookingStatus[] = ['Cancelled', 'Missed', 'Rejected']
export const IN_PROCESS: BookingStatus[] = ['Weighing', 'Quality Check', 'Unloading']
const GRADE_FACTOR = { A: 1, B: 0.95, C: 0.9 } as const

type Actor = Pick<User, 'id' | 'name' | 'role'>
const nowIso = () => new Date().toISOString()

export function log(d: DB, actor: Actor | null, action: string, detail: string, at = nowIso()) {
  d.logs.push({ id: uid('log'), at, actorId: actor?.id ?? 'system', actorName: actor?.name ?? 'System', role: actor?.role ?? 'system', action, detail })
  if (d.logs.length > 2000) d.logs.splice(0, d.logs.length - 2000)
}
export function notify(d: DB, userId: string, type: string, title: string, message: string, bookingId?: string, at = nowIso()) {
  d.notifications.push({ id: uid('n'), userId, type, title, message, bookingId, createdAt: at, read: false })
}
export function setStatus(b: Booking, status: BookingStatus, by: string, at = nowIso()) {
  b.status = status
  b.history.push({ status, at, by })
}

// ---------- capacity & slots ----------
export const counted = (d: DB, centerId: string, date: string) =>
  d.bookings.filter((b) => b.centerId === centerId && b.date === date && !NOT_COUNTED.includes(b.status))

export function reservedKg(d: DB, centerId: string, date: string) {
  return counted(d, centerId, date).reduce((sum, b) => {
    const p = d.procurements.find((x) => x.bookingId === b.id)
    return sum + (p?.netKg ?? b.estimatedKg)
  }, 0)
}

export function slotsFor(d: DB, center: Center, date: string) {
  const t = parts()
  const bookings = counted(d, center.id, date)
  const slots: SlotInfo[] = center.slots.map((slot) => {
    const booked = bookings.filter((b) => b.slot === slot).length
    const past = date < t.date || (date === t.date && slotEnd(slot) <= t.minutes)
    const left = Math.max(0, center.slotCapacity - booked)
    return { slot, booked, capacity: center.slotCapacity, left, full: left === 0, past }
  })
  const reservedKgVal = reservedKg(d, center.id, date)
  return { slots, dailyKg: center.dailyCapacityKg, reservedKg: reservedKgVal, availableKg: Math.max(0, center.dailyCapacityKg - reservedKgVal) }
}

export interface BookingInput { centerId: string; cropId: string; date: string; slot: string; estimatedKg: number }

export function createBooking(d: DB, farmer: User, input: BookingInput, at = nowIso(), skipTimeChecks = false): Booking {
  const center = d.centers.find((c) => c.id === input.centerId)
  if (!center) throw new AppError(400, 'Please select a valid procurement center.')
  if (!center.open) throw new AppError(409, 'This procurement center is currently closed for bookings.')
  const crop = d.crops.find((c) => c.id === input.cropId && c.active)
  if (!crop) throw new AppError(400, 'Please select a valid crop.')
  if (!center.slots.includes(input.slot)) throw new AppError(400, 'Please select a valid time slot.')
  if (!skipTimeChecks) {
    const t = parts()
    if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date) || input.date < t.date) throw new AppError(400, 'Please choose today or a future date.')
    const max = new Date(Date.parse(t.date + 'T12:00:00Z') + 14 * 864e5).toISOString().slice(0, 10)
    if (input.date > max) throw new AppError(400, 'Bookings can only be made up to 14 days ahead.')
    if (input.date === t.date && slotEnd(input.slot) <= t.minutes) throw new AppError(409, 'That time slot has already passed.')
  }
  const qty = Number(input.estimatedKg)
  if (!Number.isFinite(qty) || qty < 100 || qty > 50000) throw new AppError(400, 'Estimated quantity must be between 100 and 50,000 kg.')
  const dup = d.bookings.find((b) => b.farmerId === farmer.id && b.cropId === crop.id && b.date === input.date && b.slot === input.slot && !NOT_COUNTED.includes(b.status))
  if (dup) throw new AppError(409, `You already have a ${crop.name} booking (${dup.token}) for this date and time slot.`)
  const info = slotsFor(d, center, input.date)
  const s = info.slots.find((x) => x.slot === input.slot)!
  if (s.full) throw new AppError(409, 'This time slot is full. Please choose another slot.')
  if (qty > info.availableKg) throw new AppError(409, `Only ${info.availableKg.toLocaleString()} kg of capacity is left at this center on that date.`)
  const seq = d.bookings.filter((b) => b.centerId === center.id && b.date === input.date).length + 1
  const b: Booking = {
    id: uid('bk'), farmerId: farmer.id, centerId: center.id, cropId: crop.id, cropName: crop.name, date: input.date, slot: input.slot,
    estimatedKg: Math.round(qty), token: `${center.prefix}-${String(seq).padStart(3, '0')}`, queueOrder: 0, status: 'Booked', delayed: false,
    createdAt: at, history: [{ status: 'Booked', at, by: farmer.name }],
  }
  d.bookings.push(b)
  notify(d, farmer.id, 'booking_confirmed', 'Booking confirmed', `${crop.name} · ${Math.round(qty).toLocaleString()} kg at ${center.name} on ${input.date}, ${input.slot.replace('-', ' – ')}.`, b.id, at)
  notify(d, farmer.id, 'token_generated', 'Digital token generated', `Your token is ${b.token}. Show it to the staff when you arrive.`, b.id, at)
  log(d, farmer, 'booking.create', `${b.token} · ${crop.name} ${qty} kg · ${center.name} · ${input.date} ${input.slot}`, at)
  return b
}

// ---------- queue ----------
export function waitingQueue(d: DB, centerId: string, date: string) {
  return d.bookings.filter((b) => b.centerId === centerId && b.date === date && b.status === 'Waiting').sort((a, b) => a.queueOrder - b.queueOrder)
}
export function inProcess(d: DB, centerId: string, date: string) {
  return d.bookings.filter((b) => b.centerId === centerId && b.date === date && IN_PROCESS.includes(b.status))
}
export function avgCycleMin(d: DB, centerId: string) {
  const vals = d.bookings.filter((b) => b.centerId === centerId && b.calledAt && b.completedAt && b.status === 'Completed').slice(-40)
    .map((b) => minutesBetween(b.calledAt, b.completedAt) ?? 0).filter((m) => m > 0)
  if (!vals.length) return 15
  return Math.min(40, Math.max(8, Math.round(vals.reduce((a, b) => a + b, 0) / vals.length)))
}
export function positionOf(d: DB, b: Booking) {
  if (b.status !== 'Waiting') return 0
  return waitingQueue(d, b.centerId, b.date).findIndex((x) => x.id === b.id) + 1
}
export function etaOf(d: DB, b: Booking) {
  const pos = positionOf(d, b)
  if (!pos) return 0
  const stations = Math.max(1, d.centers.find((c) => c.id === b.centerId)?.weighingStations ?? 1)
  return Math.ceil((pos * avgCycleMin(d, b.centerId)) / stations)
}
/** Notify farmers whose queue position changed (queue position changes notification). */
export function refreshQueue(d: DB, centerId: string, date: string, at = nowIso()) {
  waitingQueue(d, centerId, date).forEach((b, i) => {
    const pos = i + 1
    if (b.lastPos !== undefined && b.lastPos !== pos && pos <= 10) {
      notify(d, b.farmerId, 'queue_position', 'Queue position updated', `Your position in the queue for ${b.token} is now #${pos}.`, b.id, at)
    }
    b.lastPos = pos
  })
}

// ---------- state transitions ----------
function need(b: Booking, ...allowed: BookingStatus[]) {
  if (!allowed.includes(b.status)) throw new AppError(409, `This action is not allowed while the booking is "${b.status}".`)
}
const proc = (d: DB, b: Booking) => d.procurements.find((p) => p.bookingId === b.id)

export function checkIn(d: DB, b: Booking, actor: Actor, at = nowIso(), skipDateCheck = false) {
  need(b, 'Booked')
  if (!skipDateCheck && b.date !== todayStr()) throw new AppError(409, `This booking is for ${b.date}. Check-in is only possible on the booking date.`)
  const orders = d.bookings.filter((x) => x.centerId === b.centerId && x.date === b.date).map((x) => x.queueOrder)
  b.queueOrder = Math.max(0, ...orders) + 1
  b.queueLenAtCheckIn = waitingQueue(d, b.centerId, b.date).length
  b.checkedInAt = at
  setStatus(b, 'Checked In', actor.name, at)
  setStatus(b, 'Waiting', actor.name, at)
  b.lastPos = waitingQueue(d, b.centerId, b.date).findIndex((x) => x.id === b.id) + 1
  notify(d, b.farmerId, 'checked_in', 'Checked in', `Token ${b.token} verified. You are #${b.lastPos} in the live queue.`, b.id, at)
  log(d, actor, 'booking.checkin', `${b.token} checked in`, at)
}

export function callForWeighing(d: DB, b: Booking, actor: Actor, at = nowIso()) {
  need(b, 'Waiting')
  const center = d.centers.find((c) => c.id === b.centerId)!
  const busy = new Set(inProcess(d, b.centerId, b.date).filter((x) => x.status === 'Weighing').map((x) => x.station))
  let station = 0
  for (let i = 1; i <= center.weighingStations; i++) if (!busy.has(i)) { station = i; break }
  if (!station) throw new AppError(409, 'All weighing stations are busy. Finish an active weighing first.')
  b.station = station
  b.calledAt = at
  setStatus(b, 'Weighing', actor.name, at)
  notify(d, b.farmerId, 'called', 'You are called for weighing', `Please proceed to Weighing Station ${station} with token ${b.token}.`, b.id, at)
  log(d, actor, 'booking.call', `${b.token} called to station ${station}`, at)
  refreshQueue(d, b.centerId, b.date, at)
}

export function recordWeight(d: DB, b: Booking, actor: Actor, input: { grossKg: number; emptyKg: number }, at = nowIso()) {
  need(b, 'Weighing')
  const gross = Number(input.grossKg), empty = Number(input.emptyKg)
  if (!Number.isFinite(gross) || !Number.isFinite(empty) || gross <= 0 || empty <= 0) throw new AppError(400, 'Enter valid gross and empty vehicle weights.')
  if (gross <= empty) throw new AppError(400, 'Gross weight must be greater than empty vehicle weight.')
  if (gross > 200000) throw new AppError(400, 'Gross weight looks too large. Please re-check the reading.')
  let p = proc(d, b)
  if (!p) { p = { id: uid('pr'), bookingId: b.id, paymentStatus: 'Pending' }; d.procurements.push(p) }
  Object.assign(p, { grossKg: gross, emptyKg: empty, netKg: gross - empty, weighingStation: b.station, weighedAt: at })
  setStatus(b, 'Quality Check', actor.name, at)
  notify(d, b.farmerId, 'weighed', 'Weighing complete', `Net crop weight ${(gross - empty).toLocaleString()} kg recorded. Quality inspection is next.`, b.id, at)
  log(d, actor, 'procurement.weigh', `${b.token} gross ${gross} empty ${empty} net ${gross - empty}`, at)
}

export interface InspectInput { grade?: string; moisture: number; damagedPct: number; foreignMaterial: number; remarks?: string; accepted: boolean }
export function inspect(d: DB, b: Booking, actor: Actor, input: InspectInput, at = nowIso()) {
  need(b, 'Quality Check')
  const p = proc(d, b)
  if (!p) throw new AppError(409, 'Weighing record is missing for this booking.')
  const pct = (v: number, label: string) => { if (!Number.isFinite(Number(v)) || Number(v) < 0 || Number(v) > 100) throw new AppError(400, `${label} must be between 0 and 100.`); return Number(v) }
  const moisture = pct(input.moisture, 'Moisture'), damaged = pct(input.damagedPct, 'Damaged percentage'), foreign = pct(input.foreignMaterial, 'Foreign material')
  const remarks = (input.remarks ?? '').trim().slice(0, 500)
  if (input.accepted && !['A', 'B', 'C'].includes(String(input.grade))) throw new AppError(400, 'Select a quality grade (A, B or C) to approve.')
  if (!input.accepted && remarks.length < 3) throw new AppError(400, 'Please add a remark explaining the rejection.')
  Object.assign(p, { grade: input.accepted ? input.grade : undefined, moisture, damagedPct: damaged, foreignMaterial: foreign, remarks, inspectorId: actor.id, inspectedAt: at, accepted: input.accepted })
  if (input.accepted) {
    setStatus(b, 'Unloading', actor.name, at)
    notify(d, b.farmerId, 'quality', 'Quality approved', `Grade ${input.grade} · moisture ${moisture}%. Please proceed to unloading.`, b.id, at)
  } else {
    p.paymentStatus = 'Not applicable'
    b.completedAt = at
    setStatus(b, 'Rejected', actor.name, at)
    notify(d, b.farmerId, 'rejected', 'Produce rejected', remarks || 'Your produce did not meet quality requirements.', b.id, at)
  }
  log(d, actor, input.accepted ? 'quality.approve' : 'quality.reject', `${b.token} grade ${input.grade ?? '-'} moisture ${moisture}%`, at)
}

export function confirmUnloading(d: DB, b: Booking, actor: Actor, at = nowIso()) {
  need(b, 'Unloading')
  const p = proc(d, b)
  if (!p || !p.netKg || !p.grade) throw new AppError(409, 'Weighing and quality records must be complete before unloading.')
  const price = d.crops.find((c) => c.id === b.cropId)?.pricePerKg ?? 0
  const factor = GRADE_FACTOR[p.grade]
  const seq = d.procurements.filter((x) => x.receiptNo).length + 1
  Object.assign(p, { unloadedAt: at, pricePerKg: price, gradeFactor: factor, totalAmount: Math.round(p.netKg * price * factor), receiptNo: `RC-${b.date.replace(/-/g, '')}-${String(seq).padStart(4, '0')}`, paymentStatus: 'Pending' })
  setStatus(b, 'Payment Pending', actor.name, at)
  notify(d, b.farmerId, 'payment_pending', 'Unloading confirmed', `Receipt ${p.receiptNo} generated. Amount due: PKR ${p.totalAmount!.toLocaleString()}.`, b.id, at)
  log(d, actor, 'procurement.unload', `${b.token} receipt ${p.receiptNo} amount ${p.totalAmount}`, at)
}

export function completeProcurement(d: DB, b: Booking, actor: Actor, at = nowIso()) {
  need(b, 'Payment Pending')
  const p = proc(d, b)!
  p.paymentStatus = 'Paid'; p.paidAt = at; p.completionTime = at
  b.completedAt = at
  setStatus(b, 'Completed', actor.name, at)
  notify(d, b.farmerId, 'completed', 'Procurement completed', `Payment of PKR ${p.totalAmount?.toLocaleString()} recorded as paid. Thank you!`, b.id, at)
  notify(d, b.farmerId, 'payment_changed', 'Payment status changed', `Payment status for ${b.token} is now Paid.`, b.id, at)
  log(d, actor, 'procurement.complete', `${b.token} paid ${p.totalAmount}`, at)
}

export function markMissed(d: DB, b: Booking, actor: Actor | null, at = nowIso()) {
  need(b, 'Booked')
  setStatus(b, 'Missed', actor?.name ?? 'System', at)
  notify(d, b.farmerId, 'missed', 'Booking missed', `You did not arrive for token ${b.token}. Please book a new slot.`, b.id, at)
  log(d, actor, 'booking.missed', `${b.token} marked missed`, at)
}

export function cancelBooking(d: DB, b: Booking, actor: Actor, at = nowIso()) {
  need(b, 'Booked')
  setStatus(b, 'Cancelled', actor.name, at)
  notify(d, b.farmerId, 'cancelled', 'Booking cancelled', `Booking ${b.token} was cancelled and the capacity was released.`, b.id, at)
  log(d, actor, 'booking.cancel', `${b.token} cancelled`, at)
}

export function setDelayed(d: DB, b: Booking, actor: Actor, delayed: boolean, reason?: string) {
  if (['Completed', 'Cancelled', 'Missed', 'Rejected'].includes(b.status)) throw new AppError(409, 'Closed bookings cannot be flagged as delayed.')
  b.delayed = delayed; b.delayReason = delayed ? (reason ?? '').slice(0, 200) : undefined
  if (delayed) notify(d, b.farmerId, 'delayed', 'Your booking is delayed', reason ? `Reason: ${reason}` : `Token ${b.token} is experiencing a delay.`, b.id)
  log(d, actor, delayed ? 'booking.delay' : 'booking.undelay', `${b.token}${reason ? ' · ' + reason : ''}`)
}

export function moveInQueue(d: DB, b: Booking, actor: Actor, dir: 'up' | 'down') {
  need(b, 'Waiting')
  const q = waitingQueue(d, b.centerId, b.date)
  const i = q.findIndex((x) => x.id === b.id)
  const j = dir === 'up' ? i - 1 : i + 1
  if (j < 0 || j >= q.length) return
  const tmp = q[i].queueOrder; q[i].queueOrder = q[j].queueOrder; q[j].queueOrder = tmp
  log(d, actor, 'queue.reorder', `${b.token} moved ${dir}`)
  refreshQueue(d, b.centerId, b.date)
}

/** Lazy housekeeping: past-date no-shows become Missed; slot reminders are sent. */
export function sweep(d: DB) {
  const t = parts()
  let changed = false
  for (const b of d.bookings) {
    if (b.status !== 'Booked') continue
    if (b.date < t.date) { markMissed(d, b, null); changed = true; continue }
    if (b.date === t.date && !b.remindedAt) {
      const start = slotStart(b.slot)
      if (start - t.minutes <= 60 && start - t.minutes > -60) {
        b.remindedAt = new Date().toISOString()
        notify(d, b.farmerId, 'slot_approaching', 'Your slot is approaching', `Token ${b.token}: arrive at ${d.centers.find((c) => c.id === b.centerId)?.name} by ${b.slot.split('-')[0]}.`, b.id)
        changed = true
      }
    }
  }
  return changed
}
export type { Procurement }
