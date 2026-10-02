'use client'
import { useState } from 'react'
import { TriangleAlert, ArrowDown, ArrowUp, Check, Clock3, Gauge, PackageCheck, Printer, ScanLine, Scale, Truck, Users, Wheat, CircleX, ShieldCheck, CreditCard, Zap } from 'lucide-react'
import { api, fmtDate, fmtKg, fmtMoney, fmtSlot, fmtTons, printReceipt, useFetch } from '@/lib/client/api'
import { Alert, Empty, Field, Loading, Modal, StatCard, Status, useAction } from '../ui-kit'
import { BookingDetail, BookingsTable } from '../shared'

/** Center selector: staff are locked to their center; admins choose (optionally "all"). */
export function useCenter(user: any, allowAll = false) {
  const { data: meta } = useFetch<any>('meta')
  const [sel, setSel] = useState('')
  const centerId = user.centerId || sel || (allowAll ? '' : meta?.centers?.[0]?.id ?? '')
  const picker = user.centerId ? null : <div className="filter-row"><select value={centerId} onChange={(e) => setSel(e.target.value)} aria-label="Procurement center">{allowAll && <option value="">All centers</option>}{meta?.centers.map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></div>
  return { centerId, picker, meta }
}

export function StaffDashboard({ user }: { user: any }) {
  const { centerId, picker } = useCenter(user, true)
  const { data: d, error } = useFetch<any>(`dashboard${centerId ? `?centerId=${centerId}` : ''}`, 10000)
  return <div className="page-content"><div className="page-heading"><div><p className="eyebrow green-text">{user.role === 'admin' ? 'MANAGEMENT' : 'STAFF WORKSPACE'}</p><h1>{user.role === 'admin' ? 'Operations dashboard' : 'Today at your center'}</h1><p className="muted">{d ? fmtDate(d.date) : ''} · live figures refresh automatically.</p></div>{picker}</div>
    <Alert>{error}</Alert>
    {!d ? <Loading /> : <>
      <div className="stats-grid"><StatCard icon={Users} label="Farmers expected today" value={d.expectedToday} note={`${d.waiting} currently waiting`} /><StatCard icon={Check} label="Completed procurements" value={d.completed} note={`${d.inProcess} in process now`} tone="lime" /><StatCard icon={Truck} label="Total crop received" value={fmtTons(d.totalReceivedKg)} note="Today, after weighing" tone="blue" /><StatCard icon={Clock3} label="Average waiting time" value={`${d.avgWaitMin} min`} note="Check-in to weighing call" tone="amber" /></div>
      <div className="stats-grid"><StatCard icon={Gauge} label="Daily capacity usage" value={`${d.capacityUsedPct}%`} note={`${fmtKg(d.reservedKg)} of ${fmtKg(d.capacityKg)}`} /><StatCard icon={Wheat} label="Most received crop" value={d.mostReceivedCrop?.name ?? '—'} note={d.mostReceivedCrop ? fmtTons(d.mostReceivedCrop.kg) + ' overall' : 'No data yet'} tone="lime" /><StatCard icon={CircleX} label="Rejected produce" value={d.rejected} note="Rejected today" tone="amber" /><StatCard icon={CreditCard} label="Payment pending cases" value={d.paymentPending} note={`${d.delayed} delayed · ${d.missed} missed today`} tone="blue" /></div>
      <section className="panel panel-pad"><div className="panel-head"><div><p className="eyebrow">TODAY'S PIPELINE</p><h3>Bookings by status</h3></div></div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginTop: 8 }}>{Object.entries(d.byStatus).map(([s, n]) => <div key={s} className="stat-card" style={{ minWidth: 150 }}><div><p className="eyebrow">{s}</p><p className="stat-value">{n as number}</p></div></div>)}</div></section></>}
  </div>
}

export function CheckInView({ user }: { user: any }) {
  const { centerId, picker } = useCenter(user)
  const [token, setToken] = useState(''); const [found, setFound] = useState<any>(null)
  const act = useAction()
  const { data: today } = useFetch<any[]>(centerId ? `bookings?centerId=${centerId}&status=Booked&date=${new Date().toLocaleDateString('en-CA')}` : null, 8000)
  const [refresh, setRefresh] = useState(0)
  async function verify(e?: React.FormEvent, t = token) {
    e?.preventDefault(); if (!t.trim()) return act.setError('Enter the farmer’s token number.')
    const r = await act.run(() => api('bookings/verify', { body: { token: t, date: new Date().toLocaleDateString('en-CA') } })); if (r) setFound(r)
  }
  async function checkIn(id: string) {
    const r = await act.run(() => api(`bookings/${id}/checkin`, { body: {} }), 'Farmer checked in and added to the live queue.')
    if (r) { setFound(null); setToken(''); setRefresh(refresh + 1) }
  }
  async function missed(id: string) { if (!confirm('Mark this booking as missed?')) return; if (await act.run(() => api(`bookings/${id}/missed`, { body: {} }), 'Marked as missed.')) setRefresh(refresh + 1) }
  return <div className="page-content narrow"><div className="page-heading"><div><p className="eyebrow green-text">ARRIVAL DESK</p><h1>Verify token & check in</h1><p className="muted">Verify the farmer’s digital token, then add them to the live queue.</p></div>{picker}</div>
    <Alert onClose={() => act.setError('')}>{act.error}</Alert><Alert kind="success" onClose={() => act.setOk('')}>{act.ok}</Alert>
    <section className="panel panel-pad"><form onSubmit={verify} style={{ display: 'flex', gap: 10, alignItems: 'flex-end' }}><div style={{ flex: 1 }}><Field label="Token number"><input value={token} onChange={(e) => setToken(e.target.value.toUpperCase())} placeholder="A-007" style={{ fontSize: 20, fontWeight: 800, letterSpacing: 1 }} autoFocus /></Field></div><button className="primary-btn" style={{ marginBottom: 14 }} disabled={act.busy}><ScanLine size={16} />Verify</button></form>
      {found && <div className="token-card" style={{ textAlign: 'left' }}><div style={{ display: 'flex', justifyContent: 'space-between' }}><div><p className="eyebrow">TOKEN VERIFIED</p><div className="token-big" style={{ fontSize: 34 }}>{found.token}</div></div><Status>{found.status}</Status></div>
        <div className="kv"><div><span>Farmer</span><strong>{found.farmerName}</strong></div><div><span>Phone</span><strong>{found.farmerPhone}</strong></div><div><span>Crop</span><strong>{found.cropName} · {fmtKg(found.estimatedKg)}</strong></div><div><span>Slot</span><strong>{fmtSlot(found.slot)}</strong></div></div>
        <div className="job-actions"><button className="primary-btn" disabled={act.busy || found.status !== 'Booked'} onClick={() => checkIn(found.id)}>{found.status === 'Booked' ? 'Check in farmer' : `Already ${found.status}`}</button><button className="outline-btn" onClick={() => setFound(null)}>Dismiss</button></div></div>}</section>
    <section className="panel table-panel" key={refresh} style={{ marginTop: 16 }}><div className="panel-head"><div><p className="eyebrow">EXPECTED</p><h3>Booked, not yet arrived</h3></div></div><div className="table-scroll">{!today ? <Loading /> : !today.length ? <Empty title="No pending arrivals" /> : <table><thead><tr><th>Token</th><th>Farmer</th><th>Crop</th><th>Slot</th><th /></tr></thead><tbody>{today.map((b) => <tr key={b.id}><td><strong className="token-text">{b.token}</strong></td><td><strong>{b.farmerName}</strong><small>{b.farmerPhone}</small></td><td>{b.cropName} · {fmtKg(b.estimatedKg)}</td><td>{fmtSlot(b.slot)}</td><td style={{ whiteSpace: 'nowrap' }}><button className="btn-sm solid" onClick={() => checkIn(b.id)} disabled={act.busy}>Check in</button> <button className="btn-sm danger" onClick={() => missed(b.id)} disabled={act.busy}>Missed</button></td></tr>)}</tbody></table>}</div></section></div>
}

export function Operations({ user }: { user: any }) {
  const { centerId, picker } = useCenter(user)
  const { data: meta } = useFetch<any>('meta')
  const { data: q, error, reload } = useFetch<any>(centerId && meta ? `queue?centerId=${centerId}&date=${meta.today}` : null, 5000)
  const act = useAction()
  const [weigh, setWeigh] = useState<any>(null); const [gross, setGross] = useState(''); const [empty, setEmpty] = useState('')
  const [delay, setDelay] = useState<any>(null); const [reason, setReason] = useState(''); const [open, setOpen] = useState<string | null>(null)
  const post = async (id: string, a: string, body: any = {}, ok?: string) => { const r = await act.run(() => api(`bookings/${id}/${a}`, { body }), ok); if (r) reload(); return r }
  const net = Math.max(0, Number(gross) - Number(empty))
  const card = (b: any, children: React.ReactNode) => <div key={b.id} className={`job ${b.delayed ? 'delayed' : ''}`}><div className="job-top"><b>{b.token}</b><div style={{ display: 'flex', gap: 4 }}><Status>{b.status}</Status>{b.delayed && <Status>Delayed</Status>}</div></div><p><strong>{b.farmerName}</strong> · {b.cropName} · {fmtKg(b.procurement?.netKg ?? b.estimatedKg)}</p><small>{b.station ? `Station ${b.station} · ` : ''}{fmtSlot(b.slot)}{b.delayReason ? ` · ${b.delayReason}` : ''}</small><div className="job-actions">{children}<button className="btn-sm" onClick={() => setOpen(b.id)}>Details</button>{!b.delayed ? <button className="btn-sm warn" onClick={() => { setDelay(b); setReason('') }}><TriangleAlert size={12} />Delay</button> : <button className="btn-sm" onClick={() => post(b.id, 'delay', { delayed: false })}>Clear delay</button>}</div></div>
  return <div className="page-content"><div className="page-heading"><div><div className="live-pill dark"><span />LIVE OPERATIONS</div><h1>Queue & processing</h1><p className="muted">{q ? `${q.center.name} · ${q.center.weighingStations} weighing stations · avg. cycle ${q.avgCycleMin} min` : ''}</p></div>{picker}</div>
    <Alert onClose={() => act.setError('')}>{error || act.error}</Alert><Alert kind="success" onClose={() => act.setOk('')}>{act.ok}</Alert>
    {!q ? <Loading /> : <div className="board">
      <section className="lane"><div className="lane-head">Waiting queue <span>{q.waiting.length}</span></div>
        {!q.waiting.length && <Empty title="Queue is empty" note={`${q.bookedCount} still to arrive`} />}
        {q.waiting.map((b: any, i: number) => card(b, <><button className="btn-sm solid" disabled={act.busy} onClick={() => post(b.id, 'call', {}, `${b.token} called for weighing.`)}><Scale size={13} />Call to weigh</button><button className="btn-sm" disabled={i === 0 || act.busy} onClick={() => post(b.id, 'move', { direction: 'up' })} aria-label="Move up"><ArrowUp size={13} /></button><button className="btn-sm" disabled={i === q.waiting.length - 1 || act.busy} onClick={() => post(b.id, 'move', { direction: 'down' })} aria-label="Move down"><ArrowDown size={13} /></button></>))}</section>
      <section className="lane"><div className="lane-head">In process <span>{q.processing.length}</span></div>
        {!q.processing.length && <Empty title="No active vehicles" />}
        {q.processing.map((b: any) => card(b, <>
          {b.status === 'Weighing' && <button className="btn-sm solid" onClick={() => { setWeigh(b); setGross(''); setEmpty('') }}><Scale size={13} />Record weight</button>}
          {b.status === 'Quality Check' && <span className="muted" style={{ fontSize: 12 }}>Waiting for inspector…</span>}
          {b.status === 'Unloading' && <button className="btn-sm solid" disabled={act.busy} onClick={() => post(b.id, 'unload', {}, `${b.token} unloaded — receipt generated.`)}><PackageCheck size={13} />Confirm unloading</button>}</>))}</section>
      <section className="lane"><div className="lane-head">Payment & completion <span>{q.recentlyDone.length}</span></div>
        {!q.recentlyDone.length && <Empty title="Nothing yet today" />}
        {q.recentlyDone.map((b: any) => card(b, <>
          {b.status === 'Payment Pending' && <><span style={{ fontSize: 12 }}><b>{fmtMoney(b.procurement?.totalAmount)}</b></span><button className="btn-sm solid" disabled={act.busy} onClick={() => post(b.id, 'complete', {}, `${b.token} completed — payment recorded.`)}><ShieldCheck size={13} />Complete procurement</button></>}
          {b.procurement?.receiptNo && <button className="btn-sm" onClick={() => printReceipt(b)}><Printer size={13} />Receipt</button>}</>))}</section>
    </div>}
    {weigh && <Modal title={`Record weight · ${weigh.token}`} onClose={() => setWeigh(null)}><p className="muted" style={{ marginTop: 0 }}>{weigh.farmerName} · {weigh.cropName} · Station {weigh.station}</p>
      <Alert>{act.error}</Alert>
      <div className="grid-2"><Field label="Gross weight (kg)"><input type="number" inputMode="decimal" value={gross} onChange={(e) => setGross(e.target.value)} placeholder="5200" autoFocus /></Field><Field label="Empty vehicle weight (kg)"><input type="number" inputMode="decimal" value={empty} onChange={(e) => setEmpty(e.target.value)} placeholder="2180" /></Field></div>
      <div className="net-weight"><span>Net crop weight</span><strong>{net.toLocaleString()} <small>kg</small></strong></div>
      <button className="primary-btn full" style={{ marginTop: 14 }} disabled={act.busy || !net} onClick={async () => { if (await post(weigh.id, 'weight', { grossKg: Number(gross), emptyKg: Number(empty) }, `${weigh.token} weighed — sent to quality check.`)) setWeigh(null) }}>Save weighing record <Check size={16} /></button></Modal>}
    {delay && <Modal title={`Flag ${delay.token} as delayed`} onClose={() => setDelay(null)}><Field label="Reason (shown to the farmer)"><input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Weighing station maintenance" autoFocus /></Field><button className="primary-btn full" onClick={async () => { await post(delay.id, 'delay', { delayed: true, reason }); setDelay(null) }}>Mark as delayed</button></Modal>}
    {open && <BookingDetail id={open} user={user} onClose={() => setOpen(null)} onChanged={reload} />}
  </div>
}

export function Records({ user }: { user: any }) {
  return <div className="page-content"><div className="page-heading"><div><p className="eyebrow green-text">PROCUREMENT RECORDS</p><h1>Bookings & procurement records</h1><p className="muted">Search, filter and export every booking, weight, quality and payment record.</p></div></div><BookingsTable user={user} showFarmer exportName="procurement-records" /></div>
}
export { Zap, Truck }
