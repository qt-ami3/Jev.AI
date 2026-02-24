export async function handleGettingStarted() {
  const res = await fetch("/api/config")
  const config = await res.json()

  console.log("resume uploaded:",config.progress?.resume)
}
