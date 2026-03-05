import fs from "fs"
import { NextRequest, NextResponse } from "next/server"
import path from "path"
import pool from "@/lib/db"

const resumeDir = path.join(process.cwd(), "../resume")

const ALLOWED_EXTENSIONS = [".pdf", ".docx"]

export async function GET() {
  const [rows] = await pool.query("SELECT resume_done, job_prefs_done FROM config WHERE id = 1")
  const row = (rows as Record<string, unknown>[])[0] ?? {}
  return NextResponse.json({
    progress: {
      resume: row.resume_done === 1,
      jobPrefs: row.job_prefs_done === 1,
    },
  })
}

export async function POST(req: NextRequest) {
  try {
    const form = await req.formData()
    const file = form.get("resume") as File | null

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 })
    }

    const ext = path.extname(file.name).toLowerCase()

    if (!ALLOWED_EXTENSIONS.includes(ext)) {
      return NextResponse.json(
        { error: `Invalid file type "${file.name}". Only .pdf and .docx are allowed.` },
        { status: 400 }
      )
    }

    fs.mkdirSync(resumeDir, { recursive: true })
    const buffer = Buffer.from(await file.arrayBuffer())
    fs.writeFileSync(path.join(resumeDir, file.name), buffer)

    await pool.query("UPDATE resume SET filename = ? WHERE id = 1", [file.name])
    await pool.query("UPDATE config SET resume_done = 1 WHERE id = 1")

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error("Upload error:", err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
