import crypto from "crypto"
import { NextRequest, NextResponse } from "next/server"
import pool from "@/lib/db"
import { requireAuth } from "@/lib/auth-helpers"
import { getClaudeApiKey, streamClaude, parseSSEStream } from "@/lib/claude"

export async function GET(req: NextRequest) {
  const result = await requireAuth()
  if (result instanceof NextResponse) return result
  const { userId } = result

  const search = req.nextUrl.searchParams.get("q") ?? ""

  let query = "SELECT id, title, created_at FROM jev_conversations WHERE user_id = ?"
  const params: unknown[] = [userId]

  if (search) {
    query += " AND title LIKE ?"
    params.push(`%${search}%`)
  }

  query += " ORDER BY created_at DESC LIMIT 50"

  const [rows] = await pool.query(query, params)
  return NextResponse.json(rows)
}

export async function POST() {
  const result = await requireAuth()
  if (result instanceof NextResponse) return result
  const { userId } = result

  const apiKey = await getClaudeApiKey(userId)
  if (!apiKey) {
    return NextResponse.json({ error: "Claude API key not configured. Add it in Settings." }, { status: 400 })
  }

  // Fetch resume
  const [resumeRows] = await pool.query("SELECT parsed_data FROM resume WHERE user_id = ?", [userId])
  const resumeRow = (resumeRows as Record<string, unknown>[])[0]
  const raw = resumeRow?.parsed_data ?? null
  const resume = raw == null ? null : typeof raw === "string" ? JSON.parse(raw) : raw

  // Fetch jobs
  const [jobRows] = await pool.query(
    "SELECT title, url, description FROM jobs WHERE user_id = ? ORDER BY id DESC LIMIT 50",
    [userId],
  )
  const jobs = jobRows as Record<string, unknown>[]

  if (!resume && jobs.length === 0) {
    return NextResponse.json(
      { error: "Upload a resume and run the scraper first." },
      { status: 400 },
    )
  }

  // Create conversation
  const convId = crypto.randomUUID()
  const title = `Job analysis — ${new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`

  await pool.query(
    "INSERT INTO jev_conversations (id, user_id, title) VALUES (?, ?, ?)",
    [convId, userId, title],
  )

  const system = `You are Jev, a sharp career advisor. The user has a resume and scraped LinkedIn job listings. Analyze which jobs best match their qualifications and experience.

Be direct and specific. Rank the top matches, explain why each fits (or what gaps exist), and give actionable advice. Use the job titles and URLs so the user can reference them.

## User's Resume
${JSON.stringify(resume, null, 2)}

## Scraped Job Listings (${jobs.length} total)
${jobs.map((j, i) => `### ${i + 1}. ${j.title}\nURL: ${j.url}\n${(j.description as string)?.slice(0, 500) || "(no description)"}`).join("\n\n")}`

  const userMessage = "Analyze these jobs against my resume. Which are the best matches and why? What should I focus on?"

  await pool.query(
    "INSERT INTO jev_messages (conversation_id, role, content) VALUES (?, 'user', ?)",
    [convId, userMessage],
  )

  // Stream Claude response
  let fullResponse = ""
  const stream = await streamClaude(apiKey, system, [{ role: "user", content: userMessage }])
  const sseStream = parseSSEStream(stream, (text) => { fullResponse += text })

  // We need to return the stream but also save the full response afterward
  const { readable, writable } = new TransformStream()
  const writer = writable.getWriter()
  const encoder = new TextEncoder()

  // Send conversation ID first
  writer.write(encoder.encode(`data: ${JSON.stringify({ conversationId: convId })}\n\n`))

  // Pipe SSE stream and save response when done
  const reader = sseStream.getReader()
  ;(async () => {
    try {
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        await writer.write(value)
      }
    } catch {
      // Client disconnected — keep draining Claude's stream so the full
      // response still lands in the conversation history.
      try {
        while (!(await reader.read()).done) { /* drain */ }
      } catch {}
    }
    try {
      if (fullResponse) {
        await pool.query(
          "INSERT INTO jev_messages (conversation_id, role, content) VALUES (?, 'assistant', ?)",
          [convId, fullResponse],
        )
      }
    } catch (err) {
      console.error("Failed to persist assistant message:", err)
    }
    await writer.close().catch(() => {})
  })()

  return new Response(readable, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  })
}
