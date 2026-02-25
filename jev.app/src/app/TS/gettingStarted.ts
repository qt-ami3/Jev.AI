export async function uploadResume(file: File): Promise<{ error?: string }> {
  const form = new FormData()
  form.append("resume", file)

  const res = await fetch("/api/config", { method: "POST", body: form })
  const data = await res.json()

  if (!res.ok) return { error: data.error }
  return {}
}
