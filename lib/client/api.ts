import { useCallback, useEffect, useRef, useState } from 'react'

export async function api<T = any>(path: string, opts: { method?: string; body?: unknown } = {}): Promise<T> {
  let res: Response
  try {
    res = await fetch('/api/' + path, { method: opts.method ?? (opts.body ? 'POST' : 'GET'), headers: opts.body ? { 'Content-Type': 'application/json' } : undefined, body: opts.body ? JSON.stringify(opts.body) : undefined, cache: 'no-store' })
  } catch {
    throw new Error('Network error. Please check your connection and try again.')
  }
  let data: any = null
  try { data = await res.json() } catch { /* empty */ }
  if (res.status === 401 && !path.startsWith('auth/')) window.dispatchEvent(new Event('aq-unauth'))
  if (!res.ok) { const e: any = new Error(data?.error ?? `Request failed (${res.status})`); e.status = res.status; throw e }
  return data as T
}

/** Fetch + optional polling. Pass null path to skip. */
export function useFetch<T = any>(path: string | null, intervalMs = 0) {
  const [data, setData] = useState<T | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const alive = useRef(true)
  const load = useCallback(async () => {
    if (!path) return
    try { const r = await api<T>(path); if (alive.current) { setData(r); setError('') } }
    catch (e: any) { if (alive.current) setError(e.message) }
    finally { if (alive.current) setLoading(false) }
  }, [path])
  useEffect(() => { alive.current = true; setLoading(true); load(); const t = intervalMs ? setInterval(load, intervalMs) : undefined; return () => { alive.current = false; if (t) clearInterval(t) } }, [load, intervalMs])
  return { data, error, loading, reload: load, setData }
}

// ---------- formatting ----------
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
export const fmtDate = (d: string) => { const [y, m, day] = d.split('-'); return `${day} ${MONTHS[Number(m) - 1]} ${y}` }
const t12 = (t: string) => { const [h, m] = t.split(':').map(Number); return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}` }
export const fmtSlot = (s: string) => s.split('-').map(t12).join(' – ')
export const fmtKg = (n?: number | null) => (n === undefined || n === null ? '—' : `${Math.round(n).toLocaleString()} kg`)
export const fmtTons = (kg: number) => (kg >= 1000 ? `${(kg / 1000).toFixed(1)} t` : `${Math.round(kg)} kg`)
export const fmtMoney = (n?: number | null) => (n === undefined || n === null ? '—' : `PKR ${Math.round(n).toLocaleString()}`)
export const fmtTime = (iso?: string) => (iso ? new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—')
export const fmtStamp = (iso?: string) => (iso ? new Date(iso).toLocaleString([], { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—')
export const todayIso = () => new Date().toLocaleDateString('en-CA')

export function toCsv(rows: Record<string, unknown>[]) {
  if (!rows.length) return ''
  const keys = Object.keys(rows[0])
  const esc = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`
  return [keys.join(','), ...rows.map((r) => keys.map((k) => esc(r[k])).join(','))].join('\n')
}
export function downloadCsv(name: string, rows: Record<string, unknown>[]) {
  const blob = new Blob([toCsv(rows)], { type: 'text/csv;charset=utf-8' })
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; a.click(); URL.revokeObjectURL(a.href)
}

export function printReceipt(b: any) {
  const p = b.procurement; if (!p?.receiptNo) return
  const w = window.open('', '_blank', 'width=520,height=720'); if (!w) return
  const row = (k: string, v: string) => `<tr><td>${k}</td><td><b>${v}</b></td></tr>`
  w.document.write(`<html><head><title>${p.receiptNo}</title><style>body{font-family:system-ui,sans-serif;padding:28px;color:#1d2a25}h1{margin:0;font-size:22px;color:#1c6b4d}table{width:100%;border-collapse:collapse;margin-top:16px}td{padding:8px 0;border-bottom:1px solid #e5ebe6;font-size:14px}td:last-child{text-align:right}.t{font-size:20px}</style></head><body>
  <h1>AgriQueue · Procurement Receipt</h1><p style="color:#77837d;margin:4px 0">${p.receiptNo} · ${fmtDate(b.date)}</p>
  <table>${row('Farmer', b.farmerName)}${row('Center', b.centerName)}${row('Token', b.token)}${row('Crop', b.cropName)}${row('Gross weight', fmtKg(p.grossKg))}${row('Empty vehicle', fmtKg(p.emptyKg))}${row('Net crop weight', fmtKg(p.netKg))}${row('Quality grade', 'Grade ' + p.grade + ' · moisture ' + p.moisture + '%')}${row('Rate', fmtMoney(p.pricePerKg) + '/kg × ' + p.gradeFactor)}${row('Payment status', p.paymentStatus)}
  <tr><td class="t">Total amount</td><td class="t"><b>${fmtMoney(p.totalAmount)}</b></td></tr></table><script>window.onload=()=>window.print()</script></body></html>`)
  w.document.close()
}
