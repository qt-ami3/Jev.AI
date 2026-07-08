'use client'

import { useEffect, useState } from "react"
import type { Job } from "../../api/jobs/route"

function JobDetail({ job, description, onClose }: { job: Job; description: string | null; onClose: () => void }) {
  return (
    <div className="h-full rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-4 flex flex-col">
      <div className="flex items-start justify-between gap-3 mb-3 flex-shrink-0">
        <div className="flex flex-col gap-0.5 min-w-0">
          <span className="text-sm font-semibold text-zinc-900 dark:text-zinc-50 leading-snug">
            {job.title}
          </span>
          {job.url && (
            <a
              href={job.url}
              target="_blank"
              rel="noreferrer"
              className="text-xs text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 truncate transition-colors"
            >
              {job.url}
            </a>
          )}
        </div>
        <button
          onClick={onClose}
          className="flex-shrink-0 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 transition-colors mt-0.5"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>
      <pre className="flex-1 min-h-0 text-xs text-zinc-700 dark:text-zinc-300 whitespace-pre-wrap font-mono leading-relaxed overflow-y-auto">
        {description === null ? "Loading..." : description || "(no description)"}
      </pre>
    </div>
  )
}

export default function Jobs() {
  const [jobs, setJobs] = useState<Job[]>([])
  const [loading, setLoading] = useState(true)
  const [scraping, setScraping] = useState(false)
  const [scrapeError, setScrapeError] = useState("")
  const [selected, setSelected] = useState<number | null>(null)
  const [descriptions, setDescriptions] = useState<Record<number, string>>({})

  async function loadDescription(id: number) {
    if (descriptions[id] !== undefined) return
    try {
      const res = await fetch(`/api/jobs?id=${id}`)
      if (!res.ok) return
      const data = await res.json()
      setDescriptions((prev) => ({ ...prev, [id]: data.description ?? "" }))
    } catch {}
  }

  async function loadJobs() {
    try {
      const res = await fetch("/api/jobs")
      const data = await res.json()
      setJobs(data)
    } catch {}
    setLoading(false)
  }

  async function runScrape(force = false) {
    setScraping(true)
    setScrapeError("")
    try {
      const scrapeRes = await fetch("/api/scrape", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ force }),
      })
      const scrapeData = await scrapeRes.json()
      if (scrapeData.error) setScrapeError(scrapeData.error)
    } catch (e) {
      setScrapeError("Scrape request failed")
    }
    setScraping(false)
    await loadJobs()
  }

  useEffect(() => {
    let cancelled = false
    async function init() {
      setScraping(true)
      await runScrape()
      if (!cancelled) setLoading(false)
    }
    init()
    return () => { cancelled = true }
  }, [])

  const selectedJob = jobs.find((j) => j.id === selected) ?? null

  return (
    <div className="h-full flex flex-col">

      <div className="flex-shrink-0 flex items-center justify-between pb-4">
        <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">
          Jobs
        </h1>
        <button
          onClick={() => runScrape(true)}
          disabled={scraping}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md border border-zinc-300 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-600 dark:text-zinc-400 disabled:opacity-40 transition-colors"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={scraping ? "animate-spin" : ""}>
            <path d="M21 12a9 9 0 1 1-9-9" /><polyline points="21 3 21 12 12 12" />
          </svg>
          {scraping ? "Scraping..." : "Scrape again"}
        </button>
      </div>

      <div className="flex-1 min-h-0">
        <div className="h-full">

          {scraping && (
            <p className="text-sm text-zinc-500 dark:text-zinc-400">Scraping new job postings...</p>
          )}

          {!scraping && loading && (
            <p className="text-sm text-zinc-500 dark:text-zinc-400">Loading...</p>
          )}

          {!scraping && !loading && jobs.length === 0 && (
            <div className="flex flex-col gap-2">
              <p className="text-sm text-zinc-500 dark:text-zinc-400">
                No listings found. Click &quot;Scrape again&quot; to retry.
              </p>
              {scrapeError && (
                <p className="text-xs text-red-500 font-mono whitespace-pre-wrap">{scrapeError}</p>
              )}
            </div>
          )}

          {jobs.length > 0 && (
            <div className="lg:h-full flex flex-col lg:flex-row gap-3">

              {/* Vertical carousel — scrolls within its column */}
              <div className="lg:w-72 flex-shrink-0 flex flex-col gap-2 overflow-y-auto max-h-[420px] lg:max-h-none snap-y snap-mandatory scroll-smooth [scrollbar-width:thin]">
                {jobs.map((job) => (
                  <button
                    key={job.id}
                    onClick={() => {
                      setSelected((prev) => (prev === job.id ? null : job.id))
                      loadDescription(job.id)
                      if (!job.read_at) {
                        fetch("/api/jobs", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: job.id }) })
                        setJobs((prev) => prev.map((j) => j.id === job.id ? { ...j, read_at: new Date().toISOString() } : j))
                      }
                    }}
                    className={`flex-shrink-0 snap-start w-full text-left rounded-lg border p-4 flex flex-col gap-1.5 transition-colors ${
                      selected === job.id
                        ? "border-zinc-500 dark:border-zinc-400 bg-zinc-100 dark:bg-zinc-800"
                        : "border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 hover:border-zinc-400 dark:hover:border-zinc-600"
                    }`}
                  >
                    <span className="text-sm font-medium text-zinc-900 dark:text-zinc-50 leading-snug flex items-center gap-1.5">
                      {!job.read_at && <span className="w-1.5 h-1.5 rounded-full bg-blue-500 flex-shrink-0" />}
                      {job.title}
                    </span>
                    <span className="text-xs text-zinc-400 dark:text-zinc-500 truncate">
                      {job.url ? new URL(job.url).hostname : ""}
                    </span>
                    <p className="text-xs text-zinc-500 dark:text-zinc-400 line-clamp-2 leading-relaxed">
                      {job.preview}
                    </p>
                  </button>
                ))}
              </div>

              {/* Detail panel */}
              <div className="flex-1 min-w-0 min-h-0">

                {/* Mobile: animated drop-down */}
                <div className={`lg:hidden grid transition-[grid-template-rows] duration-300 ease-in-out ${selectedJob ? "grid-rows-[1fr]" : "grid-rows-[0fr]"}`}>
                  <div className="overflow-hidden">
                    <div className="pt-2">
                      {selectedJob && <JobDetail job={selectedJob} description={descriptions[selectedJob.id] ?? null} onClose={() => setSelected(null)} />}
                    </div>
                  </div>
                </div>

                {/* Desktop: fills remaining space */}
                <div className="hidden lg:flex flex-col h-full">
                  {selectedJob ? (
                    <JobDetail job={selectedJob} description={descriptions[selectedJob.id] ?? null} onClose={() => setSelected(null)} />
                  ) : (
                    <div className="flex-1 flex items-center justify-center rounded-lg border border-dashed border-zinc-200 dark:border-zinc-800 text-sm text-zinc-400 dark:text-zinc-600">
                      select a listing
                    </div>
                  )}
                </div>

              </div>
            </div>
          )}

        </div>
      </div>

    </div>
  )
}
