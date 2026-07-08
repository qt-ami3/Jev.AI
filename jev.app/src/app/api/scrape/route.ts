import { execFile } from "child_process"
import path from "path"
import { promisify } from "util"
import { NextRequest, NextResponse } from "next/server"
import pool from "@/lib/db"
import { requireAuth } from "@/lib/auth-helpers"

const execFileAsync = promisify(execFile)
const scraperDir = path.join(process.cwd(), "../scraper")

export async function POST(req: NextRequest) {
  const result = await requireAuth()
  if (result instanceof NextResponse) return result
  const { userId } = result

  try {
    const body = await req.json().catch(() => ({}))
    const force = (body as Record<string, unknown>)?.force === true

    // Check last_login
    const [rows] = await pool.query(
      "SELECT last_login FROM config WHERE user_id = ?",
      [userId]
    )
    const row = (rows as Record<string, unknown>[])[0]
    const lastLogin = row?.last_login
      ? new Date(row.last_login as string).toISOString().slice(0, 10)
      : null
    const today = new Date().toISOString().slice(0, 10)

    // Skip if already scraped today AND user has jobs (unless forced)
    if (!force && lastLogin === today) {
      const [jobRows] = await pool.query(
        "SELECT COUNT(*) as cnt FROM jobs WHERE user_id = ?", [userId]
      )
      const jobCount = (jobRows as Record<string, unknown>[])[0]?.cnt as number
      if (jobCount > 0) {
        return NextResponse.json({ scraped: false, reason: "already_scraped_today" })
      }
    }

    // Run scraper binary (collects job URLs into output_<userId>.txt)
    try {
      await execFileAsync(path.join(scraperDir, "scraper"), [userId], {
        cwd: scraperDir,
        timeout: 60000,
      })
    } catch (err) {
      const stderr = (err as { stderr?: string }).stderr ?? String(err)
      console.error("Scraper error:", stderr)
      return NextResponse.json(
        { error: `Scraper failed: ${stderr}` },
        { status: 500 }
      )
    }

    // Run parser binary (scrapes each job page, inserts rows owned by this user)
    try {
      await execFileAsync(path.join(scraperDir, "parser"), [userId], {
        cwd: scraperDir,
        timeout: 300000,
      })
    } catch (err) {
      const stderr = (err as { stderr?: string }).stderr ?? String(err)
      console.error("Parser error:", stderr)
      return NextResponse.json(
        { error: `Parser failed: ${stderr}` },
        { status: 500 }
      )
    }

    // Only mark as scraped today after success
    await pool.query("UPDATE config SET last_login = CURDATE() WHERE user_id = ?", [userId])

    return NextResponse.json({ scraped: true })
  } catch (err) {
    console.error("Scrape error:", err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
