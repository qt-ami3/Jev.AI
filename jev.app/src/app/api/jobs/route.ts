import { NextRequest, NextResponse } from "next/server"
import pool from "@/lib/db"
import { requireAuth } from "@/lib/auth-helpers"

export interface Job {
  id: number
  title: string
  url: string
  description: string
  read_at: string | null
}

export async function GET(req: NextRequest) {
  const result = await requireAuth()
  if (result instanceof NextResponse) return result
  const { userId } = result

  // ?stats=1 returns dashboard stats only
  if (req.nextUrl.searchParams.get("stats") === "1") {
    const [totalRows] = await pool.query(
      "SELECT COUNT(*) as total FROM jobs WHERE user_id = ?", [userId]
    )
    const [unreadRows] = await pool.query(
      "SELECT COUNT(*) as unread FROM jobs WHERE user_id = ? AND read_at IS NULL", [userId]
    )
    const [recentRows] = await pool.query(
      "SELECT id, title, url, scraped_at FROM jobs WHERE user_id = ? AND read_at IS NULL ORDER BY id DESC LIMIT 5",
      [userId]
    )
    return NextResponse.json({
      total: (totalRows as Record<string, unknown>[])[0]?.total ?? 0,
      unread: (unreadRows as Record<string, unknown>[])[0]?.unread ?? 0,
      recent: recentRows,
    })
  }

  const [rows] = await pool.query(
    "SELECT id, title, url, description, read_at FROM jobs WHERE user_id = ? ORDER BY id DESC",
    [userId]
  )
  return NextResponse.json(rows)
}

export async function PATCH(req: NextRequest) {
  const result = await requireAuth()
  if (result instanceof NextResponse) return result
  const { userId } = result

  const body = await req.json()
  const jobId = (body as Record<string, unknown>).id as number
  if (!jobId) return NextResponse.json({ error: "Job ID required" }, { status: 400 })

  await pool.query(
    "UPDATE jobs SET read_at = NOW() WHERE id = ? AND user_id = ? AND read_at IS NULL",
    [jobId, userId]
  )
  return NextResponse.json({ ok: true })
}
