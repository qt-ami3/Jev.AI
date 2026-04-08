import { NextRequest, NextResponse } from "next/server"
import pool from "@/lib/db"
import { requireAuth } from "@/lib/auth-helpers"

const WORK_TYPES: Record<string, string> = { "1": "On-site", "2": "Remote", "3": "Hybrid" }
const EXP_LEVELS: Record<string, string> = { "1": "Intern", "2": "Entry Level" }

export async function GET() {
  const result = await requireAuth()
  if (result instanceof NextResponse) return result
  const { userId } = result

  const [resumeRows] = await pool.query("SELECT parsed_data FROM resume WHERE user_id = ?", [userId])
  const [prefRows] = await pool.query(
    "SELECT keywords, location, distance, f_WT, f_E FROM job_prefs WHERE user_id = ?",
    [userId]
  )

  const resumeRow = (resumeRows as Record<string, unknown>[])[0]
  const prefRow = (prefRows as Record<string, unknown>[])[0]

  const raw = resumeRow?.parsed_data ?? null
  const resume = raw == null ? null : typeof raw === "string" ? JSON.parse(raw) : raw
  let jobPrefs = null

  if (prefRow) {
    jobPrefs = {
      keywords: String(prefRow.keywords ?? ""),
      location: String(prefRow.location ?? "").trim(),
      distance: String(prefRow.distance ?? "").trim(),
      workTypes: String(prefRow.f_WT ?? "")
        .split(",")
        .map((s: string) => WORK_TYPES[s.trim()] ?? s.trim())
        .filter(Boolean),
      expLevels: String(prefRow.f_E ?? "")
        .split(",")
        .map((s: string) => EXP_LEVELS[s.trim()] ?? s.trim())
        .filter(Boolean),
    }
  }

  return NextResponse.json({ resume, jobPrefs })
}

export async function PATCH(req: NextRequest) {
  const result = await requireAuth()
  if (result instanceof NextResponse) return result
  const { userId } = result

  try {
    const body = await req.json()
    const [rows] = await pool.query("SELECT parsed_data FROM resume WHERE user_id = ?", [userId])
    const raw = (rows as Record<string, unknown>[])[0]?.parsed_data ?? null
    const current: object = raw == null ? {} : typeof raw === "string" ? JSON.parse(raw) : raw as object
    await pool.query("UPDATE resume SET parsed_data = ? WHERE user_id = ?", [
      JSON.stringify({ ...current, ...body }),
      userId,
    ])
    return NextResponse.json({ ok: true })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
