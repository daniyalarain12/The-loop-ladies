'use client'
import { useState } from 'react'
import { BarChart3, Clock3, Gauge, Plus, ShieldCheck, Users, Wheat, Pencil, Zap } from 'lucide-react'
import { api, fmtDate, fmtKg, fmtStamp, fmtTons, useFetch } from '@/lib/client/api'
import { Alert, BarChart, Empty, Field, HBars, Loading, Modal, StatCard, Status, useAction } from '../ui-kit'

export function Analytics() {
  const { data: a, error } = useFetch<any>('analytics', 20000)
  const g = a?.grades; const total = g ? g.A + g.B + g.C + g.Rejected : 0
  const pct = (n: number) => (total ? Math.round((n / total) * 100) : 0)
  const stops = g ? (() => { let acc = 0; return [['#1c6b4d', g.A], ['#7fc241', g.B], ['#f2c14e', g.C], ['#e5646a', g.Rejected]].map(([c, n]) => { const from = acc; acc += total ? ((n as number) / total) * 360 : 0; return `${c} ${from}deg ${acc}deg` }).join(',') })() : ''
  return <div className="page-content"><div className="page-heading"><div><p className="eyebrow green-text">MANAGEMENT INSIGHTS</p><h1>Procurement analytics</h1><p className="muted">Crop intake, waiting times, peak hours and quality across your centers.</p></div></div>
    <Alert>{error}</Alert>
    {!a ? <Loading /> : <>
      <div className="stats-grid"><StatCard icon={Wheat} label="Crop received (7 days)" value={fmtTons(a.weekKg)} note={`${a.farmersServed} farmers served`} tone="lime" /><StatCard icon={Gauge} label="Avg. processing time" value={`${a.avgProcessingMin} min`} note="Check-in to completion" tone="blue" /><StatCard icon={Clock3} label="Avg. waiting time" value={`${a.avgWaitMin} min`} note={`Avg. queue length ${a.avgQueueLength}`} /><StatCard icon={ShieldCheck} label="Quality acceptance" value={`${a.acceptanceRate}%`} note="Accepted vs rejected" tone="amber" /></div>
      <div className="dist">
        <section className="panel panel-pad"><div className="panel-head"><div><p className="eyebrow">THROUGHPUT</p><h3>Crop received by day (tons)</h3></div></div><BarChart data={a.byDay.map((d: any) => ({ label: fmtDate(d.date).slice(0, 6), value: Math.round(d.kg / 100) / 10 }))} unit="t" /></section>
        <section className="panel panel-pad"><div className="panel-head"><div><p className="eyebrow">PEAK HOURS</p><h3>Arrivals by hour</h3></div><Status>{a.peakHour?.arrivals ? `Peak ${a.peakHour.label}` : 'No data'}</Status></div><BarChart data={a.peak.map((p: any) => ({ label: p.label.slice(0, 2), value: p.arrivals }))} /></section>
        <section className="panel panel-pad"><div className="panel-head"><div><p className="eyebrow">QUALITY MIX</p><h3>Grade distribution</h3></div></div><div className="donut-wrap"><div className="donut2" style={{ background: total ? `conic-gradient(${stops})` : '#e8efe9' }}><div><span><strong>{a.acceptanceRate}%</strong>accepted</span></div></div><div className="legend-list">{[['Grade A', g.A, '#1c6b4d'], ['Grade B', g.B, '#7fc241'], ['Grade C', g.C, '#f2c14e'], ['Rejected', g.Rejected, '#e5646a']].map(([l, n, c]) => <div key={l as string}><i style={{ background: c as string }} /><span>{l}</span><b>{pct(n as number)}%</b></div>)}</div></div></section>
        <section className="panel panel-pad"><div className="panel-head"><div><p className="eyebrow">BY CENTER (7 DAYS)</p><h3>Crop received by center</h3></div></div><HBars data={a.byCenter.map((c: any) => ({ label: c.name, value: Math.round(c.kg / 100) / 10 }))} unit=" t" /></section>
        <section className="panel panel-pad"><div className="panel-head"><div><p className="eyebrow">BY CROP</p><h3>Most received crops</h3></div></div><HBars data={a.byCrop.map((c: any) => ({ label: c.name, value: Math.round(c.kg / 100) / 10 }))} unit=" t" /></section>
        <section className="panel panel-pad"><div className="panel-head"><div><p className="eyebrow">TREND</p><h3>Weekly procurement trend (tons)</h3></div></div><BarChart data={a.weekly.map((w: any) => ({ label: w.label, value: Math.round(w.kg / 100) / 10 }))} unit="t" /></section>
      </div>
      <div className="insight-strip"><Zap size={18} /><p><strong>Peak arrival insight:</strong> {a.peakHour?.arrivals ? `most farmers check in around ${a.peakHour.label}. Consider opening an extra weighing station then.` : 'not enough check-in data yet.'}</p></div></>}
  </div>
}

type Form = Record<string, any>
export function Centers() {
  const { data: meta, reload } = useFetch<any>('meta')
  const [edit, setEdit] = useState<Form | null>(null); const act = useAction()
  const set = (k: string) => (e: any) => setEdit({ ...edit, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value })
  const save = async () => { const r = await act.run(() => api(`admin/centers${edit!.id ? '/' + edit!.id : ''}`, { method: edit!.id ? 'PATCH' : 'POST', body: edit })); if (r) { setEdit(null); reload() } }
  return <div className="page-content"><div className="page-heading"><div><p className="eyebrow green-text">ADMINISTRATION</p><h1>Procurement centers</h1><p className="muted">Set daily capacity, weighing stations and slot limits.</p></div><button className="primary-btn" onClick={() => { setEdit({ name: '', location: '', dailyCapacityKg: 20000, weighingStations: 2, unloadingPoints: 2, slotCapacity: 5, open: true }); act.setError('') }}><Plus size={16} />Add center</button></div>
    {!meta ? <Loading /> : <div className="panel table-panel"><div className="table-scroll"><table><thead><tr><th>Center</th><th>Daily capacity</th><th>Stations</th><th>Unloading</th><th>Per slot</th><th>Status</th><th /></tr></thead><tbody>{meta.centers.map((c: any) => <tr key={c.id}><td><strong>{c.name}</strong><small>{c.location} · token prefix {c.prefix}</small></td><td>{fmtKg(c.dailyCapacityKg)}</td><td>{c.weighingStations}</td><td>{c.unloadingPoints}</td><td>{c.slotCapacity} bookings</td><td><Status>{c.open ? 'Active' : 'Closed'}</Status></td><td><button className="btn-sm" onClick={() => { setEdit({ ...c }); act.setError('') }}><Pencil size={12} />Edit</button></td></tr>)}</tbody></table></div></div>}
    {edit && <Modal title={edit.id ? 'Edit center' : 'New center'} onClose={() => setEdit(null)}><Alert>{act.error}</Alert>
      <Field label="Center name"><input value={edit.name} onChange={set('name')} /></Field><Field label="Location"><input value={edit.location} onChange={set('location')} /></Field>
      <div className="grid-2"><Field label="Daily capacity (kg)"><input type="number" value={edit.dailyCapacityKg} onChange={set('dailyCapacityKg')} /></Field><Field label="Bookings per slot"><input type="number" value={edit.slotCapacity} onChange={set('slotCapacity')} /></Field><Field label="Weighing stations"><input type="number" value={edit.weighingStations} onChange={set('weighingStations')} /></Field><Field label="Unloading points"><input type="number" value={edit.unloadingPoints} onChange={set('unloadingPoints')} /></Field></div>
      <label className="field" style={{ flexDirection: 'row', alignItems: 'center', display: 'flex', gap: 8 }}><input type="checkbox" style={{ width: 'auto' }} checked={edit.open !== false} onChange={set('open')} />Open for bookings</label>
      <button className="primary-btn full" disabled={act.busy} onClick={save}>{act.busy ? 'Saving…' : 'Save center'}</button></Modal>}
  </div>
}

export function Crops() {
  const { data: meta, reload } = useFetch<any>('meta')
  const [edit, setEdit] = useState<Form | null>(null); const act = useAction()
  const save = async () => { const r = await act.run(() => api(`admin/crops${edit!.id ? '/' + edit!.id : ''}`, { method: edit!.id ? 'PATCH' : 'POST', body: edit })); if (r) { setEdit(null); reload() } }
  return <div className="page-content narrow"><div className="page-heading"><div><p className="eyebrow green-text">ADMINISTRATION</p><h1>Crop categories & prices</h1><p className="muted">Price per kg is used to calculate the payment amount (grade B −5%, grade C −10%).</p></div><button className="primary-btn" onClick={() => { setEdit({ name: '', pricePerKg: '', active: true }); act.setError('') }}><Plus size={16} />Add crop</button></div>
    {!meta ? <Loading /> : <div className="panel table-panel"><div className="table-scroll"><table><thead><tr><th>Crop</th><th>Price / kg</th><th>Status</th><th /></tr></thead><tbody>{meta.crops.map((c: any) => <tr key={c.id}><td><strong>{c.name}</strong></td><td>PKR {c.pricePerKg}</td><td><Status>{c.active ? 'Active' : 'Suspended'}</Status></td><td><button className="btn-sm" onClick={() => { setEdit({ ...c }); act.setError('') }}><Pencil size={12} />Edit</button></td></tr>)}</tbody></table></div></div>}
    {edit && <Modal title={edit.id ? 'Edit crop' : 'New crop'} onClose={() => setEdit(null)}><Alert>{act.error}</Alert><Field label="Crop name"><input value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} /></Field><Field label="Price per kg (PKR)"><input type="number" value={edit.pricePerKg} onChange={(e) => setEdit({ ...edit, pricePerKg: e.target.value })} /></Field>
      {edit.id && <label className="field" style={{ flexDirection: 'row', alignItems: 'center', display: 'flex', gap: 8 }}><input type="checkbox" style={{ width: 'auto' }} checked={edit.active !== false} onChange={(e) => setEdit({ ...edit, active: e.target.checked })} />Available for booking</label>}
      <button className="primary-btn full" disabled={act.busy} onClick={save}>Save crop</button></Modal>}
  </div>
}

export function UsersView({ me }: { me: any }) {
  const { data, error, reload } = useFetch<any[]>('admin/users')
  const { data: meta } = useFetch<any>('meta')
  const [tab, setTab] = useState('farmer'); const [add, setAdd] = useState<Form | null>(null); const [q, setQ] = useState('')
  const act = useAction()
  const rows = (data ?? []).filter((u) => (tab === 'farmer' ? u.role === 'farmer' : u.role !== 'farmer') && `${u.name} ${u.phone} ${u.login}`.toLowerCase().includes(q.toLowerCase()))
  const toggle = async (u: any) => { if (await act.run(() => api(`admin/users/${u.id}`, { method: 'PATCH', body: { active: !u.active } }))) reload() }
  const create = async () => { const r = await act.run(() => api('admin/users', { body: add })); if (r) { setAdd(null); reload() } }
  return <div className="page-content"><div className="page-heading"><div><p className="eyebrow green-text">ADMINISTRATION</p><h1>Farmers & staff</h1><p className="muted">Manage registered farmers, procurement staff and quality inspectors.</p></div><button className="primary-btn" onClick={() => { setAdd({ role: 'staff', name: '', login: '', password: '', centerId: meta?.centers[0]?.id }); act.setError('') }}><Plus size={16} />Add staff / inspector</button></div>
    <Alert>{error || act.error}</Alert>
    <div className="toolbar"><div className="tab-row" style={{ margin: 0, minWidth: 260 }}><button className={tab === 'farmer' ? 'on' : ''} onClick={() => setTab('farmer')}>Farmers</button><button className={tab === 'staff' ? 'on' : ''} onClick={() => setTab('staff')}>Staff & inspectors</button></div><div className="search wide grow"><input placeholder="Search name, phone or username" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search users" style={{ border: 0, outline: 0, background: 'transparent', width: '100%' }} /></div></div>
    {!data ? <Loading /> : <div className="panel table-panel"><div className="table-scroll">{!rows.length ? <Empty title="No users found" /> : <table><thead><tr><th>Name</th><th>{tab === 'farmer' ? 'Phone · location' : 'Username · center'}</th><th>{tab === 'farmer' ? 'Bookings' : 'Role'}</th><th>Status</th><th /></tr></thead><tbody>{rows.map((u) => <tr key={u.id}><td><strong>{u.name}</strong>{tab === 'farmer' && <small>ID {u.identification}</small>}</td><td>{tab === 'farmer' ? <>{u.phone}<small>{u.location}</small></> : <>{u.login}<small>{meta?.centers.find((c: any) => c.id === u.centerId)?.name ?? 'All centers'}</small></>}</td><td>{tab === 'farmer' ? u.bookings : <span className="role-tag">{u.role}</span>}</td><td><Status>{u.active ? 'Active' : 'Suspended'}</Status></td><td>{u.id !== me.id && <button className={`btn-sm ${u.active ? 'danger' : 'solid'}`} onClick={() => toggle(u)} disabled={act.busy}>{u.active ? 'Suspend' : 'Activate'}</button>}</td></tr>)}</tbody></table>}</div></div>}
    {add && <Modal title="New staff / inspector account" onClose={() => setAdd(null)}><Alert>{act.error}</Alert>
      <Field label="Role"><select value={add.role} onChange={(e) => setAdd({ ...add, role: e.target.value })}><option value="staff">Procurement center staff</option><option value="inspector">Quality inspector</option></select></Field>
      <Field label="Full name"><input value={add.name} onChange={(e) => setAdd({ ...add, name: e.target.value })} /></Field>
      <div className="grid-2"><Field label="Username"><input value={add.login} onChange={(e) => setAdd({ ...add, login: e.target.value })} /></Field><Field label="Password"><input type="password" value={add.password} onChange={(e) => setAdd({ ...add, password: e.target.value })} /></Field></div>
      <Field label="Assigned center"><select value={add.centerId} onChange={(e) => setAdd({ ...add, centerId: e.target.value })}>{meta?.centers.map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></Field>
      <button className="primary-btn full" disabled={act.busy} onClick={create}>Create account</button></Modal>}
  </div>
}

export function Logs() {
  const { data, error } = useFetch<any[]>('admin/logs', 15000)
  const act = useAction()
  return <div className="page-content"><div className="page-heading"><div><p className="eyebrow green-text">AUDIT TRAIL</p><h1>Activity logs</h1><p className="muted">Every sign-in, booking and procurement action, newest first.</p></div>
    <button className="outline-btn" disabled={act.busy} onClick={async () => { if (confirm('Reset ALL data back to the demo dataset? This cannot be undone.')) { if (await act.run(() => api('admin/reset', { body: {} }))) location.reload() } }}>Reset demo data</button></div>
    <Alert>{error || act.error}</Alert>
    <div className="panel panel-pad">{!data ? <Loading /> : !data.length ? <Empty title="No activity yet" /> : data.map((l) => <div className="log-row" key={l.id}><span className="muted">{fmtStamp(l.at)}</span><span><b>{l.actorName}</b> <span className="role-tag">{l.role}</span></span><code>{l.action}</code><span>{l.detail}</span></div>)}</div></div>
}
export { BarChart3, Users }
