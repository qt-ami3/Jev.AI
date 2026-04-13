'use client'

import Link from "next/link"
import { useState, useRef, useEffect } from "react"
import { uploadResume } from "./TS/gettingStarted"

interface JobPrefsForm {
  keywords: string
  location: string
  distance: string
  workTypes: string[]
  expLevels: string[]
}

interface JobStats {
  total: number
  unread: number
  recent: { id: number; title: string; url: string; scraped_at: string }[]
}

export default function Dashboard() {
  const [showModal, setShowModal] = useState(false)
  const [setupComplete, setSetupComplete] = useState(false)
  const [step, setStep] = useState(0)
  const [file, setFile] = useState<File | null>(null)
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [form, setForm] = useState<JobPrefsForm>({
    keywords: "",
    location: "",
    distance: "50",
    workTypes: ["1", "2", "3"],
    expLevels: ["1", "2"],
  })
  const [locationError, setLocationError] = useState<string | null>(null)
  const [savingPrefs, setSavingPrefs] = useState(false)
  const [prefsError, setPrefsError] = useState<string | null>(null)
  const [stats, setStats] = useState<JobStats | null>(null)

  // On mount: auto-open modal at the first incomplete step
  useEffect(() => {
    fetch("/api/config")
      .then((r) => r.json())
      .then(async (config) => {
        const resumeDone =
          config.progress?.resume === true || config.progress?.resume === "true"
        const prefsDone =
          config.progress?.jobPrefs === true || config.progress?.jobPrefs === "true"
        const sub = config.progress?.subscription
        const subDone =
          sub === true || sub === "true" || sub === "n/a" || sub === undefined

        // Fetch job stats
        fetch("/api/jobs?stats=1").then(r => r.json()).then(setStats).catch(() => {})

        if (resumeDone && prefsDone && subDone) {
          setSetupComplete(true)
          return
        }

        if (resumeDone && !prefsDone) {
          const scraperRes = await fetch("/api/config/jobprefs")
          const scraperData = await scraperRes.json()
          if (scraperData.keywords) {
            setForm({
              keywords: String(scraperData.keywords.keywords ?? ""),
              location: String(scraperData.keywords.location ?? "").trim(),
              distance: String(scraperData.keywords.distance ?? "50").trim(),
              workTypes: String(scraperData.keywords.f_WT ?? "1,2,3")
                .split(",")
                .map((s: string) => s.trim()),
              expLevels: String(scraperData.keywords.f_E ?? "1,2")
                .split(",")
                .map((s: string) => s.trim()),
            })
          }
          setStep(1)
        } else {
          setStep(0)
        }
        setShowModal(true)
      })
      .catch(() => {})
  }, [])

  async function handleUpload() {
    if (!file) return
    setUploading(true)
    setUploadError(null)
    const result = await uploadResume(file)
    setUploading(false)
    if (result.error) {
      setUploadError(result.error)
      return
    }
    // Load current scraper config to pre-fill the job prefs form
    const scraperRes = await fetch("/api/config/jobprefs")
    const scraperData = await scraperRes.json()
    if (scraperData.keywords) {
      setForm({
        keywords: String(scraperData.keywords.keywords ?? ""),
        location: String(scraperData.keywords.location ?? "").trim(),
        distance: String(scraperData.keywords.distance ?? "50").trim(),
        workTypes: String(scraperData.keywords.f_WT ?? "1,2,3")
          .split(",")
          .map((s: string) => s.trim()),
        expLevels: String(scraperData.keywords.f_E ?? "1,2")
          .split(",")
          .map((s: string) => s.trim()),
      })
    }
    setFile(null)
    setStep(1)
  }

  async function handleSavePrefs() {
    setSavingPrefs(true)
    setPrefsError(null)
    setLocationError(null)

    const parts = form.location.split(",").map((s) => s.trim()).filter(Boolean)
    if (parts.length < 2) {
      setLocationError("Enter city and state — e.g. Lowell, Massachusetts")
      setSavingPrefs(false)
      return
    }

    const city = parts[0]
    const state = parts[1]
    const locRes = await fetch(
      `/api/location?city=${encodeURIComponent(city)}&state=${encodeURIComponent(state)}`
    )
    const locData = await locRes.json()
    if (!locData.valid) {
      setLocationError(
        locData.error ?? `"${city}, ${state}" was not found in US locations`
      )
      setSavingPrefs(false)
      return
    }

    const normalizedLocation =
      parts.length >= 3 ? form.location : `${city}, ${state}, United States`

    const res = await fetch("/api/config/jobprefs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        keywords: form.keywords,
        location: normalizedLocation,
        distance: form.distance,
        f_WT: form.workTypes.join(","),
        f_E: form.expLevels.join(","),
      }),
    })
    const data = await res.json()
    setSavingPrefs(false)
    if (!res.ok) {
      setPrefsError(data.error ?? "Failed to save preferences")
    } else {
      setShowModal(false)
      setStep(0)
    }
  }

  function toggleWorkType(val: string) {
    setForm((prev) => ({
      ...prev,
      workTypes: prev.workTypes.includes(val)
        ? prev.workTypes.filter((v) => v !== val)
        : [...prev.workTypes, val],
    }))
  }

  function toggleExpLevel(val: string) {
    setForm((prev) => ({
      ...prev,
      expLevels: prev.expLevels.includes(val)
        ? prev.expLevels.filter((v) => v !== val)
        : [...prev.expLevels, val],
    }))
  }

  function closeModal() {
    setShowModal(false)
    setStep(0)
    setFile(null)
    setUploadError(null)
    setLocationError(null)
    setPrefsError(null)
  }

  const inputCls =
    "w-full px-3 py-1.5 text-sm rounded-md border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-50 outline-none focus:border-zinc-500 dark:focus:border-zinc-400 transition-colors"

  return (
    <div className="max-w-4xl">
      <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">
        Dashboard
      </h1>

      {/* ── Job Stats Widgets ── */}
      {stats && stats.total > 0 && (
        <div className="mt-6 grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-4">
            <p className="text-xs font-medium text-zinc-400 dark:text-zinc-500 uppercase tracking-wider">Total Jobs</p>
            <p className="mt-1 text-2xl font-semibold text-zinc-900 dark:text-zinc-50">{stats.total}</p>
          </div>
          <Link href="/jobs" className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-4 hover:border-zinc-400 dark:hover:border-zinc-600 transition-colors">
            <p className="text-xs font-medium text-zinc-400 dark:text-zinc-500 uppercase tracking-wider">Unread</p>
            <p className="mt-1 text-2xl font-semibold text-zinc-900 dark:text-zinc-50 flex items-center gap-2">
              {stats.unread}
              {stats.unread > 0 && <span className="w-2 h-2 rounded-full bg-blue-500" />}
            </p>
          </Link>
          <Link href="/jev" className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-4 hover:border-zinc-400 dark:hover:border-zinc-600 transition-colors">
            <p className="text-xs font-medium text-zinc-400 dark:text-zinc-500 uppercase tracking-wider">Jev Analysis</p>
            <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">Get job recommendations →</p>
          </Link>
        </div>
      )}

      {/* ── Unread Jobs Preview ── */}
      {stats && stats.recent.length > 0 && (
        <div className="mt-6">
          <h2 className="text-xs font-semibold uppercase tracking-widest text-zinc-400 dark:text-zinc-500 mb-3">New Listings</h2>
          <div className="flex flex-col gap-2">
            {stats.recent.map((job) => (
              <Link
                key={job.id}
                href="/jobs"
                className="flex items-center gap-3 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-3 hover:border-zinc-400 dark:hover:border-zinc-600 transition-colors"
              >
                <span className="w-1.5 h-1.5 rounded-full bg-blue-500 flex-shrink-0" />
                <span className="text-sm font-medium text-zinc-900 dark:text-zinc-50 truncate">{job.title}</span>
                <span className="ml-auto text-xs text-zinc-400 dark:text-zinc-500 flex-shrink-0">
                  {new Date(job.scraped_at).toLocaleDateString()}
                </span>
              </Link>
            ))}
          </div>
        </div>
      )}

      <div className="mt-6" />

      {!setupComplete && <button
        onClick={() => setShowModal(true)}
        className="textbox group relative pr-6"
        style={{ marginLeft: "5px" }}
      >
        &nbsp;Getting Started&nbsp;
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="11"
          height="11"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 transition-opacity"
        >
          <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
          <polyline points="15 3 21 3 21 9" />
          <line x1="10" y1="14" x2="21" y2="3" />
        </svg>
      </button>}

      {showModal && (
        <div className="fixed inset-0 flex items-center justify-center bg-black/50 z-50">
          {/* Outer modal: fixed width, clips the off-screen panel */}
          <div className="bg-white dark:bg-zinc-900 rounded-lg shadow-xl w-80 overflow-hidden">
            {/* Sliding container: two panels side by side */}
            <div
              className="flex transition-transform duration-500 ease-in-out"
              style={{ transform: `translateX(-${step * 320}px)` }}
            >
              {/* ── Panel 0: Upload Resume ── */}
              <div className="w-80 flex-shrink-0 p-6 flex flex-col gap-4">
                <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">
                  Upload Resume
                </h2>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".pdf,.docx"
                  onChange={(e) => {
                    setFile(e.target.files?.[0] ?? null)
                    setUploadError(null)
                  }}
                  className="hidden"
                />
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-md border-2 border-dashed border-zinc-400 dark:border-zinc-600 hover:border-zinc-700 dark:hover:border-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors w-full justify-center"
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                    <polyline points="17 8 12 3 7 8" />
                    <line x1="12" y1="3" x2="12" y2="15" />
                  </svg>
                  {file ? file.name : "Browse file"}
                </button>
                {uploadError && (
                  <p className="text-sm text-red-500">{uploadError}</p>
                )}
                <div className="flex gap-2 justify-end">
                  <button
                    onClick={closeModal}
                    className="px-4 py-2 text-sm rounded-md border border-zinc-300 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleUpload}
                    disabled={!file || uploading}
                    className="px-4 py-2 text-sm rounded-md bg-zinc-900 dark:bg-zinc-50 text-white dark:text-zinc-900 disabled:opacity-40"
                  >
                    {uploading ? "Uploading..." : "Upload"}
                  </button>
                </div>
              </div>

              {/* ── Panel 1: Job Preferences ── */}
              <div className="w-80 flex-shrink-0 p-6 flex flex-col gap-3">
                <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">
                  Job Preferences
                </h2>

                <div className="flex flex-col gap-1">
                  <label className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
                    Keywords
                  </label>
                  <input
                    type="text"
                    value={form.keywords}
                    onChange={(e) =>
                      setForm((prev) => ({ ...prev, keywords: e.target.value }))
                    }
                    placeholder="e.g. Software Intern"
                    className={inputCls}
                  />
                </div>

                <div className="flex flex-col gap-1">
                  <label className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
                    Location
                  </label>
                  <input
                    type="text"
                    value={form.location}
                    onChange={(e) => {
                      setForm((prev) => ({ ...prev, location: e.target.value }))
                      setLocationError(null)
                    }}
                    placeholder="e.g. Lowell, Massachusetts"
                    className={inputCls}
                  />
                  {locationError && (
                    <p className="text-xs text-red-500">{locationError}</p>
                  )}
                </div>

                <div className="flex flex-col gap-1">
                  <label className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
                    Distance
                  </label>
                  <select
                    value={form.distance}
                    onChange={(e) =>
                      setForm((prev) => ({ ...prev, distance: e.target.value }))
                    }
                    className={inputCls}
                  >
                    {["10", "25", "50", "100"].map((d) => (
                      <option key={d} value={d}>
                        {d} miles
                      </option>
                    ))}
                  </select>
                </div>

                <div className="flex flex-col gap-1">
                  <label className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
                    Work Type
                  </label>
                  <div className="flex flex-col gap-1">
                    {(
                      [
                        ["1", "On-site"],
                        ["2", "Remote"],
                        ["3", "Hybrid"],
                      ] as [string, string][]
                    ).map(([val, label]) => (
                      <label
                        key={val}
                        className="flex items-center gap-2 text-sm text-zinc-700 dark:text-zinc-300 cursor-pointer"
                      >
                        <input
                          type="checkbox"
                          checked={form.workTypes.includes(val)}
                          onChange={() => toggleWorkType(val)}
                          className="accent-zinc-700 dark:accent-zinc-300"
                        />
                        {label}
                      </label>
                    ))}
                  </div>
                </div>

                <div className="flex flex-col gap-1">
                  <label className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
                    Experience Level
                  </label>
                  <div className="flex flex-col gap-1">
                    {(
                      [
                        ["1", "Intern"],
                        ["2", "Entry Level"],
                      ] as [string, string][]
                    ).map(([val, label]) => (
                      <label
                        key={val}
                        className="flex items-center gap-2 text-sm text-zinc-700 dark:text-zinc-300 cursor-pointer"
                      >
                        <input
                          type="checkbox"
                          checked={form.expLevels.includes(val)}
                          onChange={() => toggleExpLevel(val)}
                          className="accent-zinc-700 dark:accent-zinc-300"
                        />
                        {label}
                      </label>
                    ))}
                  </div>
                </div>

                {prefsError && (
                  <p className="text-sm text-red-500">{prefsError}</p>
                )}
                <div className="flex gap-2 justify-end pt-1">
                  <button
                    onClick={closeModal}
                    className="px-4 py-2 text-sm rounded-md border border-zinc-300 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleSavePrefs}
                    disabled={savingPrefs || !form.keywords || !form.location}
                    className="px-4 py-2 text-sm rounded-md bg-zinc-900 dark:bg-zinc-50 text-white dark:text-zinc-900 disabled:opacity-40"
                  >
                    {savingPrefs ? "Saving..." : "Save"}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
