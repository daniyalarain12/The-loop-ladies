'use client'
import { useMemo, useState } from 'react'
import { Download, Printer, Search, CircleX } from 'lucide-react'
import { api, downloadCsv, fmtDate, fmtKg, fmtMoney, fmtSlot, fmtStamp, printReceipt, useFetch } from '@/lib/client/api'
import { Alert, Empty, Loading, Modal, Status, useAction } from './ui-kit'

export const isOpen = (s: string) => !['Completed', 'Cancelled', 'Missed', 'Rejected'].includes(s)
const payOf = (b: any) => b.procurement?.paymentStatus ?? (['Cancelled', 'Missed', 'Rejected'].includes(b.status) ? 'Not applicable' : 'Pending')

export function BookingDetail({ id, user, onClose, onChanged }: { id: string; user: any; onClose: () => void; onChanged?: () => void }) {
  const { data: b, error, reload } = useFetch<any>(`bookings/${id}`)
  const act = useAction()
  if (!b) return <Modal title="Booking details" onClose={onClose}>{error ? <Alert>{error}</Alert> : <Loading />}</Modal>
  const p = b.procurement
  return <Modal title={`Booking ${b.token}`} onClose={onClose} wide>
    <Alert onClose={() => act.setError('')}>{act.error}</Alert>
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}><Status>{b.status}</Status>{b.delayed && <Status>Delayed</Status>}<Status>{payOf(b)}</Status>{b.status === 'Waiting' && <span className="muted">Position #{b.position} · ~{b.etaMin} min</span>}</div>
    {b.delayed && b.delayReason && <p className="muted">Delay reason: {b.delayReason}</p>}
    <div className="kv">
      <div><span>Farmer</span><strong>{b.farmerName}</strong></div><div><span>Center</span><strong>{b.centerName}</strong></div>
      <div><span>Crop</span><strong>{b.cropName}</strong></div><div><span>Estimated quantity</span><strong>{fmtKg(b.estimatedKg)}</strong></div>
      <div><span>Date</span><strong>{fmtDate(b.date)}</strong></div><div><span>Time slot</span><strong>{fmtSlot(b.slot)}</strong></div>
      {p?.netKg !== undefined && <><div><span>Gross / empty</span><strong>{fmtKg(p.grossKg)} / {fmtKg(p.emptyKg)}</strong></div><div><span>Net crop weight</span><strong>{fmtKg(p.netKg)}</strong></div></>}
      {p?.inspectedAt && <><div><span>Quality</span><strong>{p.accepted ? `Grade ${p.grade} · Accepted` : 'Rejected'}</strong></div><div><span>Moisture · damaged · foreign</span><strong>{p.moisture}% · {p.damagedPct}% · {p.foreignMaterial}%</strong></div></>}
      {p?.remarks && <div style={{ gridColumn: '1/-1' }}><span>Inspector remarks</span><strong>{p.remarks}</strong></div>}
      {p?.totalAmount !== undefined && <><div><span>Amount</span><strong>{fmtMoney(p.totalAmount)}</strong></div><div><span>Receipt</span><strong>{p.receiptNo}</strong></div></>}
    </div>
    <h4 style={{ margin: '18px 0 6px' }}>Status timeline</h4>
    <ul className="hist">{b.history.map((h: any, i: number) => <li key={i}><i /><span><b>{h.status}</b> <span className="muted">· {h.by}</span></span><small>{fmtStamp(h.at)}</small></li>)}</ul>
    <div className="job-actions" style={{ marginTop: 18 }}>
      {p?.receiptNo && <button className="outline-btn" onClick={() => printReceipt(b)}><Printer size={15} />Print receipt</button>}
      {b.status === 'Booked' && (user.role === 'farmer' || user.role === 'admin') && <button className="btn-sm danger" disabled={act.busy} onClick={async () => { if (!confirm('Cancel this booking?')) return; const r = await act.run(() => api(`bookings/${b.id}/cancel`, { method: 'POST', body: {} })); if (r) { reload(); onChanged?.() } }}><CircleX size={14} />Cancel booking</button>}
    </div>
  </Modal>
}

/** Searchable / filterable bookings table used by farmer history, staff records and admin reports. */
export function BookingsTable({ user, fixed = {}, showFarmer, exportName = 'bookings' }: { user: any; fixed?: Record<string, string>; showFarmer?: boolean; exportName?: string }) {
  const [q, setQ] = useState(''); const [status, setStatus] = useState(''); const [crop, setCrop] = useState(''); const [centerId, setCenter] = useState(''); const [date, setDate] = useState(''); const [payment, setPayment] = useState('')
  const [open, setOpen] = useState<string | null>(null)
  const { data: meta } = useFetch<any>('meta')
  const qs = new URLSearchParams({ ...fixed, ...(q && { q }), ...(status && { status }), ...(crop && { crop }), ...(centerId && { centerId }), ...(date && { date }), ...(payment && { payment }) }).toString()
  const { data: rows, error, loading, reload } = useFetch<any[]>(`bookings?${qs}`, 15000)
  const statuses = ['Booked', 'Checked In', 'Waiting', 'Weighing', 'Quality Check', 'Unloading', 'Payment Pending', 'Completed', 'Cancelled', 'Missed', 'Rejected', 'Delayed']
  const exportRows = useMemo(() => (rows ?? []).map((b) => ({ Token: b.token, Farmer: b.farmerName, Crop: b.cropName, Center: b.centerName, Date: b.date, Slot: b.slot, 'Estimated kg': b.estimatedKg, 'Net kg': b.procurement?.netKg ?? '', Grade: b.procurement?.grade ?? '', Status: b.status, Payment: payOf(b), Amount: b.procurement?.totalAmount ?? '', Receipt: b.procurement?.receiptNo ?? '' })), [rows])
  return <>
    <div className="filter-row toolbar">
      <div className="search wide"><Search size={16} /><input placeholder={showFarmer ? 'Search token, farmer, crop…' : 'Search token, crop or center'} value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search bookings" /></div>
      <select value={centerId} onChange={(e) => setCenter(e.target.value)} aria-label="Center"><option value="">All centers</option>{meta?.centers.map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
      <select value={crop} onChange={(e) => setCrop(e.target.value)} aria-label="Crop"><option value="">All crops</option>{meta?.crops.map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
      <select value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Status"><option value="">All statuses</option>{statuses.map((s) => <option key={s}>{s}</option>)}</select>
      <select value={payment} onChange={(e) => setPayment(e.target.value)} aria-label="Payment status"><option value="">All payments</option><option>Pending</option><option>Paid</option><option>Not applicable</option></select>
      <input type="date" value={date} onChange={(e) => setDate(e.target.value)} aria-label="Booking date" />
      {(q || status || crop || centerId || date || payment) && <button className="btn-sm" onClick={() => { setQ(''); setStatus(''); setCrop(''); setCenter(''); setDate(''); setPayment('') }}>Clear</button>}
      <button className="primary-btn" onClick={() => downloadCsv(`${exportName}.csv`, exportRows)} disabled={!exportRows.length}><Download size={16} />Export CSV</button>
    </div>
    <Alert>{error}</Alert>
    <div className="panel table-panel"><div className="table-scroll">
      {loading && !rows ? <Loading /> : !rows?.length ? <Empty title="No bookings found" note="Try changing the filters." /> :
        <table><thead><tr><th>Token</th>{showFarmer && <th>Farmer</th>}<th>Crop & center</th><th>Date & time</th><th>Quantity</th><th>Status</th><th>Payment</th></tr></thead>
          <tbody>{rows.map((b) => <tr key={b.id} className="link-row" onClick={() => setOpen(b.id)}>
            <td><strong className="token-text">{b.token}</strong></td>{showFarmer && <td><strong>{b.farmerName}</strong><small>{b.farmerPhone}</small></td>}
            <td><strong>{b.cropName}</strong><small>{b.centerName}</small></td><td><strong>{fmtDate(b.date)}</strong><small>{fmtSlot(b.slot)}</small></td>
            <td>{b.procurement?.netKg ? <><strong>{fmtKg(b.procurement.netKg)}</strong><small>est. {fmtKg(b.estimatedKg)}</small></> : fmtKg(b.estimatedKg)}</td>
            <td><Status>{b.status}</Status>{b.delayed && isOpen(b.status) && <> <Status>Delayed</Status></>}</td><td><Status>{payOf(b)}</Status></td></tr>)}</tbody></table>}
    </div></div>
    {open && <BookingDetail id={open} user={user} onClose={() => setOpen(null)} onChanged={reload} />}
  </>
}
