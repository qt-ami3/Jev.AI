import crypto from "crypto"
import bcrypt from "bcryptjs"
import { NextRequest, NextResponse } from "next/server"
import pool from "@/lib/db"
import { sendVerificationEmail } from "@/lib/email"

// Local demo mode: no SMTP server available, so skip email verification
const DEMO = process.env.DEMO_MODE === "1" || process.env.DEMO_MODE === "true"

export async function POST(req: NextRequest) {
  try {
    const { name, email, password } = await req.json()

    if (!email || !password) {
      return NextResponse.json({ error: "Email and password are required" }, { status: 400 })
    }
    if (password.length < 8) {
      return NextResponse.json({ error: "Password must be at least 8 characters" }, { status: 400 })
    }

    const [existing] = await pool.query("SELECT id, email_verified FROM users WHERE email = ?", [email])
    const existingUser = (existing as Record<string, unknown>[])[0]
    if (existingUser) {
      if (!existingUser.email_verified) {
        if (DEMO) {
          await pool.query("UPDATE users SET email_verified = NOW() WHERE email = ?", [email])
          return NextResponse.json({ ok: true, verified: true })
        }
        // Unverified user re-registering — resend verification
        const code = String(crypto.randomInt(100000, 1000000))
        const expires = new Date(Date.now() + 10 * 60 * 1000)
        await pool.query("DELETE FROM verification_tokens WHERE identifier = ?", [email])
        await pool.query(
          "INSERT INTO verification_tokens (identifier, token, expires) VALUES (?, ?, ?)",
          [email, code, expires],
        )
        await sendVerificationEmail(email, code)
        return NextResponse.json({ ok: true, verify: true })
      }
      return NextResponse.json({ error: "Email already registered" }, { status: 409 })
    }

    const id = crypto.randomUUID()
    const hashed = await bcrypt.hash(password, 12)

    await pool.query(
      "INSERT INTO users (id, name, email, password, email_verified) VALUES (?, ?, ?, ?, ?)",
      [id, name || null, email, hashed, DEMO ? new Date() : null],
    )

    // Initialize user data rows
    await pool.query("INSERT IGNORE INTO config (user_id) VALUES (?)", [id])
    await pool.query("INSERT IGNORE INTO job_prefs (user_id) VALUES (?)", [id])
    await pool.query("INSERT IGNORE INTO resume (user_id) VALUES (?)", [id])

    if (DEMO) {
      return NextResponse.json({ ok: true, verified: true })
    }

    // Send verification email
    const code = String(crypto.randomInt(100000, 1000000))
    const expires = new Date(Date.now() + 10 * 60 * 1000)
    await pool.query(
      "INSERT INTO verification_tokens (identifier, token, expires) VALUES (?, ?, ?)",
      [email, code, expires],
    )
    await sendVerificationEmail(email, code)

    return NextResponse.json({ ok: true, verify: true })
  } catch (err) {
    console.error("Registration error:", err)
    return NextResponse.json({ error: "Registration failed" }, { status: 500 })
  }
}
