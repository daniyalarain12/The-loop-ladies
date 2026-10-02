export type Role = 'farmer' | 'staff' | 'inspector' | 'admin'

export type BookingStatus =
  | 'Booked' | 'Checked In' | 'Waiting' | 'Weighing' | 'Quality Check' | 'Unloading'
  | 'Payment Pending' | 'Completed' | 'Cancelled' | 'Missed' | 'Rejected'

export const FLOW: BookingStatus[] = ['Booked', 'Checked In', 'Waiting', 'Weighing', 'Quality Check', 'Unloading', 'Payment Pending', 'Completed']
export const ALL_STATUSES = [...FLOW, 'Cancelled', 'Missed', 'Rejected', 'Delayed'] as const

export interface User {
  id: string
  role: Role
  login: string // phone for farmers, username for staff/inspector/admin
  name: string
  phone: string
  location: string
  identification: string // CNIC / national ID (farmers)
  registrationStatus: 'Approved' | 'Suspended' // farmer_registration_status
  active: boolean
  centerId?: string // staff / inspector home center
  passwordHash: string
  createdAt: string
}
export type PublicUser = Omit<User, 'passwordHash'>

export interface Center {
  id: string
  name: string
  location: string
  prefix: string // token prefix, e.g. "A"
  dailyCapacityKg: number
  weighingStations: number
  unloadingPoints: number
  slotCapacity: number // max bookings per time slot
  slots: string[] // "08:00-09:00"
  open: boolean
}

export interface Crop { id: string; name: string; pricePerKg: number; active: boolean }

export interface HistoryEntry { status: string; at: string; by: string }

export interface Booking {
  id: string
  farmerId: string
  centerId: string
  cropId: string
  cropName: string
  date: string // YYYY-MM-DD
  slot: string
  estimatedKg: number
  token: string
  queueOrder: number
  status: BookingStatus
  delayed: boolean
  delayReason?: string
  station?: number
  createdAt: string
  checkedInAt?: string
  calledAt?: string
  completedAt?: string
  queueLenAtCheckIn?: number
  remindedAt?: string
  lastPos?: number
  history: HistoryEntry[]
}

export interface Procurement {
  id: string
  bookingId: string
  grossKg?: number
  emptyKg?: number
  netKg?: number
  weighingStation?: number
  weighedAt?: string
  grade?: 'A' | 'B' | 'C'
  moisture?: number
  damagedPct?: number
  foreignMaterial?: number
  remarks?: string
  inspectorId?: string
  inspectedAt?: string
  accepted?: boolean
  unloadedAt?: string
  pricePerKg?: number
  gradeFactor?: number
  totalAmount?: number
  paymentStatus: 'Pending' | 'Paid' | 'Not applicable'
  paidAt?: string
  receiptNo?: string
  completionTime?: string
}

export interface Notification {
  id: string; userId: string; type: string; title: string; message: string
  bookingId?: string; createdAt: string; read: boolean
}
export interface ActivityLog { id: string; at: string; actorId: string; actorName: string; role: string; action: string; detail: string }

export interface DB {
  users: User[]; centers: Center[]; crops: Crop[]; bookings: Booking[]
  procurements: Procurement[]; notifications: Notification[]; logs: ActivityLog[]
}

// ----- API view models -----
export interface BookingView extends Booking {
  farmerName: string
  farmerPhone: string
  centerName: string
  procurement?: Procurement
  position: number // 0 = not in waiting line
  etaMin: number
}
export interface SlotInfo { slot: string; booked: number; capacity: number; left: number; full: boolean; past: boolean }
export interface SlotsResponse { slots: SlotInfo[]; dailyKg: number; reservedKg: number; availableKg: number }
