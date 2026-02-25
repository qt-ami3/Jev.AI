'use client'

import { useState, useRef } from "react"
import { uploadResume } from "./TS/gettingStarted"

export default function Dashboard() {
  const [showModal, setShowModal] = useState(false)
  const [file, setFile] = useState<File | null>(null)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  async function handleUpload() {
    if (!file) return
    setUploading(true)
    setError(null)
    const result = await uploadResume(file)
    setUploading(false)
    if (result.error) {
      setError(result.error)
    } else {
      setShowModal(false)
      setFile(null)
    }
  }

  return (
    <div className="max-w-4xl">
      <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">
        Dashboard
      </h1>

      <br />

      <button onClick={() => setShowModal(true)} className="textbox group relative pr-6" style={{ marginLeft: "5px" }}>
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
      </button>

      {showModal && (
        <div className="fixed inset-0 flex items-center justify-center bg-black/50 z-50">
          <div className="bg-white dark:bg-zinc-900 rounded-lg p-6 w-80 shadow-xl flex flex-col gap-4">
            <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">Upload Resume</h2>
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,.docx"
              onChange={(e) => { setFile(e.target.files?.[0] ?? null); setError(null) }}
              className="hidden"
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              className="flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-md border-2 border-dashed border-zinc-400 dark:border-zinc-600 hover:border-zinc-700 dark:hover:border-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors w-full justify-center"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                <polyline points="17 8 12 3 7 8"/>
                <line x1="12" y1="3" x2="12" y2="15"/>
              </svg>
              {file ? file.name : "Browse file"}
            </button>
            {error && (
              <p className="text-sm text-red-500">{error}</p>
            )}
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => { setShowModal(false); setFile(null) }}
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
        </div>
      )}
    </div>
  )
}
