import fs from "fs"
import ini from "ini"
import { NextRequest, NextResponse } from "next/server"
import path from "path"

const iniPath = path.join(process.cwd(), "gettingStarted.ini")
const resumeDir = path.join(process.cwd(), "../resume")

const ALLOWED_EXTENSIONS = [".pdf", ".docx"]

export async function GET() {
  const config = ini.parse(fs.readFileSync(iniPath, "utf-8"))
  return NextResponse.json(config)
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

    const config = ini.parse(fs.readFileSync(iniPath, "utf-8"))
    config.progress.resume = "true"
    fs.writeFileSync(iniPath, ini.stringify(config))

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error("Upload error:", err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
