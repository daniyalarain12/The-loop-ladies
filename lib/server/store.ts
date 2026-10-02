import fs from 'node:fs'
import path from 'node:path'
import type { DB } from '../types'
import { AppError } from './errors'
import { seedDb } from './seed'

const FILE = process.env.DATA_FILE || (process.env.VERCEL ? '/tmp/agriqueue-db.json' : path.join(process.cwd(), '.data', 'db.json'))
const g = globalThis as unknown as { __aq_db?: DB }

function load(): DB {
  try {
    if (fs.existsSync(FILE)) return JSON.parse(fs.readFileSync(FILE, 'utf8')) as DB
  } catch (e) {
    console.error('[db] failed to read data file, re-seeding', e)
  }
  const fresh = seedDb()
  persist(fresh)
  return fresh
}
function persist(d: DB) {
  try {
    fs.mkdirSync(path.dirname(FILE), { recursive: true })
    const tmp = FILE + '.tmp'
    fs.writeFileSync(tmp, JSON.stringify(d))
    fs.renameSync(tmp, FILE)
  } catch (e) {
    console.error('[db] write failed', e)
    throw new AppError(500, 'Database error: your change could not be saved. Please try again.')
  }
}
export function db(): DB {
  if (!g.__aq_db) g.__aq_db = load()
  return g.__aq_db
}
export function save() { persist(db()) }
/** Reset demo data (admin tool). */
export function resetDb() { g.__aq_db = seedDb(); persist(g.__aq_db) }
