'use client'
import { useState } from 'react'
import { Check, CircleX } from 'lucide-react'
import { api, fmtKg, fmtSlot, fmtStamp, useFetch } from '@/lib/client/api'
import { Alert, Empty, Field, Loading, Modal, Status, useAction } from '../ui-kit'

export function Inspections() {
  const { data, error, reload } = useFetch<any>('inspections', 6000)
  const [cur, setCur] = useState<any>(null)
  const [f, setF] = useState({ grade: 'A', moisture: '', damagedPct: '', foreignMaterial: '', remarks: '' })
  const act = useAction()
  const set = (k: string) => (e: any) => setF({ ...f, [k]: e.target.value })
  async function submit(accepted: boolean) {
    const r = await act.run(() => api(`bookings/${cur.id}/inspect`, { body: { accepted, grade: accepted ? f.grade : undefined, moisture: f.moisture, damagedPct: f.damagedPct, foreignMaterial: f.foreignMaterial, remarks: f.remarks } }))
    if (r) { setCur(null); reload() }
  }
  const open = (b: any) => { setCur(b); setF({ grade: 'A', moisture: '', damagedPct: '', foreignMaterial: '', remarks: '' }); act.setError('') }
  return <div className="page-content"><div className="page-heading"><div><p className="eyebrow green-text">QUALITY INSPECTOR</p><h1>Assigned inspections</h1><p className="muted">Record grade, moisture and remarks, then approve or reject the produce.</p></div></div>
    <Alert>{error}</Alert>
    {!data ? <Loading /> : <>
      <section className="panel table-panel"><div className="panel-head"><div><p className="eyebrow">PENDING</p><h3>Awaiting quality check ({data.pending.length})</h3></div></div><div className="table-scroll">{!data.pending.length ? <Empty title="No pending inspections" note="Vehicles appear here right after weighing." /> : <table><thead><tr><th>Token</th><th>Farmer</th><th>Crop</th><th>Net weight</th><th>Center</th><th /></tr></thead><tbody>{data.pending.map((b: any) => <tr key={b.id}><td><strong className="token-text">{b.token}</strong></td><td>{b.farmerName}</td><td>{b.cropName}</td><td><strong>{fmtKg(b.procurement?.netKg)}</strong></td><td>{b.centerName}</td><td><button className="btn-sm solid" onClick={() => open(b)}>Inspect</button></td></tr>)}</tbody></table>}</div></section>
      <section className="panel table-panel" style={{ marginTop: 16 }}><div className="panel-head"><div><p className="eyebrow">HISTORY</p><h3>Recent inspections</h3></div></div><div className="table-scroll">{!data.done.length ? <Empty title="No inspections yet" /> : <table><thead><tr><th>Token</th><th>Crop</th><th>Result</th><th>Moisture</th><th>Remarks</th><th>When</th></tr></thead><tbody>{data.done.map((b: any) => <tr key={b.id}><td><strong className="token-text">{b.token}</strong><small>{b.farmerName}</small></td><td>{b.cropName}<small>{fmtKg(b.procurement.netKg)}</small></td><td>{b.procurement.accepted ? <Status>Accepted</Status> : <Status>Rejected</Status>} {b.procurement.grade && <b>Grade {b.procurement.grade}</b>}</td><td>{b.procurement.moisture}%</td><td style={{ maxWidth: 240 }}>{b.procurement.remarks || '—'}</td><td>{fmtStamp(b.procurement.inspectedAt)}</td></tr>)}</tbody></table>}</div></section></>}
    {cur && <Modal title={`Inspect ${cur.token}`} onClose={() => setCur(null)}>
      <p className="muted" style={{ marginTop: 0 }}>{cur.farmerName} · {cur.cropName} · net {fmtKg(cur.procurement?.netKg)} · {fmtSlot(cur.slot)}</p><Alert>{act.error}</Alert>
      <Field label="Quality grade"><select value={f.grade} onChange={set('grade')}><option value="A">Grade A — premium</option><option value="B">Grade B — standard (5% deduction)</option><option value="C">Grade C — fair (10% deduction)</option></select></Field>
      <div className="grid-2"><Field label="Moisture (%)"><input type="number" step="0.1" value={f.moisture} onChange={set('moisture')} placeholder="11" /></Field><Field label="Damaged (%)"><input type="number" step="0.1" value={f.damagedPct} onChange={set('damagedPct')} placeholder="1.5" /></Field></div>
      <Field label="Foreign material (%)"><input type="number" step="0.1" value={f.foreignMaterial} onChange={set('foreignMaterial')} placeholder="0.5" /></Field>
      <Field label="Inspector remarks" hint="Required when rejecting"><textarea rows={3} value={f.remarks} onChange={set('remarks')} maxLength={500} /></Field>
      <div className="job-actions"><button className="primary-btn" style={{ flex: 1, justifyContent: 'center' }} disabled={act.busy} onClick={() => submit(true)}><Check size={16} />Approve produce</button><button className="outline-btn" style={{ flex: 1, justifyContent: 'center', color: '#a3271b' }} disabled={act.busy} onClick={() => submit(false)}><CircleX size={16} />Reject</button></div></Modal>}
  </div>
}
