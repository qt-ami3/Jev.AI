import { NextRequest, NextResponse } from "next/server"
import pool from "@/lib/db"

export async function POST(req: NextRequest) {
  try {
    const { email, token } = await req.json()
    if (!email || !token) {
      return NextResponse.json({ error: "Email and code are required" }, { status: 400 })
    }

    const [rows] = await pool.query(
      "SELECT * FROM verification_tokens WHERE identifier = ? AND token = ?",
      [email, token],
    )
    const row = (rows as Record<string, unknown>[])[0]
    if (!row) {
      return NextResponse.json({ error: "Invalid or expired code" }, { status: 400 })
    }

    const expires = new Date(row.expires as string)
    if (expires < new Date()) {
      await pool.query("DELETE FROM verification_tokens WHERE identifier = ? AND token = ?", [email, token])
      return NextResponse.json({ error: "Code expired" }, { status: 400 })
    }

    // Mark email as verified
    await pool.query("UPDATE users SET email_verified = NOW() WHERE email = ?", [email])

    // Clean up token
    await pool.query("DELETE FROM verification_tokens WHERE identifier = ?", [email])

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error("Verify email error:", err)
    return NextResponse.json({ error: "Verification failed" }, { status: 500 })
  }
}
