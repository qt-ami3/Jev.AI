import fs from "fs"
import ini from "ini"
import { NextRequest, NextResponse } from "next/server"
import path from "path"

const resumePath = path.join(process.cwd(), "../resume/resume.txt")
const scraperConfigPath = path.join(process.cwd(), "../scraper/config.ini")

const WORK_TYPES: Record<string, string> = { "1": "On-site", "2": "Remote", "3": "Hybrid" }
const EXP_LEVELS: Record<string, string> = { "1": "Intern", "2": "Entry Level" }

export async function GET() {
  let resume = null
  let jobPrefs = null

  if (fs.existsSync(resumePath)) {
    try {
      resume = JSON.parse(fs.readFileSync(resumePath, "utf-8"))
    } catch {}
  }

  if (fs.existsSync(scraperConfigPath)) {
    const config = ini.parse(fs.readFileSync(scraperConfigPath, "utf-8"))
    const k = config.keywords ?? {}
    jobPrefs = {
      keywords: String(k.keywords ?? ""),
      location: String(k.location ?? "").trim(),
      distance: String(k.distance ?? "").trim(),
      workTypes: String(k.f_WT ?? "").split(",").map((s: string) => WORK_TYPES[s.trim()] ?? s.trim()).filter(Boolean),
      expLevels: String(k.f_E ?? "").split(",").map((s: string) => EXP_LEVELS[s.trim()] ?? s.trim()).filter(Boolean),
    }
  }

  return NextResponse.json({ resume, jobPrefs })
}

export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json()
    const current = JSON.parse(fs.readFileSync(resumePath, "utf-8"))
    fs.writeFileSync(resumePath, JSON.stringify({ ...current, ...body }, null, 2))
    return NextResponse.json({ ok: true })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
