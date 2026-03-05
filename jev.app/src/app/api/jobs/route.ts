import { NextResponse } from "next/server"
import pool from "@/lib/db"

export interface Job {
  id: number
  title: string
  url: string
  description: string
}

export async function GET() {
  const [rows] = await pool.query(
    "SELECT id, title, url, description FROM jobs ORDER BY id"
  )
  return NextResponse.json(rows)
}
