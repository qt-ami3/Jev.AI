import { NextRequest, NextResponse } from "next/server"
import pool from "@/lib/db"
import { requireAuth } from "@/lib/auth-helpers"
import { getClaudeApiKey, streamClaude, parseSSEStream } from "@/lib/claude"

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const result = await requireAuth()
  if (result instanceof NextResponse) return result
  const { userId } = result
  const { id } = await params

  // Verify ownership
  const [convRows] = await pool.query(
    "SELECT id, title, created_at FROM jev_conversations WHERE id = ? AND user_id = ?",
    [id, userId],
  )
  const conv = (convRows as Record<string, unknown>[])[0]
  if (!conv) return NextResponse.json({ error: "Not found" }, { status: 404 })

  const [msgRows] = await pool.query(
    "SELECT role, content, created_at FROM jev_messages WHERE conversation_id = ? ORDER BY id",
    [id],
  )

  return NextResponse.json({ conversation: conv, messages: msgRows })
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const result = await requireAuth()
  if (result instanceof NextResponse) return result
  const { userId } = result
  const { id } = await params

  // Verify ownership
  const [convRows] = await pool.query(
    "SELECT id FROM jev_conversations WHERE id = ? AND user_id = ?",
    [id, userId],
  )
  if ((convRows as unknown[]).length === 0) {
    return NextResponse.json({ error: "Not found" }, { status: 404 })
  }

  const body = await req.json()
  const userMessage = (body as Record<string, unknown>).message as string
  if (!userMessage?.trim()) {
    return NextResponse.json({ error: "Message required" }, { status: 400 })
  }

  const apiKey = await getClaudeApiKey(userId)
  if (!apiKey) {
    return NextResponse.json({ error: "Claude API key not configured" }, { status: 400 })
  }

  // Save user message
  await pool.query(
    "INSERT INTO jev_messages (conversation_id, role, content) VALUES (?, 'user', ?)",
    [id, userMessage],
  )

  // Build conversation history
  const [msgRows] = await pool.query(
    "SELECT role, content FROM jev_messages WHERE conversation_id = ? ORDER BY id",
    [id],
  )
  const messages = (msgRows as Record<string, unknown>[]).map((m) => ({
    role: m.role as "user" | "assistant",
    content: m.content as string,
  }))

  // Rebuild system prompt with resume + jobs context
  const [resumeRows] = await pool.query("SELECT parsed_data FROM resume WHERE user_id = ?", [userId])
  const resumeRow = (resumeRows as Record<string, unknown>[])[0]
  const raw = resumeRow?.parsed_data ?? null
  const resume = raw == null ? null : typeof raw === "string" ? JSON.parse(raw) : raw

  const [jobRows] = await pool.query(
    "SELECT title, url, description FROM jobs WHERE user_id = ? ORDER BY id DESC LIMIT 50",
    [userId],
  )
  const jobs = jobRows as Record<string, unknown>[]

  const system = `You are Jev, a sharp career advisor. The user has a resume and scraped LinkedIn job listings. Help them with job search strategy, resume improvement, interview prep, or any career questions.

Be direct, specific, and actionable.

## User's Resume
${JSON.stringify(resume, null, 2)}

## Their Job Listings (${jobs.length} total)
${jobs.map((j, i) => `${i + 1}. ${j.title} — ${j.url}`).join("\n")}`

  // Stream response
  let fullResponse = ""
  const stream = await streamClaude(apiKey, system, messages)
  const sseStream = parseSSEStream(stream, (text) => { fullResponse += text })

  const { readable, writable } = new TransformStream()
  const writer = writable.getWriter()

  const reader = sseStream.getReader()
  ;(async () => {
    try {
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        await writer.write(value)
      }
      await pool.query(
        "INSERT INTO jev_messages (conversation_id, role, content) VALUES (?, 'assistant', ?)",
        [id, fullResponse],
      )
      await writer.close()
    } catch {
      await writer.close()
    }
  })()

  return new Response(readable, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  })
}
