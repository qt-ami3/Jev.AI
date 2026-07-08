import pool from "./db"

export async function getClaudeApiKey(userId: string): Promise<string | null> {
  // Prefer the user's own key so their usage bills to them; the server-wide
  // env key is only a fallback.
  const [rows] = await pool.query("SELECT claude_api_key FROM config WHERE user_id = ?", [userId])
  const row = (rows as Record<string, unknown>[])[0]
  const userKey = (row?.claude_api_key as string) || ""
  if (userKey) return userKey
  if (process.env.CLAUDE_API_KEY && process.env.CLAUDE_API_KEY !== "REPLACE_ME") {
    return process.env.CLAUDE_API_KEY
  }
  return null
}

interface ClaudeMessage {
  role: "user" | "assistant"
  content: string
}

export async function streamClaude(
  apiKey: string,
  system: string,
  messages: ClaudeMessage[],
): Promise<ReadableStream<Uint8Array>> {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-sonnet-5",
      max_tokens: 4096,
      // The system prompt (resume + job listings) is identical across turns of
      // a conversation — cache it so follow-ups bill it at cache-read rates.
      system: [{ type: "text", text: system, cache_control: { type: "ephemeral" } }],
      messages,
      stream: true,
    }),
  })

  if (!res.ok) {
    const err = await res.text()
    throw new Error(`Claude API error ${res.status}: ${err}`)
  }

  return res.body!
}

export function parseSSEStream(
  body: ReadableStream<Uint8Array>,
  onText: (text: string) => void,
): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder()
  const decoder = new TextDecoder()
  let buffer = ""

  return new ReadableStream({
    async start(controller) {
      const reader = body.getReader()
      try {
        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          buffer += decoder.decode(value, { stream: true })
          const lines = buffer.split("\n")
          buffer = lines.pop()!
          for (const line of lines) {
            if (!line.startsWith("data: ")) continue
            const data = line.slice(6)
            if (data === "[DONE]") continue
            try {
              const parsed = JSON.parse(data)
              if (parsed.type === "content_block_delta" && parsed.delta?.text) {
                const text = parsed.delta.text
                onText(text)
                controller.enqueue(encoder.encode(`data: ${JSON.stringify({ text })}\n\n`))
              }
            } catch {}
          }
        }
        controller.enqueue(encoder.encode("data: [DONE]\n\n"))
        controller.close()
      } catch (err) {
        controller.error(err)
      }
    },
  })
}
