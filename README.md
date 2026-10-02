# AgriQueue — Agricultural Procurement & Digital Queue System

Website Link: https://the-loop-ladies.onrender.com

Full-stack Next.js app (frontend + backend API in one project) implementing the hackathon brief:
**Farmer Registration → Crop Submission → Slot Booking → Digital Token → Arrival & Check-In → Weighing → Quality Check → Unloading → Receipt / Payment → Completion.**


## Run it

```bash
pnpm install        # or: npm install
pnpm dev            # http://localhost:3000   (or: pnpm build && pnpm start)
```

No database setup is needed: demo data (2 centers, 4 crops, 10 farmers, 7 days of history, a live queue for today) is created automatically on first start in `.data/db.json`.

| Role | Login | Password |
|---|---|---|
| Farmer | `03001234567` | `farmer123` |
| Procurement staff (Main Center) | `staff` | `staff123` |
| Quality inspector (Main Center) | `inspector` | `inspect123` |
| Administrator | `admin` | `admin123` |

(The login screen also has one-click demo buttons. Admin → *Activity logs* → *Reset demo data* restores the seed.)

Optional env vars: `AUTH_SECRET` (cookie signing key — set it in production), `DATA_FILE` (path of the JSON database), `APP_TZ` (default `Asia/Karachi`).

## Feature map (brief → where it lives)

| Brief | Implementation |
|---|---|
| Farmer: account, crop details, quantity, center, date/slot, token, queue status, history, final weight & payment | `components/views/farmer.tsx` |
| Staff: today's bookings, check-in, queue order, weight, unloading, complete, receipts | `components/views/staff.tsx` |
| Inspector: assigned inspections, grade, moisture, remarks, approve/reject | `components/views/inspector.tsx` |
| Admin: farmers, centers, daily capacity, crop categories, monitor queues, reports, analytics | `components/views/admin.tsx` |
| Statuses Booked→Checked In→Waiting→Weighing→Quality Check→Unloading→Payment Pending→Completed + Cancelled / Missed / Rejected / Delayed | `lib/server/workflow.ts` (state machine; every transition is validated) |
| Capacity check + available slots, duplicate-booking prevention | `slotsFor()` / `createBooking()` in `workflow.ts` |
| Search & filter (center, crop, date, status, payment) | `BookingsTable` in `components/shared.tsx` + `listBookings()` |
| Management dashboard & analytics (all metrics in the brief) | `dashboard()` / `analytics()` in `lib/server/service.ts` |
| Notifications (booking, token, slot approaching, queue change, called, completed, payment, cancelled) | `notify()` calls in `workflow.ts`; UI in `NotificationsView` |
| Auth, role-based access, input validation, activity logs, history, error handling | `lib/server/auth.ts`, `service.ts` (`requireRole`), `errors.ts`, API route |
| Extras from the brief | real-time (5 s polling) queue screen, multiple procurement centers, receipts (printable), CSV export |

Rules worth knowing: payment = net weight × crop price/kg × grade factor (A 100 %, B 95 %, C 90 %); a farmer cannot book the same crop in the same slot twice; a booking is refused when the slot is full or the center's daily kg capacity would be exceeded; check-in is only possible on the booking date; past-date "Booked" entries become *Missed* automatically.

## Architecture

```
Farmer / Staff / Inspector / Admin UI (React, app/page.tsx)
        → fetch /api/*  (app/api/[...route]/route.ts  — Backend API, session cookie auth)
        → service.ts    (permissions, validation, views, analytics)
        → workflow.ts   (Booking & Queue manager + Capacity / Slot manager)
        → store.ts      (Database: JSON file, atomic writes)
        → Procurement-center dashboard (staff / admin views)
```

## Deployment note

The database is a JSON file, ideal for a demo on any Node host (VPS, Render, Railway, `next start` on a laptop). On serverless hosts such as Vercel the filesystem is ephemeral (`/tmp`), so data resets on cold starts and may differ between instances — for a persistent public deployment keep a single Node instance, or replace `lib/server/store.ts` (the only file that touches storage) with Postgres/SQLite.

## Folder guide (for the "Project Explanation Document")

| Path | Purpose |
|---|---|
| `app/page.tsx` | App shell: session check, role-based sidebar/navigation, picks the screen |
| `app/layout.tsx`, `app/globals.css`, `app/app.css` | Root layout; original design tokens/styles; styles for forms, modals, boards, charts |
| `app/api/[...route]/route.ts` | Single REST router: auth, bookings, queue, dashboard, analytics, notifications, admin |
| `components/auth-screen.tsx` | Sign-in and farmer registration |
| `components/shared.tsx` | Booking detail modal (timeline, receipt) and filterable bookings table with CSV export |
| `components/ui-kit.tsx` | Status badges, stat cards, alerts, modal, form field, charts |
| `components/views/*.tsx` | One file per role workspace (farmer, staff, inspector, admin) |
| `lib/types.ts` | Shared data model (farmer, booking, procurement, center, crop, notification, log) |
| `lib/client/api.ts` | `fetch` wrapper, polling hook, formatters, receipt printing, CSV |
| `lib/server/workflow.ts` | Business rules and the booking state machine |
| `lib/server/service.ts` | API use-cases with role checks and validation |
| `lib/server/auth.ts` | scrypt password hashing, signed HttpOnly session cookie |
| `lib/server/store.ts`, `seed.ts` | JSON database and demo data generator |
| `public/` | Static assets (hero image, icons) |
