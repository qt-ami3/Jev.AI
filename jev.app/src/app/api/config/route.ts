import fs from "fs"
import ini from "ini"
import { NextResponse } from "next/server"
import path from "path"

export async function GET() {
  const filePath = path.join(process.cwd(), "gettingStarted.ini")
  const config = ini.parse(fs.readFileSync(filePath, "utf-8"))
  return NextResponse.json(config)
}
