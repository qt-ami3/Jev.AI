import { NextRequest, NextResponse } from "next/server"
import pool from "@/lib/db"

export async function POST(req: NextRequest) {
  const { email } = await req.json()
  if (!email) {
    return NextResponse.json({ verified: true })
  }

  const [rows] = await pool.query(
    "SELECT email_verified FROM users WHERE email = ?",
    [email],
  )
  const user = (rows as Record<string, unknown>[])[0]

  // If user doesn't exist, return true (let signIn handle the "invalid" error)
  if (!user) return NextResponse.json({ verified: true })

  return NextResponse.json({ verified: !!user.email_verified })
}
