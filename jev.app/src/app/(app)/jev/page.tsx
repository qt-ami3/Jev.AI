'use client'

import { useEffect, useRef, useState } from "react"

interface Conversation { id: string; title: string; created_at: string }
interface Message { role: "user" | "assistant"; content: string; created_at: string }

export default function JevPage() {
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [activeId, setActiveId] = useState<string | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState("")
  const [streaming, setStreaming] = useState(false)
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState("")
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const [search, setSearch] = useState("")
  const messagesEnd = useRef<HTMLDivElement>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)

  function scrollToBottom() {
    messagesEnd.current?.scrollIntoView({ behavior: "smooth" })
  }

  useEffect(() => { scrollToBottom() }, [messages])

  // Close dropdown on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false)
      }
    }
    document.addEventListener("mousedown", handleClick)
    return () => document.removeEventListener("mousedown", handleClick)
  }, [])

  // Load conversations on mount
  useEffect(() => {
    fetchConversations().then((convs) => {
      if (convs.length > 0) {
        loadConversation(convs[0].id)
      }
      setLoading(false)
    })
  }, [])

  async function fetchConversations(q = ""): Promise<Conversation[]> {
    const res = await fetch(`/api/jev?q=${encodeURIComponent(q)}`)
    const data = await res.json()
    setConversations(data)
    return data
  }

  async function loadConversation(id: string) {
    setActiveId(id)
    setDropdownOpen(false)
    const res = await fetch(`/api/jev/${id}`)
    const data = await res.json()
    setMessages(data.messages ?? [])
  }

  async function handleNewAnalysis() {
    setCreating(true)
    setError("")
    setMessages([])

    try {
      const res = await fetch("/api/jev", { method: "POST" })
      if (!res.ok) {
        const data = await res.json()
        setError(data.error ?? "Failed to start analysis")
        setCreating(false)
        return
      }

      // Stream the response
      const reader = res.body!.getReader()
      const decoder = new TextDecoder()
      let buffer = ""
      let convId = ""
      let assistantContent = ""
      setStreaming(true)

      // Add placeholder messages
      setMessages([
        { role: "user", content: "Analyze these jobs against my resume. Which are the best matches and why? What should I focus on?", created_at: new Date().toISOString() },
        { role: "assistant", content: "", created_at: new Date().toISOString() },
      ])

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
            if (parsed.conversationId) {
              convId = parsed.conversationId
              setActiveId(convId)
            }
            if (parsed.text) {
              assistantContent += parsed.text
              setMessages((prev) => {
                const updated = [...prev]
                updated[updated.length - 1] = { ...updated[updated.length - 1], content: assistantContent }
                return updated
              })
            }
          } catch {}
        }
      }

      setStreaming(false)
      setCreating(false)
      fetchConversations()
    } catch {
      setError("Failed to connect")
      setCreating(false)
      setStreaming(false)
    }
  }

  async function handleSend(e: React.FormEvent) {
    e.preventDefault()
    if (!input.trim() || !activeId || streaming) return

    const userMsg = input.trim()
    setInput("")
    setMessages((prev) => [
      ...prev,
      { role: "user", content: userMsg, created_at: new Date().toISOString() },
      { role: "assistant", content: "", created_at: new Date().toISOString() },
    ])
    setStreaming(true)

    try {
      const res = await fetch(`/api/jev/${activeId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: userMsg }),
      })

      if (!res.ok) {
        const data = await res.json()
        setMessages((prev) => {
          const updated = [...prev]
          updated[updated.length - 1] = { ...updated[updated.length - 1], content: `Error: ${data.error}` }
          return updated
        })
        setStreaming(false)
        return
      }

      const reader = res.body!.getReader()
      const decoder = new TextDecoder()
      let buffer = ""
      let assistantContent = ""

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
            if (parsed.text) {
              assistantContent += parsed.text
              setMessages((prev) => {
                const updated = [...prev]
                updated[updated.length - 1] = { ...updated[updated.length - 1], content: assistantContent }
                return updated
              })
            }
          } catch {}
        }
      }
    } catch {
      setMessages((prev) => {
        const updated = [...prev]
        updated[updated.length - 1] = { ...updated[updated.length - 1], content: "Error: Connection failed" }
        return updated
      })
    }
    setStreaming(false)
  }

  async function handleSearch(q: string) {
    setSearch(q)
    await fetchConversations(q)
  }

  const filtered = conversations

  if (loading) {
    return (
      <div className="h-full flex flex-col">
        <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50 pb-4">Jev</h1>
        <p className="text-sm text-zinc-500">Loading...</p>
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col">

      {/* Header */}
      <div className="flex-shrink-0 flex items-center justify-between pb-4">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">Jev</h1>

          {/* Conversation dropdown */}
          <div className="relative" ref={dropdownRef}>
            <button
              onClick={() => setDropdownOpen(!dropdownOpen)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md border border-zinc-300 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-600 dark:text-zinc-400 transition-colors max-w-[260px]"
            >
              <span className="truncate">
                {activeId ? conversations.find((c) => c.id === activeId)?.title ?? "Select" : "No conversation"}
              </span>
              <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="flex-shrink-0">
                <polyline points="6 9 12 15 18 9" />
              </svg>
            </button>

            {dropdownOpen && (
              <div className="absolute left-0 top-full mt-1 w-72 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 shadow-lg z-50">
                <div className="p-2 border-b border-zinc-100 dark:border-zinc-800">
                  <input
                    type="text"
                    placeholder="Search conversations..."
                    value={search}
                    onChange={(e) => handleSearch(e.target.value)}
                    className="w-full px-2.5 py-1.5 text-xs rounded-md border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 outline-none focus:border-zinc-400 dark:focus:border-zinc-500"
                  />
                </div>
                <div className="max-h-60 overflow-y-auto py-1">
                  {filtered.length === 0 ? (
                    <p className="px-3 py-2 text-xs text-zinc-400">No conversations found</p>
                  ) : (
                    filtered.map((conv) => (
                      <button
                        key={conv.id}
                        onClick={() => loadConversation(conv.id)}
                        className={`w-full text-left px-3 py-2 text-xs transition-colors ${
                          conv.id === activeId
                            ? "bg-zinc-100 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100"
                            : "text-zinc-600 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-800/50"
                        }`}
                      >
                        <span className="font-medium block truncate">{conv.title}</span>
                        <span className="text-[10px] text-zinc-400 dark:text-zinc-500">
                          {new Date(conv.created_at).toLocaleString()}
                        </span>
                      </button>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        <button
          onClick={handleNewAnalysis}
          disabled={creating || streaming}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 hover:bg-zinc-800 dark:hover:bg-zinc-200 disabled:opacity-40 transition-colors"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
          </svg>
          New analysis
        </button>
      </div>

      {error && (
        <p className="flex-shrink-0 text-sm text-red-500 pb-3">{error}</p>
      )}

      {/* Messages */}
      <div className="flex-1 min-h-0 overflow-y-auto rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 mb-3">
        {messages.length === 0 && !creating ? (
          <div className="h-full flex items-center justify-center">
            <div className="text-center">
              <p className="text-sm text-zinc-400 dark:text-zinc-500 mb-2">
                {conversations.length === 0
                  ? "No conversations yet"
                  : "Select a conversation or start a new analysis"}
              </p>
              {conversations.length === 0 && (
                <p className="text-xs text-zinc-400 dark:text-zinc-500">
                  Click &quot;New analysis&quot; to compare your resume against scraped jobs
                </p>
              )}
            </div>
          </div>
        ) : (
          <div className="p-4 space-y-4">
            {messages.map((msg, i) => (
              <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                <div
                  className={`max-w-[85%] rounded-lg px-4 py-3 text-sm leading-relaxed ${
                    msg.role === "user"
                      ? "bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900"
                      : "bg-zinc-100 dark:bg-zinc-800 text-zinc-800 dark:text-zinc-200"
                  }`}
                >
                  {msg.role === "assistant" ? (
                    <div className="whitespace-pre-wrap">
                      {msg.content || (
                        <span className="inline-flex gap-1">
                          <span className="w-1.5 h-1.5 rounded-full bg-zinc-400 animate-bounce [animation-delay:0ms]" />
                          <span className="w-1.5 h-1.5 rounded-full bg-zinc-400 animate-bounce [animation-delay:150ms]" />
                          <span className="w-1.5 h-1.5 rounded-full bg-zinc-400 animate-bounce [animation-delay:300ms]" />
                        </span>
                      )}
                    </div>
                  ) : (
                    <div className="whitespace-pre-wrap">{msg.content}</div>
                  )}
                </div>
              </div>
            ))}
            <div ref={messagesEnd} />
          </div>
        )}
      </div>

      {/* Input */}
      <form onSubmit={handleSend} className="flex-shrink-0 flex gap-2">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={activeId ? "Ask Jev for advice..." : "Start a new analysis first"}
          disabled={!activeId || streaming}
          className="flex-1 px-4 py-2.5 text-sm rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 outline-none focus:border-zinc-500 dark:focus:border-zinc-400 disabled:opacity-40 transition-colors"
        />
        <button
          type="submit"
          disabled={!input.trim() || !activeId || streaming}
          className="px-4 py-2.5 text-sm font-medium rounded-lg bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 hover:bg-zinc-800 dark:hover:bg-zinc-200 disabled:opacity-40 transition-colors"
        >
          Send
        </button>
      </form>
    </div>
  )
}
