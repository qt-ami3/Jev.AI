import { execFile } from "child_process"
import { NextRequest, NextResponse } from "next/server"
import path from "path"
import { promisify } from "util"

const execFileAsync = promisify(execFile)
const US_TXT = path.join(process.cwd(), "../locations/US.txt")

const STATE_MAP: Record<string, string> = {
  "alabama": "AL", "alaska": "AK", "arizona": "AZ", "arkansas": "AR",
  "california": "CA", "colorado": "CO", "connecticut": "CT", "delaware": "DE",
  "florida": "FL", "georgia": "GA", "hawaii": "HI", "idaho": "ID",
  "illinois": "IL", "indiana": "IN", "iowa": "IA", "kansas": "KS",
  "kentucky": "KY", "louisiana": "LA", "maine": "ME", "maryland": "MD",
  "massachusetts": "MA", "michigan": "MI", "minnesota": "MN", "mississippi": "MS",
  "missouri": "MO", "montana": "MT", "nebraska": "NE", "nevada": "NV",
  "new hampshire": "NH", "new jersey": "NJ", "new mexico": "NM", "new york": "NY",
  "north carolina": "NC", "north dakota": "ND", "ohio": "OH", "oklahoma": "OK",
  "oregon": "OR", "pennsylvania": "PA", "rhode island": "RI", "south carolina": "SC",
  "south dakota": "SD", "tennessee": "TN", "texas": "TX", "utah": "UT",
  "vermont": "VT", "virginia": "VA", "washington": "WA", "west virginia": "WV",
  "wisconsin": "WI", "wyoming": "WY", "district of columbia": "DC",
}

function resolveState(input: string): string {
  const trimmed = input.trim()
  if (/^[A-Z]{2}$/.test(trimmed)) return trimmed
  return STATE_MAP[trimmed.toLowerCase()] ?? ""
}

export async function GET(req: NextRequest) {
  const city = req.nextUrl.searchParams.get("city")?.trim() ?? ""
  const state = req.nextUrl.searchParams.get("state")?.trim() ?? ""

  if (!city || !state) {
    return NextResponse.json({ valid: false, error: "city and state required" })
  }

  if (!/^[a-zA-Z\s\-'.]+$/.test(city) || !/^[a-zA-Z\s]+$/.test(state)) {
    return NextResponse.json({ valid: false, error: "invalid characters in location" })
  }

  const stateCode = resolveState(state)
  if (!stateCode) {
    return NextResponse.json({ valid: false, error: `unknown state: ${state}` })
  }

  try {
    // grep -iF searches for the literal tab-delimited city name in the name column.
    // execFile avoids shell interpretation — the tab chars are passed literally.
    const { stdout: output } = await execFileAsync(
      "grep",
      ["-iFm", "200", `\t${city}\t`, US_TXT],
      { encoding: "utf-8", timeout: 30000 }
    )

    const found = output
      .split("\n")
      .filter(Boolean)
      .some((line) => {
        const cols = line.split("\t")
        // cols[1]=name, cols[6]=feature class (P=populated place), cols[10]=state code
        return (
          cols[6] === "P" &&
          cols[10] === stateCode &&
          cols[1].toLowerCase() === city.toLowerCase()
        )
      })

    return NextResponse.json({ valid: found })
  } catch (err: unknown) {
    // grep exits with code 1 when no matches found — that means city doesn't exist
    if (
      typeof err === "object" &&
      err !== null &&
      "code" in err &&
      (err as { code?: number }).code === 1
    ) {
      return NextResponse.json({ valid: false })
    }
    return NextResponse.json({ valid: false, error: "location lookup failed" })
  }
}
