import { NextResponse } from "next/server"
import pool from "@/lib/db"
import { requireAuth } from "@/lib/auth-helpers"

export interface Job {
  id: number
  title: string
  url: string
  description: string
}

export async function GET() {
  const result = await requireAuth()
  if (result instanceof NextResponse) return result
  const { userId } = result

  const [rows] = await pool.query(
    "SELECT id, title, url, description FROM jobs WHERE user_id = ? ORDER BY id DESC",
    [userId]
  )
  return NextResponse.json(rows)
}
