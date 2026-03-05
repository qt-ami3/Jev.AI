import { NextRequest, NextResponse } from "next/server"
import pool from "@/lib/db"

export async function GET() {
  const [rows] = await pool.query("SELECT * FROM job_prefs WHERE id = 1")
  return NextResponse.json((rows as Record<string, unknown>[])[0] ?? {})
}

export async function POST(req: NextRequest) {
  try {
    const { keywords, location, distance, f_WT, f_E } = await req.json()

    await pool.query(
      "UPDATE job_prefs SET keywords=?, location=?, distance=?, f_WT=?, f_E=? WHERE id=1",
      [keywords, location, distance, f_WT, f_E]
    )
    await pool.query("UPDATE config SET job_prefs_done = 1 WHERE id = 1")

    return NextResponse.json({ ok: true })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
