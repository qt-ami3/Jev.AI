import { spawnSync } from "child_process"
import path from "path"
import { NextResponse } from "next/server"
import pool from "@/lib/db"

const scraperDir = path.join(process.cwd(), "../scraper")

export async function POST() {
  try {
    // Check last_login
    const [rows] = await pool.query(
      "SELECT last_login FROM config WHERE id = 1"
    )
    const row = (rows as Record<string, unknown>[])[0]
    const lastLogin = row?.last_login
      ? new Date(row.last_login as string).toISOString().slice(0, 10)
      : null
    const today = new Date().toISOString().slice(0, 10)

    if (lastLogin === today) {
      return NextResponse.json({ scraped: false, reason: "already_scraped_today" })
    }

    // Update last_login to today
    await pool.query("UPDATE config SET last_login = CURDATE() WHERE id = 1")

    // Run scraper binary (collects job URLs into output.txt)
    const scrapeResult = spawnSync(
      path.join(scraperDir, "scraper"),
      [],
      { cwd: scraperDir, timeout: 60000 }
    )
    if (scrapeResult.status !== 0) {
      const stderr = scrapeResult.stderr?.toString() ?? ""
      console.error("Scraper error:", stderr)
      return NextResponse.json(
        { error: `Scraper failed: ${stderr}` },
        { status: 500 }
      )
    }

    // Run parser binary (scrapes each job page, inserts new ones into DB)
    const parseResult = spawnSync(
      path.join(scraperDir, "parser"),
      [],
      { cwd: scraperDir, timeout: 300000 }
    )
    if (parseResult.status !== 0) {
      const stderr = parseResult.stderr?.toString() ?? ""
      console.error("Parser error:", stderr)
      return NextResponse.json(
        { error: `Parser failed: ${stderr}` },
        { status: 500 }
      )
    }

    return NextResponse.json({ scraped: true })
  } catch (err) {
    console.error("Scrape error:", err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
