'use client'
import { useState } from 'react'
import { Sprout, ArrowRight } from 'lucide-react'
import { api } from '@/lib/client/api'
import { Alert, Field, useAction } from './ui-kit'

const DEMOS = [
  { label: 'Farmer', login: '03001234567', password: 'farmer123' },
  { label: 'Procurement staff', login: 'staff', password: 'staff123' },
  { label: 'Quality inspector', login: 'inspector', password: 'inspect123' },
  { label: 'Administrator', login: 'admin', password: 'admin123' },
]

export function AuthScreen({ onAuth }: { onAuth: (u: any) => void }) {
  const [mode, setMode] = useState<'login' | 'register'>('login')
  const [f, setF] = useState({ login: '', password: '', name: '', phone: '', location: '', identification: '' })
  const { busy, error, run, setError } = useAction()
  const set = (k: string) => (e: any) => setF({ ...f, [k]: e.target.value })

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (mode === 'login' && (!f.login.trim() || !f.password)) return setError('Enter your phone/username and password.')
    const r = await run(() => api(mode === 'login' ? 'auth/login' : 'auth/register', { body: mode === 'login' ? { login: f.login, password: f.password } : { name: f.name, phone: f.phone, location: f.location, identification: f.identification, password: f.password } }))
    if (r) onAuth(r.user)
  }
  async function demo(d: (typeof DEMOS)[number]) {
    const r = await run(() => api('auth/login', { body: { login: d.login, password: d.password } }))
    if (r) onAuth(r.user)
  }

  return <div className="auth-wrap">
    <section className="auth-hero">
      <div className="brand" style={{ color: '#fff', padding: 0 }}><span className="brand-mark"><Sprout size={21} /></span><span>Agri<span style={{ color: '#d8f36b' }}>Queue</span></span></div>
      <div><h1>Book your slot. Skip the waiting line.</h1><p>A digital queue for farmers and procurement centers — from slot booking and weighing to quality checks, receipts and payments.</p></div>
      <div className="auth-flow">{['Register', 'Book slot', 'Digital token', 'Check-in', 'Weighing', 'Quality check', 'Unloading', 'Payment'].map((s) => <span key={s}>{s}</span>)}</div>
      <img src="/agri-hero.png" alt="" />
    </section>
    <section className="auth-panel"><div className="auth-card">
      <h2>{mode === 'login' ? 'Welcome back' : 'Create farmer account'}</h2>
      <p className="muted" style={{ margin: 0 }}>{mode === 'login' ? 'Sign in to your AgriQueue workspace.' : 'Register once, then book procurement slots in seconds.'}</p>
      <div className="tab-row"><button className={mode === 'login' ? 'on' : ''} onClick={() => { setMode('login'); setError('') }}>Sign in</button><button className={mode === 'register' ? 'on' : ''} onClick={() => { setMode('register'); setError('') }}>Register as farmer</button></div>
      <Alert onClose={() => setError('')}>{error}</Alert>
      <form onSubmit={submit} noValidate>
        {mode === 'register' && <>
          <Field label="Full name"><input value={f.name} onChange={set('name')} autoComplete="name" placeholder="Ahmed Khan" /></Field>
          <div className="grid-2"><Field label="Phone"><input value={f.phone} onChange={set('phone')} inputMode="tel" autoComplete="tel" placeholder="03001234567" /></Field><Field label="Location / village"><input value={f.location} onChange={set('location')} placeholder="Thatta" /></Field></div>
          <Field label="CNIC / ID number"><input value={f.identification} onChange={set('identification')} placeholder="42101-1234567-1" /></Field>
        </>}
        {mode === 'login' && <Field label="Phone number or username"><input value={f.login} onChange={set('login')} autoComplete="username" placeholder="03001234567" /></Field>}
        <Field label="Password" hint={mode === 'register' ? 'At least 6 characters' : undefined}><input type="password" value={f.password} onChange={set('password')} autoComplete={mode === 'login' ? 'current-password' : 'new-password'} /></Field>
        <button className="primary-btn" style={{ width: '100%', justifyContent: 'center' }} disabled={busy}>{busy ? 'Please wait…' : mode === 'login' ? 'Sign in' : 'Create account'} <ArrowRight size={16} /></button>
      </form>
      {mode === 'login' && <div className="demo-box"><p>Demo accounts (one click)</p><div>{DEMOS.map((d) => <button key={d.label} onClick={() => demo(d)} disabled={busy}>{d.label}</button>)}</div></div>}
    </div></section>
  </div>
}
