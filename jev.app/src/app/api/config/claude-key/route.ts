import { NextRequest, NextResponse } from "next/server"
import pool from "@/lib/db"
import { requireAuth } from "@/lib/auth-helpers"

export async function GET() {
  const result = await requireAuth()
  if (result instanceof NextResponse) return result
  const { userId } = result

  const [rows] = await pool.query("SELECT claude_api_key FROM config WHERE user_id = ?", [userId])
  const key = ((rows as Record<string, unknown>[])[0]?.claude_api_key as string) || ""
  return NextResponse.json({ hasKey: key !== "" })
}

export async function POST(req: NextRequest) {
  const result = await requireAuth()
  if (result instanceof NextResponse) return result
  const { userId } = result

  const { key } = await req.json()
  if (typeof key !== "string") {
    return NextResponse.json({ error: "key must be a string" }, { status: 400 })
  }

  await pool.query("UPDATE config SET claude_api_key = ? WHERE user_id = ?", [key.trim(), userId])
  return NextResponse.json({ ok: true })
}
