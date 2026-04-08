import bcrypt from "bcryptjs"
import NextAuth from "next-auth"
import Credentials from "next-auth/providers/credentials"
import GitHub from "next-auth/providers/github"
import Google from "next-auth/providers/google"
import Nodemailer from "next-auth/providers/nodemailer"
import { MySqlAdapter } from "./auth-adapter"
import pool from "./db"
import { sendOTPEmail } from "./email"

async function ensureUserData(userId: string) {
  await pool.query("INSERT IGNORE INTO config (user_id) VALUES (?)", [userId])
  await pool.query("INSERT IGNORE INTO job_prefs (user_id) VALUES (?)", [userId])
  await pool.query("INSERT IGNORE INTO resume (user_id) VALUES (?)", [userId])
}

export const { handlers, signIn, signOut, auth } = NextAuth({
  adapter: MySqlAdapter(),
  session: { strategy: "jwt" },
  pages: {
    signIn: "/login",
    verifyRequest: "/verify-otp",
  },
  providers: [
    Google,
    GitHub,
    Credentials({
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        const email = credentials?.email as string
        const password = credentials?.password as string
        if (!email || !password) return null

        const [rows] = await pool.query("SELECT * FROM users WHERE email = ?", [email])
        const user = (rows as Record<string, unknown>[])[0]
        if (!user || !user.password) return null

        if (!user.email_verified) return null

        const valid = await bcrypt.compare(password, user.password as string)
        if (!valid) return null

        return {
          id: user.id as string,
          name: user.name as string | null,
          email: user.email as string,
          image: user.image as string | null,
        }
      },
    }),
    Nodemailer({
      id: "otp",
      name: "Email OTP",
      server: {
        host: process.env.SMTP_HOST,
        port: Number(process.env.SMTP_PORT ?? 587),
        secure: Number(process.env.SMTP_PORT ?? 587) === 465,
        auth: {
          user: process.env.SMTP_USER,
          pass: process.env.SMTP_PASS,
        },
      },
      from: process.env.EMAIL_FROM ?? "noreply@jev.app",
      maxAge: 10 * 60, // 10 minutes
      async generateVerificationToken() {
        return String(Math.floor(100000 + Math.random() * 900000))
      },
      async sendVerificationRequest({ identifier: email, token }) {
        await sendOTPEmail(email, token)
      },
    }),
  ],
  callbacks: {
    async signIn({ user }) {
      if (user.id) await ensureUserData(user.id)
      return true
    },
    async jwt({ token, user }) {
      if (user?.id) token.userId = user.id
      return token
    },
    async session({ session, token }) {
      if (token.userId) session.user.id = token.userId
      return session
    },
  },
})
