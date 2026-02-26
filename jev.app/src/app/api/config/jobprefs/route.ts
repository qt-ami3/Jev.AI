import fs from "fs"
import ini from "ini"
import { NextRequest, NextResponse } from "next/server"
import path from "path"

const gettingStartedPath = path.join(process.cwd(), "gettingStarted.ini")
const scraperConfigPath = path.join(process.cwd(), "../scraper/config.ini")

export async function GET() {
  const config = ini.parse(fs.readFileSync(scraperConfigPath, "utf-8"))
  return NextResponse.json(config)
}

export async function POST(req: NextRequest) {
  try {
    const { keywords, location, distance, f_WT, f_E } = await req.json()

    const scraperConfig = ini.parse(fs.readFileSync(scraperConfigPath, "utf-8"))
    scraperConfig.keywords.keywords = keywords
    scraperConfig.keywords.location = location
    scraperConfig.keywords.distance = distance
    scraperConfig.keywords.f_WT = f_WT
    scraperConfig.keywords.f_E = f_E
    fs.writeFileSync(scraperConfigPath, ini.stringify(scraperConfig))

    const gsConfig = ini.parse(fs.readFileSync(gettingStartedPath, "utf-8"))
    gsConfig.progress.jobPrefs = "true"
    fs.writeFileSync(gettingStartedPath, ini.stringify(gsConfig))

    return NextResponse.json({ ok: true })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
