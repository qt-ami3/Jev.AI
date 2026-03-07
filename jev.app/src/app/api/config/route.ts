import { execFileSync, spawnSync } from "child_process"
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

function extractResumeText(filePath: string, ext: string, outputPath: string): void {
  if (ext === ".pdf") {
    execFileSync("pdftotext", [filePath, outputPath])
  } else if (ext === ".docx") {
    const xmlBuf = execFileSync("unzip", ["-p", filePath, "word/document.xml"])
    const text = xmlBuf.toString().replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim()
    fs.writeFileSync(outputPath, text)
  }
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
    const savedPath = path.join(resumeDir, file.name)
    const buffer = Buffer.from(await file.arrayBuffer())
    fs.writeFileSync(savedPath, buffer)

    await pool.query("UPDATE resume SET filename = ? WHERE id = 1", [file.name])
    await pool.query("UPDATE config SET resume_done = 1 WHERE id = 1")

    // Extract plain text then run Claude parser
    const resumeTxtPath = path.join(resumeDir, "resume.txt")
    const binaryPath = path.join(resumeDir, "resumeParse_Claude")

    try {
      extractResumeText(savedPath, ext, resumeTxtPath)
    } catch (extractErr) {
      console.error("Text extraction error:", extractErr)
      return NextResponse.json({ error: `Text extraction failed: ${String(extractErr)}` }, { status: 500 })
    }

    const result = spawnSync(binaryPath, [], { cwd: resumeDir, timeout: 60000 })
    if (result.status !== 0) {
      const stderr = result.stderr?.toString() ?? ""
      console.error("Parse binary error:", stderr)
      return NextResponse.json({ error: `Resume parsing failed: ${stderr}` }, { status: 500 })
    }

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error("Upload error:", err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
