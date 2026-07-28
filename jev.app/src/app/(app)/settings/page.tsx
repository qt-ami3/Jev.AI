"use client"

import { useEffect, useState } from "react"

export default function Settings() {
  const [key, setKey] = useState("")
  const [hasKey, setHasKey] = useState(false)
  const [status, setStatus] = useState("")
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    fetch("/api/config/claude-key")
      .then((res) => res.json())
      .then((data) => setHasKey(data.hasKey === true))
      .catch(() => {})
  }, [])

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    setStatus("")
    setSaving(true)

    const res = await fetch("/api/config/claude-key", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key }),
    })

    setSaving(false)
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      setStatus(data.error ?? "Failed to save key")
      return
    }
    setHasKey(key.trim() !== "")
    setKey("")
    setStatus(key.trim() !== "" ? "API key saved." : "API key removed.")
  }

  return (
    <div className="max-w-4xl">
      <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">
        Settings
      </h1>

      <section className="mt-8 max-w-md">
        <h2 className="text-lg font-medium text-zinc-900 dark:text-zinc-50">
          Claude API key
        </h2>
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
          Used by the Jev advisor and resume parsing. Your key is stored in your
          account and usage bills to you. Get one at console.anthropic.com.
        </p>
        <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-300">
          {hasKey ? "A key is currently saved." : "No key saved yet."}
        </p>

        <form onSubmit={handleSave} className="mt-3 space-y-3">
          <input
            type="password"
            placeholder="sk-ant-..."
            value={key}
            onChange={(e) => setKey(e.target.value)}
            className="textbox w-full"
          />
          <button
            type="submit"
            disabled={saving}
            className="rounded-md bg-zinc-900 dark:bg-zinc-100 px-4 py-2 text-sm font-medium text-white dark:text-zinc-900 hover:bg-zinc-800 dark:hover:bg-zinc-200 transition-colors disabled:opacity-50"
          >
            {saving ? "Saving..." : hasKey ? "Replace key" : "Save key"}
          </button>
        </form>

        {status && (
          <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-300">{status}</p>
        )}
      </section>
    </div>
  )
}
