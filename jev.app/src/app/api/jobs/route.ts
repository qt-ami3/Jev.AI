import fs from "fs"
import { NextResponse } from "next/server"
import path from "path"

const listingsDir = path.join(process.cwd(), "../scraper/listings")

export interface Job {
  id: number
  title: string
  url: string
  description: string
}

export async function GET() {
  if (!fs.existsSync(listingsDir)) {
    return NextResponse.json([])
  }

  const files = fs
    .readdirSync(listingsDir)
    .filter((f) => f.endsWith(".txt"))
    .map((f) => parseInt(f))
    .filter((n) => !isNaN(n))
    .sort((a, b) => a - b)

  const jobs: Job[] = []

  for (const id of files) {
    const raw = fs.readFileSync(path.join(listingsDir, `${id}.txt`), "utf-8")
    const newline = raw.indexOf("\n")
    const firstLine = newline === -1 ? raw.trim() : raw.slice(0, newline).trim()
    const description = newline === -1 ? "" : raw.slice(newline + 1).trim()

    const sep = firstLine.lastIndexOf(" | ")
    const title = sep === -1 ? firstLine : firstLine.slice(0, sep)
    const url = sep === -1 ? "" : firstLine.slice(sep + 3)

    jobs.push({ id, title, url, description })
  }

  return NextResponse.json(jobs)
}
