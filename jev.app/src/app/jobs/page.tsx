'use client'

import { useEffect, useState } from "react"
import type { Job } from "../api/jobs/route"

export default function Jobs() {
  const [jobs, setJobs] = useState<Job[]>([])
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState<number | null>(null)

  useEffect(() => {
    fetch("/api/jobs")
      .then((r) => r.json())
      .then((data) => {
        setJobs(data)
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [])

  function toggle(id: number) {
    setExpanded((prev) => (prev === id ? null : id))
  }

  return (
    <div className="max-w-4xl">
      <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">
        Jobs
      </h1>

      <br />

      {loading && (
        <p className="text-sm text-zinc-500 dark:text-zinc-400">Loading...</p>
      )}

      {!loading && jobs.length === 0 && (
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          No listings found. Run the parser to populate{" "}
          <code className="font-mono text-xs">scraper/listings/</code>.
        </p>
      )}

      <div className="flex flex-col gap-2">
        {jobs.map((job) => (
          <div
            key={job.id}
            className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 overflow-hidden"
          >
            {/* Header row */}
            <button
              onClick={() => toggle(job.id)}
              className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors"
            >
              <div className="flex flex-col gap-0.5 min-w-0">
                <span className="text-sm font-medium text-zinc-900 dark:text-zinc-50 truncate">
                  {job.title}
                </span>
                {job.url && (
                  <a
                    href={job.url}
                    target="_blank"
                    rel="noreferrer"
                    onClick={(e) => e.stopPropagation()}
                    className="text-xs text-zinc-400 dark:text-zinc-500 hover:text-zinc-600 dark:hover:text-zinc-300 truncate transition-colors"
                  >
                    {job.url}
                  </a>
                )}
              </div>
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className={`flex-shrink-0 ml-3 text-zinc-400 transition-transform duration-200 ${
                  expanded === job.id ? "rotate-180" : ""
                }`}
              >
                <polyline points="6 9 12 15 18 9" />
              </svg>
            </button>

            {/* Description */}
            {expanded === job.id && (
              <div className="px-4 pb-4 border-t border-zinc-100 dark:border-zinc-800">
                <pre className="mt-3 text-xs text-zinc-700 dark:text-zinc-300 whitespace-pre-wrap font-mono leading-relaxed">
                  {job.description || "(no description)"}
                </pre>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
