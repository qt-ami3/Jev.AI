import { execFileSync, execFile } from "child_process"
import fs from "fs"
import { NextRequest, NextResponse } from "next/server"
import path from "path"
import { promisify } from "util"
import pool from "@/lib/db"
import { requireAuth } from "@/lib/auth-helpers"
import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3"

const execFileAsync = promisify(execFile)
const resumeDir = path.join(process.cwd(), "../resume")

const ALLOWED_EXTENSIONS = [".pdf", ".docx"]

export async function GET() {
  const result = await requireAuth()
  if (result instanceof NextResponse) return result
  const { userId } = result

  const [rows] = await pool.query("SELECT resume_done, job_prefs_done FROM config WHERE user_id = ?", [userId])
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
  const result = await requireAuth()
  if (result instanceof NextResponse) return result
  const { userId } = result

  try {
    const form = await req.formData()
    const file = form.get("resume") as File | null

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 })
    }

    // basename() strips any client-supplied path components (e.g. "../../x.pdf")
    const safeName = path.basename(file.name)
    const ext = path.extname(safeName).toLowerCase()

    if (!ALLOWED_EXTENSIONS.includes(ext)) {
      return NextResponse.json(
        { error: `Invalid file type "${safeName}". Only .pdf and .docx are allowed.` },
        { status: 400 }
      )
    }

    fs.mkdirSync(resumeDir, { recursive: true })
    const savedPath = path.join(resumeDir, safeName)
    const buffer = Buffer.from(await file.arrayBuffer())
    fs.writeFileSync(savedPath, buffer)

    // Persist to S3 when running on Fargate (ephemeral local filesystem)
    if (process.env.RESUME_BUCKET) {
      const s3 = new S3Client({})
      await s3.send(new PutObjectCommand({
        Bucket: process.env.RESUME_BUCKET,
        Key: `resumes/${userId}/${safeName}`,
        Body: buffer,
      }))
    }

    await pool.query("UPDATE resume SET filename = ? WHERE user_id = ?", [safeName, userId])
    await pool.query("UPDATE config SET resume_done = 1 WHERE user_id = ?", [userId])

    // Extract plain text then run Claude parser (per-user file so concurrent
    // uploads can't read each other's resume text)
    const resumeTxtPath = path.join(resumeDir, `resume_${userId}.txt`)
    const binaryPath = path.join(resumeDir, "resumeParse_Claude")

    try {
      extractResumeText(savedPath, ext, resumeTxtPath)
    } catch (extractErr) {
      console.error("Text extraction error:", extractErr)
      return NextResponse.json({ error: `Text extraction failed: ${String(extractErr)}` }, { status: 500 })
    }

    try {
      await execFileAsync(binaryPath, [userId], { cwd: resumeDir, timeout: 60000 })
    } catch (err) {
      const stderr = (err as { stderr?: string }).stderr ?? String(err)
      console.error("Parse binary error:", stderr)
      return NextResponse.json({ error: `Resume parsing failed: ${stderr}` }, { status: 500 })
    }

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error("Upload error:", err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
