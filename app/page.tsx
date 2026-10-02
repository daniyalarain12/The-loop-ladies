'use client'

import { useCallback, useEffect, useState } from 'react'
import { Activity, BarChart3, Bell, CalendarDays, ChevronRight, ClipboardCheck, Gauge, LogOut, Menu, PackageCheck, ScanLine, ShieldCheck, Sprout, Users, Wheat, X, ScrollText, Building2 } from 'lucide-react'
import { api } from '@/lib/client/api'
import { AuthScreen } from '@/components/auth-screen'
import { Loading } from '@/components/ui-kit'
import { BookingFlow, FarmerOverview, LiveQueue, MyBookings, NotificationsView } from '@/components/views/farmer'
import { CheckInView, Operations, Records, StaffDashboard } from '@/components/views/staff'
import { Inspections } from '@/components/views/inspector'
import { Analytics, Centers, Crops, Logs, UsersView } from '@/components/views/admin'

type NavItem = { label: string; icon: any }
const NAV: Record<string, NavItem[]> = {
  farmer: [{ label: 'Overview', icon: Activity }, { label: 'Book slot', icon: CalendarDays }, { label: 'Live queue', icon: Gauge }, { label: 'My bookings', icon: ClipboardCheck }, { label: 'Notifications', icon: Bell }],
  staff: [{ label: 'Dashboard', icon: Activity }, { label: 'Check-in', icon: ScanLine }, { label: 'Queue & processing', icon: PackageCheck }, { label: 'Records', icon: ClipboardCheck }, { label: 'Notifications', icon: Bell }],
  inspector: [{ label: 'Inspections', icon: ShieldCheck }, { label: 'Notifications', icon: Bell }],
  admin: [{ label: 'Dashboard', icon: Activity }, { label: 'Analytics', icon: BarChart3 }, { label: 'Queue monitor', icon: Gauge }, { label: 'Bookings', icon: ClipboardCheck }, { label: 'Centers', icon: Building2 }, { label: 'Crops & prices', icon: Wheat }, { label: 'Farmers & staff', icon: Users }, { label: 'Activity logs', icon: ScrollText }, { label: 'Notifications', icon: Bell }],
}
const ROLE_LABEL: Record<string, string> = { farmer: 'Farmer account', staff: 'Procurement staff', inspector: 'Quality inspector', admin: 'Administrator' }
const initials = (n: string) => n.split(' ').map((p) => p[0]).slice(0, 2).join('').toUpperCase()

export default function Page() {
  const [user, setUser] = useState<any>(undefined) // undefined = checking
  const [view, setView] = useState('')
  const [mobileOpen, setMobileOpen] = useState(false)
  const [unread, setUnread] = useState(0)

  useEffect(() => { api('auth/me').then((r) => setUser(r.user)).catch(() => setUser(null)) }, [])
  useEffect(() => { const h = () => { setUser(null); setView('') }; window.addEventListener('aq-unauth', h); return () => window.removeEventListener('aq-unauth', h) }, [])
  useEffect(() => { if (user && !view) setView(NAV[user.role][0].label) }, [user, view])

  const pollUnread = useCallback(() => { if (user) api('notifications').then((r) => setUnread(r.unread)).catch(() => {}) }, [user])
  useEffect(() => { pollUnread(); const t = setInterval(pollUnread, 20000); return () => clearInterval(t) }, [pollUnread])
  useEffect(() => { if (view === 'Notifications') setTimeout(pollUnread, 1500) }, [view, pollUnread])

  async function logout() { try { await api('auth/logout', { method: 'POST', body: {} }) } catch { /* ignore */ } setUser(null); setView(''); setUnread(0) }

  if (user === undefined) return <div className="app-shell" style={{ placeItems: 'center' }}><Loading text="Loading AgriQueue…" /></div>
  if (!user) return <AuthScreen onAuth={(u) => { setUser(u); setView('') }} />

  const nav = NAV[user.role]
  const go = (v: string) => { setView(v); setMobileOpen(false); window.scrollTo({ top: 0 }) }
  const screen = (() => {
    switch (`${user.role}:${view}`) {
      case 'farmer:Overview': return <FarmerOverview user={user} setView={go} />
      case 'farmer:Book slot': return <BookingFlow onDone={go} />
      case 'farmer:Live queue': return <LiveQueue user={user} setView={go} />
      case 'farmer:My bookings': return <MyBookings user={user} />
      case 'staff:Dashboard': case 'admin:Dashboard': return <StaffDashboard user={user} />
      case 'staff:Check-in': return <CheckInView user={user} />
      case 'staff:Queue & processing': case 'admin:Queue monitor': return <Operations user={user} />
      case 'staff:Records': case 'admin:Bookings': return <Records user={user} />
      case 'inspector:Inspections': return <Inspections />
      case 'admin:Analytics': return <Analytics />
      case 'admin:Centers': return <Centers />
      case 'admin:Crops & prices': return <Crops />
      case 'admin:Farmers & staff': return <UsersView me={user} />
      case 'admin:Activity logs': return <Logs />
      default: return view === 'Notifications' ? <NotificationsView /> : <Loading />
    }
  })()

  return <div className="app-shell">
    <aside className={`sidebar ${mobileOpen ? 'mobile-open' : ''}`}>
      <div className="brand"><span className="brand-mark"><Sprout size={21} /></span><span>Agri<span>Queue</span></span><button className="close-mobile" onClick={() => setMobileOpen(false)} aria-label="Close menu"><X size={18} /></button></div>
      <div className="workspace"><div className="avatar">{initials(user.name)}</div><div><strong>{user.name}</strong><small>{ROLE_LABEL[user.role]}</small></div></div>
      <p className="side-label">Workspace</p>
      <nav>{nav.map(({ label, icon: Icon }) => <button key={label} className={view === label ? 'active' : ''} onClick={() => go(label)}><Icon size={18} />{label}{label === 'Live queue' && <span className="nav-pulse" />}{label === 'Notifications' && unread > 0 && <span className="nav-badge">{unread}</span>}</button>)}</nav>
      <div className="side-bottom"><button onClick={logout}><LogOut size={17} />Sign out</button></div>
    </aside>
    <div className="main-shell">
      <header className="topbar"><button className="menu-btn" onClick={() => setMobileOpen(true)} aria-label="Open menu"><Menu size={20} /></button>
        <div className="breadcrumb"><span>{ROLE_LABEL[user.role]}</span><ChevronRight size={14} /><strong>{view}</strong></div>
        <div className="top-actions"><button className="icon-btn notification" onClick={() => go('Notifications')} aria-label={`Notifications${unread ? ` (${unread} unread)` : ''}`}><Bell size={18} />{unread > 0 && <span />}</button>
          <button className="profile-chip" onClick={logout} title="Sign out"><span className="avatar small">{initials(user.name)}</span><span className="hide-mobile">{user.name}</span><LogOut size={14} /></button></div></header>
      <main>{screen}</main>
    </div>
  </div>
}
