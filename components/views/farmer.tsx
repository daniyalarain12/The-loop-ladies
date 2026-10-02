'use client'
import { useEffect, useMemo, useState } from 'react'
import { ArrowRight, Bell, CalendarDays, Check, ChevronRight, Clock3, Droplets, FileText, Gauge, Leaf, MapPin, Sprout, Truck, Wheat, Zap, Printer } from 'lucide-react'
import { api, fmtDate, fmtKg, fmtMoney, fmtSlot, fmtStamp, printReceipt, todayIso, useFetch } from '@/lib/client/api'
import { Alert, Empty, Loading, Modal, StatCard, Status, useAction } from '../ui-kit'
import { BookingDetail, BookingsTable, isOpen } from '../shared'

const FLOW = ['Booked', 'Checked In', 'Waiting', 'Weighing', 'Quality Check', 'Unloading', 'Payment Pending', 'Completed']
const cropIcon = (n: string) => (n === 'Wheat' ? Wheat : n === 'Rice' ? Sprout : n === 'Corn' ? Leaf : n === 'Cotton' ? Droplets : Sprout)
const upcoming = (rows: any[]) => rows.filter((b) => isOpen(b.status) && b.date >= todayIso()).sort((a, b) => (a.date + a.slot).localeCompare(b.date + b.slot))[0]

export function FarmerOverview({ user, setView }: { user: any; setView: (v: string) => void }) {
  const { data: rows, error, loading } = useFetch<any[]>('bookings', 10000)
  const active = rows ? upcoming(rows) : undefined
  const { data: q } = useFetch<any>(active ? `queue?centerId=${active.centerId}&date=${active.date}` : null, 10000)
  const hour = new Date().getHours()
  const hello = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening'
  const first = user.name.split(' ')[0]
  if (loading && !rows) return <div className="page-content"><Loading /></div>
  const serving = q?.processing?.[0]?.token ?? q?.recentlyDone?.[0]?.token ?? '—'
  const reached = active ? new Set(active.history.map((h: any) => h.status)) : new Set()
  const current = active ? active.history[active.history.length - 1]?.status : ''
  const recent = (rows ?? []).filter((b) => b.id !== active?.id).slice(0, 4)
  const done = (rows ?? []).filter((b) => b.status === 'Completed')
  return <div className="page-content">
    <div className="welcome-row"><div><p className="eyebrow green-text">{new Date().toLocaleDateString('en-GB', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' }).toUpperCase()}</p><h1>{hello}, {first} <span className="sunny">✦</span></h1><p className="muted">{active ? 'Your harvest journey is moving smoothly.' : 'Ready to bring in your next harvest?'}</p></div><button className="primary-btn" onClick={() => setView('Book slot')}><CalendarDays size={17} />Book a new slot<ArrowRight size={16} /></button></div>
    <Alert>{error}</Alert>
    <div className="hero-card"><div className="hero-copy"><span className="live-pill"><span />Live system status</span><h2>Your crop, <em>our care.</em></h2><p>Book a slot, get a digital token and track the queue from home.</p><button className="light-btn" onClick={() => setView('Live queue')}>Track live queue <ArrowRight size={15} /></button></div><div className="hero-visual" aria-hidden="true"><img src="/agri-hero.png" alt="" /><div className="hero-orbit orbit-one" /><div className="hero-orbit orbit-two" /><div className="hero-float-card"><span className="hero-float-dot" />Queue moving</div></div>
      <div className="hero-metrics"><div><strong>{q ? q.waiting.length : '—'}</strong><span>Farmers waiting</span></div><div><strong>{serving}</strong><span>Now serving</span></div><div><strong>{q ? `${q.avgCycleMin} min` : '—'}</strong><span>Avg. cycle</span></div></div></div>
    <div className="stats-grid">
      <StatCard icon={CalendarDays} label="Upcoming booking" value={active ? fmtDate(active.date).slice(0, 6) : 'None'} note={active ? `${fmtSlot(active.slot)} · ${active.centerName}` : 'Book your first slot'} />
      <StatCard icon={Zap} label="Current token" value={active?.token ?? '—'} note={active?.position ? `Position ${active.position} in queue` : active?.status ?? 'No active token'} tone="lime" />
      <StatCard icon={Clock3} label="Est. waiting time" value={active?.position ? `${active.etaMin} min` : '—'} note={active?.position ? 'Based on live queue speed' : 'Starts after check-in'} tone="blue" />
      <StatCard icon={FileText} label="Payment status" value={active?.procurement?.paymentStatus ?? done[0]?.procurement?.paymentStatus ?? '—'} note={active ? 'After quality approval & unloading' : `${done.length} completed procurements`} tone="amber" />
    </div>
    <div className="section-grid">
      <section className="panel booking-panel"><div className="panel-head"><div><p className="eyebrow">NEXT UP</p><h3>Your current booking</h3></div><button className="text-btn" onClick={() => setView('My bookings')}>View all <ArrowRight size={14} /></button></div>
        {active ? <><div className="booking-main"><div className="crop-icon">{(() => { const I = cropIcon(active.cropName); return <I size={25} /> })()}</div><div className="booking-title"><h4>{active.cropName}</h4><p>Booking {active.token} · <Status>{active.status}</Status></p></div><div className="booking-location"><MapPin size={15} /><span>{active.centerName}<br /><small>{fmtDate(active.date)}</small></span></div></div>
          <div className="booking-details"><div><span>Estimated quantity</span><strong>{fmtKg(active.estimatedKg)}</strong></div><div><span>Arrival window</span><strong>{fmtSlot(active.slot)}</strong></div><div><span>Queue position</span><strong>{active.position ? `#${active.position}` : '—'}</strong></div></div>
          <button className="outline-btn full" onClick={() => setView('Live queue')}>Track live queue <ArrowRight size={15} /></button></>
          : <Empty title="No active booking" note="Book a procurement slot to receive your digital token." />}
      </section>
      <section className="panel activity-panel"><div className="panel-head"><div><p className="eyebrow">PROGRESS</p><h3>Procurement journey</h3></div></div>
        {active ? <div className="timeline">{FLOW.map((s) => { const isDone = reached.has(s) && s !== current; const isCur = s === current; return <div key={s} className={`timeline-item ${isDone ? 'done' : isCur ? 'current' : ''}`}><span>{isDone ? <Check size={13} /> : isCur ? <span className="pulse-dot" /> : <Truck size={13} />}</span><div><strong>{s}</strong><small>{isDone || isCur ? fmtStamp(active.history.find((h: any) => h.status === s)?.at) : 'Upcoming step'}</small></div></div> })}</div> : <Empty title="Nothing in progress" />}
      </section>
    </div>
    {recent.length > 0 && <section className="panel table-panel"><div className="panel-head"><div><p className="eyebrow">HISTORY</p><h3>Recent procurements</h3></div></div><div className="table-scroll"><table><thead><tr><th>Token</th><th>Crop</th><th>Date</th><th>Final weight</th><th>Status</th><th>Payment</th></tr></thead><tbody>{recent.map((b) => <tr key={b.id}><td><strong className="token-text">{b.token}</strong></td><td>{b.cropName}</td><td>{fmtDate(b.date)}</td><td>{fmtKg(b.procurement?.netKg)}</td><td><Status>{b.status}</Status></td><td><Status>{b.procurement?.paymentStatus ?? '—'}</Status></td></tr>)}</tbody></table></div></section>}
  </div>
}

export function BookingFlow({ onDone }: { onDone: (v: string) => void }) {
  const { data: meta } = useFetch<any>('meta')
  const [step, setStep] = useState(1)
  const [cropId, setCrop] = useState(''); const [qty, setQty] = useState('3000'); const [centerId, setCenter] = useState(''); const [date, setDate] = useState(''); const [slot, setSlot] = useState('')
  const [booked, setBooked] = useState<any>(null)
  const act = useAction()
  useEffect(() => { if (meta) { setCrop((c) => c || meta.crops.find((x: any) => x.active)?.id || ''); setCenter((c) => c || meta.centers.find((x: any) => x.open)?.id || ''); setDate((d) => d || meta.today) } }, [meta])
  const { data: sl, error: slErr } = useFetch<any>(centerId && date ? `slots?centerId=${centerId}&date=${date}` : null, 15000)
  useEffect(() => setSlot(''), [centerId, date])
  const crop = meta?.crops.find((c: any) => c.id === cropId); const center = meta?.centers.find((c: any) => c.id === centerId)
  const q = Number(qty)
  const qtyErr = !qty ? 'Enter the quantity.' : !Number.isFinite(q) || q < 100 ? 'Minimum quantity is 100 kg.' : q > 50000 ? 'Maximum is 50,000 kg per booking.' : sl && q > sl.availableKg ? `Only ${fmtKg(sl.availableKg)} capacity is left at this center on this date.` : ''
  const max = useMemo(() => { if (!meta) return ''; const d = new Date(meta.today + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + 14); return d.toISOString().slice(0, 10) }, [meta])
  if (!meta) return <div className="page-content narrow"><Loading /></div>

  async function confirm() {
    const r = await act.run(() => api('bookings', { body: { centerId, cropId, date, slot, estimatedKg: q } }))
    if (r) setBooked(r)
  }
  if (booked) return <div className="page-content narrow"><div className="panel form-panel"><div className="success-token"><div className="token-check"><Check size={28} /></div><p className="eyebrow green-text">BOOKING CONFIRMED</p><h2>Your digital token is ready</h2></div>
    <div className="token-card"><p className="eyebrow">YOUR TOKEN</p><div className="token-big">{booked.token}</div><p className="muted" style={{ margin: 0 }}>Show this token to the staff when you arrive.</p></div>
    <div className="summary-list" style={{ marginTop: 16 }}><div><span>Crop</span><strong>{booked.cropName} · {fmtKg(booked.estimatedKg)}</strong></div><div><span>Center</span><strong>{booked.centerName}</strong></div><div><span>Date & time</span><strong>{fmtDate(booked.date)} · {fmtSlot(booked.slot)}</strong></div></div>
    <div className="form-footer"><button className="outline-btn" onClick={() => onDone('My bookings')}>View my bookings</button><button className="primary-btn" onClick={() => onDone('Live queue')}>Track live queue <ArrowRight size={16} /></button></div></div></div>

  const canNext = step === 1 ? !!cropId && !qtyErr : step === 2 ? !!centerId && !!date && !!slot : true
  return <div className="page-content narrow">
    <div className="page-heading"><div><p className="eyebrow green-text">NEW PROCUREMENT</p><h1>Book a procurement slot</h1><p className="muted">Reserve your place before you arrive at the center.</p></div><button className="outline-btn" onClick={() => onDone('Overview')}>Cancel</button></div>
    <div className="steps">{['Crop & quantity', 'Center & time', 'Review booking'].map((label, i) => <div className={`step ${step > i + 1 ? 'done' : ''} ${step === i + 1 ? 'current' : ''}`} key={label}><span>{step > i + 1 ? <Check size={14} /> : i + 1}</span><label>{label}</label></div>)}</div>
    <div className="panel form-panel">
      <Alert onClose={() => act.setError('')}>{act.error}</Alert>
      {step === 1 && <><div className="form-section"><h3>What are you bringing?</h3><p className="muted">Select the crop you want to submit.</p><div className="crop-grid">{meta.crops.filter((c: any) => c.active).map((c: any) => { const I = cropIcon(c.name); return <button className={`crop-option ${cropId === c.id ? 'selected' : ''}`} onClick={() => setCrop(c.id)} key={c.id}><I size={24} /><strong>{c.name}</strong><small>PKR {c.pricePerKg}/kg</small>{cropId === c.id && <span className="check-circle"><Check size={12} /></span>}</button> })}</div></div>
        <div className="form-section"><label htmlFor="quantity">Estimated quantity</label><div className="input-with-unit"><input id="quantity" type="number" min={100} value={qty} onChange={(e) => setQty(e.target.value)} /><span>KG</span></div>{qtyErr ? <small style={{ color: '#a3271b' }}>{qtyErr}</small> : <small className="muted">Final weight is recorded at the weighing station.</small>}</div></>}
      {step === 2 && <><div className="form-section"><h3>Select a procurement center</h3>{meta.centers.map((c: any) => <button key={c.id} disabled={!c.open} className={`center-option ${centerId === c.id ? 'selected' : ''}`} style={{ width: '100%', textAlign: 'left', marginBottom: 10 }} onClick={() => setCenter(c.id)}><div className="center-symbol"><MapPin size={20} /></div><div><strong>{c.name}</strong><p>{c.location} · {c.weighingStations} weighing stations</p>{!c.open && <small>Closed for bookings</small>}</div>{centerId === c.id && <Check className="selected-check" size={19} />}</button>)}</div>
        <div className="form-section"><label htmlFor="bdate">Arrival date</label><div className="filter-row" style={{ margin: '8px 0 0' }}><input id="bdate" type="date" min={meta.today} max={max} value={date} onChange={(e) => setDate(e.target.value)} /></div>
          {sl && <p className="muted" style={{ margin: '10px 0 0' }}>Capacity left that day: <b>{fmtKg(sl.availableKg)}</b> of {fmtKg(sl.dailyKg)}</p>}</div>
        <div className="form-section"><h3>Choose an arrival window</h3><Alert>{slErr}</Alert>{!sl ? <Loading /> : <div className="slot-grid">{sl.slots.map((s: any) => { const off = s.full || s.past; return <button key={s.slot} disabled={off} className={`slot-option ${slot === s.slot ? 'selected' : ''} ${off ? 'disabled' : ''}`} onClick={() => setSlot(s.slot)}><strong>{fmtSlot(s.slot)}</strong><small>{s.past ? 'Passed' : s.full ? 'Full' : `${s.left}/${s.capacity} slots left`}</small></button> })}</div>}
          {qtyErr && <Alert kind="info">{qtyErr} Go back and adjust the quantity.</Alert>}</div></>}
      {step === 3 && <><div className="success-token"><div className="token-check"><Check size={28} /></div><p className="eyebrow green-text">READY TO CONFIRM</p><h2>Review your booking</h2><p className="muted">Confirming reserves capacity and generates your digital token.</p></div>
        <div className="summary-list"><div><span>Crop</span><strong>{crop?.name} · {fmtKg(q)}</strong></div><div><span>Center</span><strong>{center?.name}</strong></div><div><span>Date & time</span><strong>{fmtDate(date)} · {slot && fmtSlot(slot)}</strong></div><div><span>Indicative value</span><strong className="green-text">{fmtMoney(q * (crop?.pricePerKg ?? 0))}</strong></div></div></>}
      <div className="form-footer"><button className="outline-btn" disabled={step === 1 || act.busy} onClick={() => setStep(step - 1)}>Back</button>
        <button className="primary-btn" disabled={!canNext || act.busy} onClick={() => (step < 3 ? setStep(step + 1) : confirm())}>{act.busy ? 'Booking…' : step === 3 ? 'Confirm booking' : 'Continue'} <ArrowRight size={16} /></button></div>
    </div></div>
}

export function LiveQueue({ user, setView }: { user: any; setView: (v: string) => void }) {
  const { data: rows } = useFetch<any[]>('bookings', 5000)
  const { data: meta } = useFetch<any>('meta')
  const mine = useMemo(() => (rows ?? []).filter((b) => isOpen(b.status) && b.date >= todayIso()).sort((a, b) => (a.date + a.slot).localeCompare(b.date + b.slot)), [rows])
  const [sel, setSel] = useState('')
  const booking = mine.find((b) => b.id === sel) ?? mine.find((b) => b.date === todayIso()) ?? mine[0]
  const [watch, setWatch] = useState('')
  const centerId = booking?.centerId ?? (watch || meta?.centers?.[0]?.id)
  const date = booking?.date ?? meta?.today
  const { data: q, error } = useFetch<any>(centerId && date ? `queue?centerId=${centerId}&date=${date}` : null, 5000)
  if (!rows || !meta) return <div className="page-content"><Loading /></div>
  const me = q?.waiting.find((w: any) => w.id === booking?.id)
  const pos = me ? q.waiting.indexOf(me) + 1 : 0
  const serving = q?.processing?.[0]
  const stageNote: Record<string, string> = { Booked: 'Arrive at your slot time and show your token to staff.', 'Checked In': 'You are checked in.', Weighing: 'Move to your weighing station now.', 'Quality Check': 'Weighing done — quality inspection in progress.', Unloading: 'Quality approved — proceed to unloading.', 'Payment Pending': 'Unloading confirmed — payment is being processed.' }
  return <div className="page-content">
    <div className="page-heading"><div><div className="live-pill dark"><span />LIVE PROCUREMENT QUEUE</div><h1>{booking ? (pos === 1 ? 'You are next!' : pos ? 'Your place is moving up.' : 'Live queue') : 'Live queue'}</h1><p className="muted">{q?.center.name ?? '—'} · {date && fmtDate(date)} · auto-updates every 5 seconds</p></div>
      {mine.length > 1 && <div className="filter-row"><select value={booking?.id} onChange={(e) => setSel(e.target.value)} aria-label="Select booking">{mine.map((b) => <option key={b.id} value={b.id}>{b.token} · {b.cropName} · {fmtDate(b.date)}</option>)}</select></div>}
      {!booking && <div className="filter-row"><select value={centerId} onChange={(e) => setWatch(e.target.value)} aria-label="Center">{meta.centers.map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></div>}</div>
    <Alert>{error}</Alert>
    <div className="queue-hero"><div><p className="eyebrow">NOW SERVING</p><strong className="serving-token">{serving?.token ?? '—'}</strong><p className="muted">{serving ? `Station ${serving.station ?? '-'} · ${serving.cropName}` : 'No vehicle at the stations'}</p></div>
      <div className="queue-center"><div className="ring"><span>{booking?.status === 'Waiting' ? pos : '–'}</span><small>your<br />position</small></div></div>
      <div className="queue-details"><p className="eyebrow">YOUR TOKEN</p><strong>{booking?.token ?? '—'}</strong><span><Clock3 size={14} />Estimated wait <b>{booking?.status === 'Waiting' ? `${me?.etaMin ?? booking.etaMin} min` : '—'}</b></span></div></div>
    <div className="queue-layout">
      <section className="panel queue-panel"><div className="panel-head"><div><p className="eyebrow">QUEUE TIMELINE</p><h3>{q ? `${q.waiting.length} waiting · ${q.processing.length} in process` : 'Loading…'}</h3></div><span className="auto-update"><span />Auto-updating</span></div>
        {!q ? <Loading /> : <div className="queue-list">
          {q.processing.map((w: any) => <div className={`queue-row ${w.farmerName === user.name ? 'is-you' : ''}`} key={w.id}><span className="queue-token">{w.token}</span><div className="queue-name"><strong>{w.farmerName}</strong><small>{w.cropName}{w.station ? ` · Station ${w.station}` : ''}</small></div><Status>{w.status}</Status></div>)}
          {q.waiting.map((w: any, i: number) => <div className={`queue-row ${w.id === booking?.id ? 'is-you' : ''}`} key={w.id}><span className="queue-token">{w.token}</span><div className="queue-name"><strong>{w.id === booking?.id ? `${w.farmerName} (You)` : w.farmerName}</strong><small>#{i + 1} · {w.cropName} · ~{w.etaMin} min</small></div><Status>{w.id === booking?.id ? 'You' : 'Waiting'}</Status></div>)}
          {!q.waiting.length && !q.processing.length && <Empty title="The queue is empty" note={`${q.bookedCount} farmers are booked and yet to arrive.`} />}
        </div>}</section>
      <aside className="panel queue-aside"><div className="notice-icon"><Bell size={17} /></div><h3>{booking ? (booking.status === 'Booked' ? 'Waiting for your arrival' : booking.status) : 'No active booking'}</h3>
        <p className="muted">{booking ? stageNote[booking.status] ?? 'Keep your token ready and move toward the weighing stations when called.' : 'Book a slot to get a token and join the queue.'}</p>
        {booking && <><div className="aside-info"><span>Booked slot</span><strong>{fmtSlot(booking.slot)}</strong></div><div className="aside-info"><span>Center</span><strong>{booking.centerName}</strong></div></>}
        <button className="outline-btn full" onClick={() => setView(booking ? 'My bookings' : 'Book slot')}>{booking ? 'View booking details' : 'Book a slot'}</button></aside>
    </div></div>
}

export function MyBookings({ user }: { user: any }) {
  return <div className="page-content"><div className="page-heading"><div><p className="eyebrow green-text">PROCUREMENT RECORDS</p><h1>My bookings</h1><p className="muted">Booking and procurement history with final weight and payment records.</p></div></div><BookingsTable user={user} exportName="my-bookings" /></div>
}

export function NotificationsView() {
  const { data, error, reload } = useFetch<any>('notifications', 15000)
  const [open, setOpen] = useState<string | null>(null)
  return <div className="page-content narrow"><div className="page-heading"><div><p className="eyebrow green-text">ACTIVITY</p><h1>Notifications</h1><p className="muted">Booking, token, queue and payment updates.</p></div><button className="outline-btn" onClick={async () => { await api('notifications', { body: {} }); reload() }} disabled={!data?.unread}>Mark all as read</button></div>
    <Alert>{error}</Alert>
    <div className="panel">{!data ? <Loading /> : !data.items.length ? <Empty title="No notifications yet" /> : data.items.map((n: any) => <div key={n.id} className={`notif ${n.read ? '' : 'unread'}`} onClick={async () => { if (!n.read) { await api('notifications', { body: { id: n.id } }); reload() } }}><div className="stat-icon green"><Bell size={16} /></div><div style={{ flex: 1 }}><b>{n.title}</b><p>{n.message}</p></div><small>{fmtStamp(n.createdAt)}</small></div>)}</div></div>
}
export { Modal, BookingDetail, ChevronRight, Gauge, Printer, printReceipt }
