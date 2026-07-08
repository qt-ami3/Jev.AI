import crypto from "crypto"
import { NextRequest, NextResponse } from "next/server"
import pool from "@/lib/db"
import { sendVerificationEmail } from "@/lib/email"

export async function POST(req: NextRequest) {
  try {
    const { email } = await req.json()
    if (!email) {
      return NextResponse.json({ error: "Email is required" }, { status: 400 })
    }

    const [rows] = await pool.query("SELECT id, email_verified FROM users WHERE email = ?", [email])
    const user = (rows as Record<string, unknown>[])[0]
    if (!user || user.email_verified) {
      // Don't reveal whether the user exists
      return NextResponse.json({ ok: true })
    }

    const code = String(crypto.randomInt(100000, 1000000))
    const expires = new Date(Date.now() + 10 * 60 * 1000)
    await pool.query("DELETE FROM verification_tokens WHERE identifier = ?", [email])
    await pool.query(
      "INSERT INTO verification_tokens (identifier, token, expires) VALUES (?, ?, ?)",
      [email, code, expires],
    )
    await sendVerificationEmail(email, code)

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error("Resend verification error:", err)
    return NextResponse.json({ error: "Failed to resend" }, { status: 500 })
  }
}
