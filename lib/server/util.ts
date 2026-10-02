export const TZ = process.env.APP_TZ || 'Asia/Karachi'

export function parts(d: Date = new Date()) {
  const f = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
  const o: Record<string, string> = {}
  f.formatToParts(d).forEach((p) => { o[p.type] = p.value })
  return { date: `${o.year}-${o.month}-${o.day}`, minutes: Number(o.hour) * 60 + Number(o.minute) }
}
export const todayStr = () => parts().date
export const dateOf = (iso: string) => parts(new Date(iso)).date
export const hourOf = (iso: string) => Math.floor(parts(new Date(iso)).minutes / 60)
export function addDays(date: string, n: number) {
  const d = new Date(date + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10)
}
const toMin = (t: string) => { const [h, m] = t.split(':').map(Number); return h * 60 + m }
export const slotStart = (s: string) => toMin(s.split('-')[0])
export const slotEnd = (s: string) => toMin(s.split('-')[1])
/** ISO timestamp for a local (TZ) date + minutes-of-day */
export function atLocal(date: string, minutes: number) {
  const base = Date.parse(date + 'T00:00:00Z')
  const guess = new Date(base + minutes * 60000)
  const p = parts(guess)
  const local = (Date.parse(p.date + 'T00:00:00Z') - base) / 60000 + p.minutes
  return new Date(guess.getTime() - (local - minutes) * 60000).toISOString()
}
export const minutesBetween = (a?: string, b?: string) => (a && b ? Math.max(0, Math.round((Date.parse(b) - Date.parse(a)) / 60000)) : undefined)
export const round1 = (n: number) => Math.round(n * 10) / 10
