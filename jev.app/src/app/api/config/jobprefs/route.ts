import { NextRequest, NextResponse } from "next/server"
import pool from "@/lib/db"
import { requireAuth } from "@/lib/auth-helpers"

export async function GET() {
  const result = await requireAuth()
  if (result instanceof NextResponse) return result
  const { userId } = result

  const [rows] = await pool.query("SELECT * FROM job_prefs WHERE user_id = ?", [userId])
  return NextResponse.json((rows as Record<string, unknown>[])[0] ?? {})
}

export async function POST(req: NextRequest) {
  const result = await requireAuth()
  if (result instanceof NextResponse) return result
  const { userId } = result

  try {
    const { keywords, location, distance, f_WT, f_E } = await req.json()

    await pool.query(
      "UPDATE job_prefs SET keywords=?, location=?, distance=?, f_WT=?, f_E=? WHERE user_id=?",
      [keywords, location, distance, f_WT, f_E, userId]
    )
    await pool.query("UPDATE config SET job_prefs_done = 1 WHERE user_id = ?", [userId])

    return NextResponse.json({ ok: true })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
