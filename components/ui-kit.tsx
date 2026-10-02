'use client'
import { useEffect, useState, type ReactNode } from 'react'
import { TriangleAlert, CircleCheck, X } from 'lucide-react'

export function Status({ children }: { children: string }) {
  const s = String(children)
  const tone = ['Completed', 'Accepted', 'Paid', 'Approved', 'Active'].includes(s) ? 'success'
    : ['Cancelled', 'Missed', 'Rejected', 'Suspended'].includes(s) ? 'red'
    : ['Weighing', 'Quality Check', 'Unloading', 'Payment Pending', 'Pending', 'Delayed'].includes(s) ? 'amber'
    : ['You', 'Checked In', 'Booked'].includes(s) ? 'blue' : 'neutral'
  return <span className={`status ${tone}`}><span className="status-dot" />{s}</span>
}

export function StatCard({ icon: Icon, label, value, note, tone = 'green' }: { icon: any; label: string; value: ReactNode; note?: string; tone?: string }) {
  return <div className="stat-card"><div className={`stat-icon ${tone}`}><Icon size={18} /></div><div><p className="eyebrow">{label}</p><p className="stat-value">{value}</p>{note && <p className="stat-note">{note}</p>}</div></div>
}

export function Alert({ kind = 'error', children, onClose }: { kind?: 'error' | 'success' | 'info'; children: ReactNode; onClose?: () => void }) {
  if (!children) return null
  return <div className={`alert ${kind}`} role={kind === 'error' ? 'alert' : 'status'}>{kind === 'success' ? <CircleCheck size={17} /> : <TriangleAlert size={17} />}<span>{children}</span>{onClose && <button className="alert-x" onClick={onClose} aria-label="Dismiss"><X size={15} /></button>}</div>
}

export function Modal({ title, onClose, children, wide }: { title: string; onClose: () => void; children: ReactNode; wide?: boolean }) {
  useEffect(() => { const h = (e: KeyboardEvent) => e.key === 'Escape' && onClose(); window.addEventListener('keydown', h); return () => window.removeEventListener('keydown', h) }, [onClose])
  return <div className="modal-back" onMouseDown={(e) => e.target === e.currentTarget && onClose()}><div className={`modal ${wide ? 'wide' : ''}`} role="dialog" aria-modal="true" aria-label={title}><div className="modal-head"><h3>{title}</h3><button className="icon-btn" onClick={onClose} aria-label="Close"><X size={18} /></button></div><div className="modal-body">{children}</div></div></div>
}

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return <label className="field"><span>{label}</span>{children}{hint && <small>{hint}</small>}</label>
}

export function Empty({ title, note }: { title: string; note?: string }) {
  return <div className="empty"><strong>{title}</strong>{note && <p>{note}</p>}</div>
}

export function Loading({ text = 'Loading…' }: { text?: string }) { return <div className="empty"><span className="spinner" />{text}</div> }

/** Run an async action with busy + error state. */
export function useAction() {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [ok, setOk] = useState('')
  async function run<T>(fn: () => Promise<T>, success?: string): Promise<T | undefined> {
    setBusy(true); setError(''); setOk('')
    try { const r = await fn(); if (success) setOk(success); return r }
    catch (e: any) { setError(e.message || 'Something went wrong.'); return undefined }
    finally { setBusy(false) }
  }
  return { busy, error, ok, run, setError, setOk }
}

export function BarChart({ data, unit = '', height = 190 }: { data: { label: string; value: number }[]; unit?: string; height?: number }) {
  const max = Math.max(1, ...data.map((d) => d.value))
  return <div className="mini-bars" style={{ height }}>{data.map((d) => <div className="mini-col" key={d.label}><span className="mini-val">{d.value ? `${d.value}${unit}` : ''}</span><div className="mini-bar" style={{ height: `${Math.max(2, (d.value / max) * 100)}%` }} /><small>{d.label}</small></div>)}</div>
}
export function HBars({ data, unit = '' }: { data: { label: string; value: number }[]; unit?: string }) {
  const max = Math.max(1, ...data.map((d) => d.value))
  return <div className="hbars">{data.map((d) => <div key={d.label}><div className="hbar-top"><span>{d.label}</span><b>{d.value.toLocaleString()}{unit}</b></div><div className="hbar"><i style={{ width: `${(d.value / max) * 100}%` }} /></div></div>)}</div>
}
