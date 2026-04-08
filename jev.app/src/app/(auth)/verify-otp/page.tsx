"use client"

import { signIn } from "next-auth/react"
import { useRouter, useSearchParams } from "next/navigation"
import { Suspense, useRef, useState } from "react"

export default function VerifyOTPPage() {
  return (
    <Suspense>
      <VerifyOTPForm />
    </Suspense>
  )
}

function VerifyOTPForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const email = searchParams.get("email") ?? ""
  const type = searchParams.get("type") ?? "login"
  const isVerify = type === "verify"
  const [code, setCode] = useState(["", "", "", "", "", ""])
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(false)
  const inputs = useRef<(HTMLInputElement | null)[]>([])

  function handleChange(index: number, value: string) {
    if (!/^\d*$/.test(value)) return
    const next = [...code]
    next[index] = value.slice(-1)
    setCode(next)
    if (value && index < 5) inputs.current[index + 1]?.focus()
  }

  function handleKeyDown(index: number, e: React.KeyboardEvent) {
    if (e.key === "Backspace" && !code[index] && index > 0) {
      inputs.current[index - 1]?.focus()
    }
  }

  function handlePaste(e: React.ClipboardEvent) {
    const pasted = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6)
    if (pasted.length === 6) {
      setCode(pasted.split(""))
      inputs.current[5]?.focus()
      e.preventDefault()
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const token = code.join("")
    if (token.length !== 6) return

    setError("")
    setLoading(true)

    if (isVerify) {
      const res = await fetch("/api/auth/verify-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, token }),
      })
      const data = await res.json()
      setLoading(false)
      if (!res.ok) {
        setError(data.error ?? "Verification failed")
      } else {
        router.push("/login")
      }
    } else {
      const res = await signIn("otp", {
        email,
        token,
        redirect: false,
      })
      setLoading(false)
      if (res?.error) {
        setError("Invalid or expired code")
      } else {
        router.push("/")
      }
    }
  }

  async function handleResend() {
    setError("")
    if (isVerify) {
      const res = await fetch("/api/auth/resend-verification", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      })
      if (!res.ok) {
        const data = await res.json()
        setError(data.error ?? "Failed to resend")
      }
    } else {
      await signIn("otp", { email, redirect: false })
    }
  }

  return (
    <div className="w-full max-w-sm space-y-6">
      <div className="text-center">
        <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-100">Check your email</h1>
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
          {isVerify ? "We sent a verification code to" : "We sent a 6-digit code to"}{" "}
          <strong className="text-zinc-900 dark:text-zinc-100">{email}</strong>
        </p>
      </div>

      {error && (
        <p className="text-sm text-red-500 text-center">{error}</p>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="flex justify-center gap-2" onPaste={handlePaste}>
          {code.map((digit, i) => (
            <input
              key={i}
              ref={(el) => { inputs.current[i] = el }}
              type="text"
              inputMode="numeric"
              maxLength={1}
              value={digit}
              onChange={(e) => handleChange(i, e.target.value)}
              onKeyDown={(e) => handleKeyDown(i, e)}
              className="textbox w-12 h-14 text-center text-xl"
            />
          ))}
        </div>
        <button
          type="submit"
          disabled={loading || code.join("").length !== 6}
          className="w-full rounded-md bg-zinc-900 dark:bg-zinc-100 px-4 py-2.5 text-sm font-medium text-white dark:text-zinc-900 hover:bg-zinc-800 dark:hover:bg-zinc-200 transition-colors disabled:opacity-50"
        >
          {loading ? "Verifying..." : "Verify"}
        </button>
      </form>

      <p className="text-center text-sm text-zinc-500 dark:text-zinc-400">
        Didn't receive it?{" "}
        <button
          type="button"
          onClick={handleResend}
          className="text-zinc-900 dark:text-zinc-100 underline"
        >
          Resend code
        </button>
      </p>
    </div>
  )
}
