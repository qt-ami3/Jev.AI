'use client'

import { useEffect, useRef, useState } from "react"

interface Education { school: string; degree: string; date: string }
interface Experience { company: string; title: string; dates: string; highlights: string[] }
interface Project { name: string; dates: string; highlights: string[] }
interface Skills { frontend: string[]; backend: string[]; soft: string[] }
interface Resume {
  name: string; email: string; phone: string
  linkedin: string; github: string
  education: Education[]; experience: Experience[]; projects: Project[]; skills: Skills
}
interface JobPrefs {
  keywords: string; location: string; distance: string
  workTypes: string[]; expLevels: string[]
}

type SkillCat = "frontend" | "backend" | "soft"

function SkillTag({ value, onDelete, onEdit }: { value: string; onDelete: () => void; onEdit: (v: string) => void }) {
  const [editing, setEditing] = useState(false)
  const [editVal, setEditVal] = useState(value)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => { if (editing) inputRef.current?.focus() }, [editing])

  function commit() {
    const v = editVal.trim()
    if (v && v !== value) onEdit(v)
    setEditing(false)
  }

  if (editing) {
    return (
      <input
        ref={inputRef}
        value={editVal}
        onChange={(e) => setEditVal(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => { if (e.key === "Enter") commit(); if (e.key === "Escape") setEditing(false) }}
        className="px-2 py-0.5 text-xs rounded-md border-2 border-green-400 dark:border-green-600 bg-green-50 dark:bg-green-950 text-zinc-900 dark:text-zinc-50 outline-none w-24"
      />
    )
  }

  return (
    <div className="group/skill flex items-center">
      {/* Delete — slides in from left, red */}
      <button
        onClick={onDelete}
        tabIndex={-1}
        className="w-0 overflow-hidden group-hover/skill:w-5 transition-[width] duration-150 flex-shrink-0 self-stretch flex items-center justify-center rounded-l-md bg-red-100 dark:bg-red-950 hover:bg-red-200 dark:hover:bg-red-900 text-red-500 dark:text-red-400 text-xs leading-none"
      >×</button>
      <span className="px-2 py-0.5 text-xs bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 rounded-md group-hover/skill:rounded-none transition-[border-radius] duration-150">
        {value}
      </span>
      {/* Edit — slides in from right, green */}
      <button
        onClick={() => { setEditVal(value); setEditing(true) }}
        tabIndex={-1}
        className="w-0 overflow-hidden group-hover/skill:w-5 transition-[width] duration-150 flex-shrink-0 self-stretch flex items-center justify-center rounded-r-md bg-green-100 dark:bg-green-950 hover:bg-green-200 dark:hover:bg-green-900 text-green-600 dark:text-green-400 text-xs leading-none"
      >✎</button>
    </div>
  )
}

function AddSkillButton({ onAdd }: { onAdd: (v: string) => void }) {
  const [open, setOpen] = useState(false)
  const [val, setVal] = useState("")
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => { if (open) inputRef.current?.focus() }, [open])

  function commit() {
    const v = val.trim()
    if (v) onAdd(v)
    setVal("")
    setOpen(false)
  }

  if (open) {
    return (
      <input
        ref={inputRef}
        value={val}
        onChange={(e) => setVal(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => { if (e.key === "Enter") commit(); if (e.key === "Escape") { setVal(""); setOpen(false) } }}
        className="px-2 py-0.5 text-xs rounded-md border-2 border-green-400 dark:border-green-600 bg-green-50 dark:bg-green-950 text-zinc-900 dark:text-zinc-50 outline-none w-24"
      />
    )
  }

  return (
    <button
      onClick={() => setOpen(true)}
      className="px-2 py-0.5 text-xs rounded-md bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-700 text-zinc-400 dark:text-zinc-500 transition-colors"
    >+</button>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-3">
      <h2 className="text-xs font-semibold uppercase tracking-widest text-zinc-400 dark:text-zinc-500">
        {title}
      </h2>
      {children}
    </div>
  )
}

function Card({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-4">
      {children}
    </div>
  )
}

interface EditForm {
  keywords: string; location: string; distance: string
  workTypes: string[]; expLevels: string[]
}

const WORK_TYPE_OPTIONS: [string, string][] = [["1", "On-site"], ["2", "Remote"], ["3", "Hybrid"]]
const EXP_LEVEL_OPTIONS: [string, string][] = [["1", "Intern"], ["2", "Entry Level"], ["3", "Associate"], ["4", "Mid-Senior"]]
const WORK_TYPE_LABELS: Record<string, string> = { "On-site": "1", "Remote": "2", "Hybrid": "3" }
const EXP_LEVEL_LABELS: Record<string, string> = { "Intern": "1", "Entry Level": "2", "Associate": "3", "Mid-Senior": "4" }

export default function Profiles() {
  const [resume, setResume] = useState<Resume | null>(null)
  const [jobPrefs, setJobPrefs] = useState<JobPrefs | null>(null)
  const [loading, setLoading] = useState(true)
  const [editOpen, setEditOpen] = useState(false)
  const [form, setForm] = useState<EditForm>({ keywords: "", location: "", distance: "50", workTypes: [], expLevels: [] })
  const [locationError, setLocationError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  type EduForm = { idx: number | null; school: string; degree: string; date: string }
  type ExpForm = { idx: number | null; company: string; title: string; dates: string; highlights: string[] }
  type ProjForm = { idx: number | null; name: string; dates: string; highlights: string[] }
  type ContactForm = { name: string; email: string; phone: string; linkedin: string; github: string }
  const [editEdu, setEditEdu] = useState<EduForm | null>(null)
  const [editExp, setEditExp] = useState<ExpForm | null>(null)
  const [editProj, setEditProj] = useState<ProjForm | null>(null)
  const [editContact, setEditContact] = useState<ContactForm | null>(null)

  function loadProfile() {
    return fetch("/api/profile")
      .then((r) => r.json())
      .then((data) => {
        setResume(data.resume)
        setJobPrefs(data.jobPrefs)
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }

  useEffect(() => { loadProfile() }, [])

  function patchResume(update: Partial<Resume>) {
    fetch("/api/profile", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(update),
    })
  }

  function saveContact(f: ContactForm) {
    setResume((prev) => prev ? { ...prev, ...f } : prev)
    patchResume(f)
    setEditContact(null)
  }

  function saveSkills(updated: Resume) { patchResume({ skills: updated.skills }) }

  // ── Education ──
  function deleteEducation(idx: number) {
    setResume((prev) => {
      if (!prev) return prev
      const next = { ...prev, education: prev.education.filter((_, i) => i !== idx) }
      patchResume({ education: next.education })
      return next
    })
  }

  function saveEducation(f: EduForm) {
    setResume((prev) => {
      if (!prev) return prev
      const entry = { school: f.school, degree: f.degree, date: f.date }
      const edu = f.idx === null
        ? [...prev.education, entry]
        : prev.education.map((e, i) => i === f.idx ? entry : e)
      const next = { ...prev, education: edu }
      patchResume({ education: next.education })
      return next
    })
    setEditEdu(null)
  }

  // ── Experience ──
  function deleteExperience(idx: number) {
    setResume((prev) => {
      if (!prev) return prev
      const next = { ...prev, experience: prev.experience.filter((_, i) => i !== idx) }
      patchResume({ experience: next.experience })
      return next
    })
  }

  function saveExperience(f: ExpForm) {
    setResume((prev) => {
      if (!prev) return prev
      const entry = { company: f.company, title: f.title, dates: f.dates, highlights: f.highlights.filter(Boolean) }
      const exp = f.idx === null
        ? [...(prev.experience ?? []), entry]
        : (prev.experience ?? []).map((e, i) => i === f.idx ? entry : e)
      const next = { ...prev, experience: exp }
      patchResume({ experience: next.experience })
      return next
    })
    setEditExp(null)
  }

  // ── Projects ──
  function deleteProject(idx: number) {
    setResume((prev) => {
      if (!prev) return prev
      const next = { ...prev, projects: prev.projects.filter((_, i) => i !== idx) }
      patchResume({ projects: next.projects })
      return next
    })
  }

  function saveProject(f: ProjForm) {
    setResume((prev) => {
      if (!prev) return prev
      const entry = { name: f.name, dates: f.dates, highlights: f.highlights.filter(Boolean) }
      const projs = f.idx === null
        ? [...prev.projects, entry]
        : prev.projects.map((p, i) => i === f.idx ? entry : p)
      const next = { ...prev, projects: projs }
      patchResume({ projects: next.projects })
      return next
    })
    setEditProj(null)
  }

  function deleteSkill(cat: SkillCat, skill: string) {
    setResume((prev) => {
      if (!prev) return prev
      const next = { ...prev, skills: { ...prev.skills, [cat]: prev.skills[cat].filter((s) => s !== skill) } }
      saveSkills(next)
      return next
    })
  }

  function addSkill(cat: SkillCat, val: string) {
    setResume((prev) => {
      if (!prev) return prev
      const next = { ...prev, skills: { ...prev.skills, [cat]: [...prev.skills[cat], val] } }
      saveSkills(next)
      return next
    })
  }

  function editSkill(cat: SkillCat, old: string, val: string) {
    setResume((prev) => {
      if (!prev) return prev
      const next = { ...prev, skills: { ...prev.skills, [cat]: prev.skills[cat].map((s) => s === old ? val : s) } }
      saveSkills(next)
      return next
    })
  }

  function openEdit() {
    if (!jobPrefs) return
    setForm({
      keywords: jobPrefs.keywords,
      location: jobPrefs.location,
      distance: jobPrefs.distance || "50",
      workTypes: jobPrefs.workTypes.map((w) => WORK_TYPE_LABELS[w] ?? w),
      expLevels: jobPrefs.expLevels.map((e) => EXP_LEVEL_LABELS[e] ?? e),
    })
    setLocationError(null)
    setSaveError(null)
    setEditOpen(true)
  }

  async function handleSave() {
    setSaving(true)
    setSaveError(null)
    setLocationError(null)

    const parts = form.location.split(",").map((s) => s.trim()).filter(Boolean)
    if (parts.length < 2) {
      setLocationError("Enter city and state — e.g. Lowell, Massachusetts")
      setSaving(false)
      return
    }
    const [city, state] = parts
    const locRes = await fetch(`/api/location?city=${encodeURIComponent(city)}&state=${encodeURIComponent(state)}`)
    const locData = await locRes.json()
    if (!locData.valid) {
      setLocationError(locData.error ?? `"${city}, ${state}" not found in US locations`)
      setSaving(false)
      return
    }

    const normalized = parts.length >= 3 ? form.location : `${city}, ${state}, United States`
    const res = await fetch("/api/config/jobprefs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ keywords: form.keywords, location: normalized, distance: form.distance, f_WT: form.workTypes.join(","), f_E: form.expLevels.join(",") }),
    })
    const data = await res.json()
    setSaving(false)
    if (!res.ok) { setSaveError(data.error ?? "Failed to save"); return }
    setEditOpen(false)
    loadProfile()
  }

  function toggleWorkType(val: string) {
    setForm((p) => ({ ...p, workTypes: p.workTypes.includes(val) ? p.workTypes.filter((v) => v !== val) : [...p.workTypes, val] }))
  }

  function toggleExpLevel(val: string) {
    setForm((p) => ({ ...p, expLevels: p.expLevels.includes(val) ? p.expLevels.filter((v) => v !== val) : [...p.expLevels, val] }))
  }

  const inputCls = "w-full px-3 py-1.5 text-sm rounded-md border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-50 outline-none focus:border-zinc-500 dark:focus:border-zinc-400 transition-colors"

  const resumeInputRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const [uploadErr, setUploadErr] = useState<string | null>(null)

  async function handleResumeUpload(file: File) {
    setUploading(true)
    setUploadErr(null)
    const form = new FormData()
    form.append("resume", file)
    const res = await fetch("/api/config", { method: "POST", body: form })
    const data = await res.json()
    setUploading(false)
    if (!res.ok) { setUploadErr(data.error ?? "Upload failed"); return }
    loadProfile()
  }

  if (loading) {
    return (
      <div className="h-full">
        <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">Your profile</h1>
        <p className="mt-4 text-sm text-zinc-500 dark:text-zinc-400">Loading...</p>
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col gap-4">
      <h1 className="flex-shrink-0 text-2xl font-semibold text-zinc-900 dark:text-zinc-50">Your profile</h1>

      {/* ── Contact header ── */}
      <div className="flex-shrink-0">
        <Card>
          <div className="flex items-start justify-between gap-4">
            <div className="flex flex-col gap-1 min-w-0">
              {resume ? (
                <>
                  <span className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">{resume.name}</span>
                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-zinc-500 dark:text-zinc-400 mt-1">
                    {resume.email && <span>{resume.email}</span>}
                    {resume.phone && <span>{resume.phone}</span>}
                    {resume.linkedin && (
                      <a href={resume.linkedin} target="_blank" rel="noreferrer"
                        className="hover:text-zinc-700 dark:hover:text-zinc-200 transition-colors">
                        LinkedIn ↗
                      </a>
                    )}
                    {resume.github && (
                      <a href={resume.github} target="_blank" rel="noreferrer"
                        className="hover:text-zinc-700 dark:hover:text-zinc-200 transition-colors">
                        GitHub ↗
                      </a>
                    )}
                  </div>
                </>
              ) : (
                <span className="text-sm text-zinc-400 dark:text-zinc-500">No resume data — upload a resume to get started</span>
              )}
              {uploadErr && <p className="text-xs text-red-500 mt-1">{uploadErr}</p>}
            </div>

            <div className="flex-shrink-0 flex items-center gap-2">
              {resume && (
                <button
                  onClick={() => setEditContact({ name: resume.name, email: resume.email, phone: resume.phone, linkedin: resume.linkedin, github: resume.github })}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md border border-zinc-300 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-600 dark:text-zinc-400 transition-colors"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                  </svg>
                  Edit
                </button>
              )}
              <input
                ref={resumeInputRef}
                type="file"
                accept=".pdf,.docx"
                className="hidden"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) handleResumeUpload(f); e.target.value = "" }}
              />
              <button
                onClick={() => resumeInputRef.current?.click()}
                disabled={uploading}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md border border-zinc-300 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-600 dark:text-zinc-400 disabled:opacity-40 transition-colors"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                  <polyline points="17 8 12 3 7 8"/>
                  <line x1="12" y1="3" x2="12" y2="15"/>
                </svg>
                {uploading ? "Uploading…" : "Upload Resume"}
              </button>
            </div>
          </div>
        </Card>
      </div>

      <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-2 gap-4">

        {/* ── Left: Resume ── */}
        <div className="flex flex-col gap-6 overflow-y-auto pr-1 [scrollbar-width:thin]">

          {resume?.education && (
            <Section title="Education">
              {resume.education.map((e, i) => (
                <div key={i} className="relative group/card">
                  <Card>
                    <div className="flex flex-col gap-0.5">
                      <span className="text-sm font-medium text-zinc-900 dark:text-zinc-50">{e.school}</span>
                      {e.degree && <span className="text-xs text-zinc-500 dark:text-zinc-400">{e.degree}</span>}
                      {e.date && <span className="text-xs text-zinc-400 dark:text-zinc-500">{e.date}</span>}
                    </div>
                  </Card>
                  <button onClick={() => deleteEducation(i)} className="absolute top-1.5 left-1.5 opacity-0 group-hover/card:opacity-100 transition-opacity w-5 h-5 flex items-center justify-center rounded bg-red-100 dark:bg-red-950 hover:bg-red-200 dark:hover:bg-red-900 text-red-500 dark:text-red-400 text-xs">×</button>
                  <button onClick={() => setEditEdu({ idx: i, school: e.school, degree: e.degree, date: e.date })} className="absolute top-1.5 right-1.5 opacity-0 group-hover/card:opacity-100 transition-opacity w-5 h-5 flex items-center justify-center rounded bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-500 dark:text-zinc-400 text-xs">✎</button>
                </div>
              ))}
              <button onClick={() => setEditEdu({ idx: null, school: "", degree: "", date: "" })} className="text-xs text-zinc-400 dark:text-zinc-500 hover:text-zinc-600 dark:hover:text-zinc-300 transition-colors px-1">+ Add</button>
            </Section>
          )}

          {resume?.skills && (
            <Section title="Skills">
              <Card>
                <div className="flex flex-col gap-3">
                  {(["frontend", "backend", "soft"] as const).map((cat) =>
                    resume.skills[cat]?.length ? (
                      <div key={cat}>
                        <p className="text-xs font-medium text-zinc-400 dark:text-zinc-500 mb-1.5 capitalize">{cat}</p>
                        <div className="flex flex-wrap gap-1.5">
                          {resume.skills[cat].map((s) => (
                            <SkillTag
                              key={s}
                              value={s}
                              onDelete={() => deleteSkill(cat, s)}
                              onEdit={(v) => editSkill(cat, s, v)}
                            />
                          ))}
                          <AddSkillButton onAdd={(v) => addSkill(cat, v)} />
                        </div>
                      </div>
                    ) : null
                  )}
                </div>
              </Card>
            </Section>
          )}

          {resume?.projects && (
            <Section title="Projects">
              {resume.projects.map((p, i) => (
                <div key={i} className="relative group/card">
                <Card>
                  <div className="flex items-baseline justify-between gap-2 mb-2">
                    <span className="text-sm font-medium text-zinc-900 dark:text-zinc-50">{p.name}</span>
                    {p.dates && <span className="text-xs text-zinc-400 dark:text-zinc-500 flex-shrink-0">{p.dates}</span>}
                  </div>
                  <ul className="flex flex-col gap-1">
                    {p.highlights.map((h, j) => (
                      <li key={j} className="text-xs text-zinc-600 dark:text-zinc-400 flex gap-2">
                        <span className="text-zinc-300 dark:text-zinc-600 flex-shrink-0">—</span>
                        {h}
                      </li>
                    ))}
                  </ul>
                </Card>
                <button onClick={() => deleteProject(i)} className="absolute top-1.5 left-1.5 opacity-0 group-hover/card:opacity-100 transition-opacity w-5 h-5 flex items-center justify-center rounded bg-red-100 dark:bg-red-950 hover:bg-red-200 dark:hover:bg-red-900 text-red-500 dark:text-red-400 text-xs">×</button>
                <button onClick={() => setEditProj({ idx: i, name: p.name, dates: p.dates, highlights: [...p.highlights] })} className="absolute top-1.5 right-1.5 opacity-0 group-hover/card:opacity-100 transition-opacity w-5 h-5 flex items-center justify-center rounded bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-500 dark:text-zinc-400 text-xs">✎</button>
                </div>
              ))}
              <button onClick={() => setEditProj({ idx: null, name: "", dates: "", highlights: [""] })} className="text-xs text-zinc-400 dark:text-zinc-500 hover:text-zinc-600 dark:hover:text-zinc-300 transition-colors px-1">+ Add</button>
            </Section>
          )}

        </div>

        {/* ── Right: Job Preferences ── */}
        <div className="flex flex-col gap-6 overflow-y-auto pr-1 [scrollbar-width:thin]">
          {jobPrefs && (
            <Section title="Job Preferences">
              <div className="relative group">
                <Card>
                  <div className="flex flex-col gap-4">

                    <div className="flex flex-col gap-0.5">
                      <span className="text-xs text-zinc-400 dark:text-zinc-500">Keywords</span>
                      <span className="text-sm text-zinc-900 dark:text-zinc-50">
                        {jobPrefs.keywords || <em className="text-zinc-400">not set</em>}
                      </span>
                    </div>

                    <div className="flex flex-col gap-0.5">
                      <span className="text-xs text-zinc-400 dark:text-zinc-500">Location</span>
                      <span className="text-sm text-zinc-900 dark:text-zinc-50">
                        {jobPrefs.location || <em className="text-zinc-400">not set</em>}
                      </span>
                    </div>

                    <div className="flex flex-col gap-0.5">
                      <span className="text-xs text-zinc-400 dark:text-zinc-500">Distance</span>
                      <span className="text-sm text-zinc-900 dark:text-zinc-50">
                        {jobPrefs.distance ? `${jobPrefs.distance} miles` : <em className="text-zinc-400">not set</em>}
                      </span>
                    </div>

                    <div className="flex flex-col gap-1">
                      <span className="text-xs text-zinc-400 dark:text-zinc-500">Work Type</span>
                      <div className="flex flex-wrap gap-1.5">
                        {jobPrefs.workTypes.length ? jobPrefs.workTypes.map((w) => (
                          <span key={w} className="px-2 py-0.5 text-xs rounded-md bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300">{w}</span>
                        )) : <em className="text-xs text-zinc-400">not set</em>}
                      </div>
                    </div>

                    <div className="flex flex-col gap-1">
                      <span className="text-xs text-zinc-400 dark:text-zinc-500">Experience Level</span>
                      <div className="flex flex-wrap gap-1.5">
                        {jobPrefs.expLevels.length ? jobPrefs.expLevels.map((e) => (
                          <span key={e} className="px-2 py-0.5 text-xs rounded-md bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300">{e}</span>
                        )) : <em className="text-xs text-zinc-400">not set</em>}
                      </div>
                    </div>

                  </div>
                </Card>

                {/* Edit overlay — visible on hover */}
                <button
                  onClick={openEdit}
                  className="absolute inset-0 rounded-lg flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-white/60 dark:bg-zinc-900/60 backdrop-blur-[2px]"
                >
                  <div className="bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-full p-3 shadow-md">
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-zinc-600 dark:text-zinc-300">
                      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                    </svg>
                  </div>
                </button>
              </div>
            </Section>
          )}

          {resume?.experience && (
            <Section title="Experience">
              {resume.experience.map((e, i) => (
                <div key={i} className="relative group/card">
                  <Card>
                    <div className="flex items-baseline justify-between gap-2 mb-1">
                      <span className="text-sm font-medium text-zinc-900 dark:text-zinc-50">{e.title}</span>
                      {e.dates && <span className="text-xs text-zinc-400 dark:text-zinc-500 flex-shrink-0">{e.dates}</span>}
                    </div>
                    <span className="text-xs text-zinc-500 dark:text-zinc-400">{e.company}</span>
                    {e.highlights.length > 0 && (
                      <ul className="flex flex-col gap-1 mt-2">
                        {e.highlights.map((h, j) => (
                          <li key={j} className="text-xs text-zinc-600 dark:text-zinc-400 flex gap-2">
                            <span className="text-zinc-300 dark:text-zinc-600 flex-shrink-0">—</span>
                            {h}
                          </li>
                        ))}
                      </ul>
                    )}
                  </Card>
                  <button onClick={() => deleteExperience(i)} className="absolute top-1.5 left-1.5 opacity-0 group-hover/card:opacity-100 transition-opacity w-5 h-5 flex items-center justify-center rounded bg-red-100 dark:bg-red-950 hover:bg-red-200 dark:hover:bg-red-900 text-red-500 dark:text-red-400 text-xs">×</button>
                  <button onClick={() => setEditExp({ idx: i, company: e.company, title: e.title, dates: e.dates, highlights: [...e.highlights] })} className="absolute top-1.5 right-1.5 opacity-0 group-hover/card:opacity-100 transition-opacity w-5 h-5 flex items-center justify-center rounded bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-500 dark:text-zinc-400 text-xs">✎</button>
                </div>
              ))}
              <button onClick={() => setEditExp({ idx: null, company: "", title: "", dates: "", highlights: [""] })} className="text-xs text-zinc-400 dark:text-zinc-500 hover:text-zinc-600 dark:hover:text-zinc-300 transition-colors px-1">+ Add</button>
            </Section>
          )}
        </div>

      </div>

      {/* ── Contact modal ── */}
      {editContact && (
        <div className="fixed inset-0 flex items-center justify-center bg-black/50 z-50">
          <div className="bg-white dark:bg-zinc-900 rounded-lg p-6 w-80 shadow-xl flex flex-col gap-3">
            <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">Edit Contact</h2>
            {(["name", "email", "phone", "linkedin", "github"] as const).map((field) => (
              <div key={field} className="flex flex-col gap-1">
                <label className="text-xs font-medium text-zinc-500 dark:text-zinc-400 capitalize">{field}</label>
                <input
                  type="text"
                  value={editContact[field]}
                  onChange={(e) => setEditContact((p) => p && ({ ...p, [field]: e.target.value }))}
                  className={inputCls}
                />
              </div>
            ))}
            <div className="flex gap-2 justify-end pt-1">
              <button onClick={() => setEditContact(null)} className="px-4 py-2 text-sm rounded-md border border-zinc-300 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800">Cancel</button>
              <button onClick={() => saveContact(editContact)} disabled={!editContact.name} className="px-4 py-2 text-sm rounded-md bg-zinc-900 dark:bg-zinc-50 text-white dark:text-zinc-900 disabled:opacity-40">Save</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Education modal ── */}
      {editEdu && (
        <div className="fixed inset-0 flex items-center justify-center bg-black/50 z-50">
          <div className="bg-white dark:bg-zinc-900 rounded-lg p-6 w-80 shadow-xl flex flex-col gap-3">
            <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">{editEdu.idx === null ? "Add Education" : "Edit Education"}</h2>
            {(["school", "degree", "date"] as const).map((field) => (
              <div key={field} className="flex flex-col gap-1">
                <label className="text-xs font-medium text-zinc-500 dark:text-zinc-400 capitalize">{field}</label>
                <input type="text" value={editEdu[field]} onChange={(e) => setEditEdu((p) => p && ({ ...p, [field]: e.target.value }))} className={inputCls} />
              </div>
            ))}
            <div className="flex gap-2 justify-end pt-1">
              <button onClick={() => setEditEdu(null)} className="px-4 py-2 text-sm rounded-md border border-zinc-300 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800">Cancel</button>
              <button onClick={() => saveEducation(editEdu)} disabled={!editEdu.school} className="px-4 py-2 text-sm rounded-md bg-zinc-900 dark:bg-zinc-50 text-white dark:text-zinc-900 disabled:opacity-40">Save</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Experience modal ── */}
      {editExp && (
        <div className="fixed inset-0 flex items-center justify-center bg-black/50 z-50">
          <div className="bg-white dark:bg-zinc-900 rounded-lg p-6 w-96 shadow-xl flex flex-col gap-3 max-h-[90vh] overflow-y-auto">
            <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">{editExp.idx === null ? "Add Experience" : "Edit Experience"}</h2>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-zinc-500 dark:text-zinc-400">Job Title</label>
              <input type="text" value={editExp.title} onChange={(e) => setEditExp((p) => p && ({ ...p, title: e.target.value }))} className={inputCls} />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-zinc-500 dark:text-zinc-400">Company</label>
              <input type="text" value={editExp.company} onChange={(e) => setEditExp((p) => p && ({ ...p, company: e.target.value }))} className={inputCls} />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-zinc-500 dark:text-zinc-400">Dates</label>
              <input type="text" value={editExp.dates} onChange={(e) => setEditExp((p) => p && ({ ...p, dates: e.target.value }))} placeholder="e.g. Jun 2024 – Aug 2024" className={inputCls} />
            </div>
            <div className="flex flex-col gap-2">
              <label className="text-xs font-medium text-zinc-500 dark:text-zinc-400">Highlights</label>
              {editExp.highlights.map((h, i) => (
                <div key={i} className="flex gap-1.5">
                  <input type="text" value={h} onChange={(e) => setEditExp((p) => { if (!p) return p; const hl = [...p.highlights]; hl[i] = e.target.value; return { ...p, highlights: hl } })} className={inputCls} />
                  <button onClick={() => setEditExp((p) => { if (!p) return p; const hl = p.highlights.filter((_, j) => j !== i); return { ...p, highlights: hl.length ? hl : [""] } })} className="flex-shrink-0 w-7 flex items-center justify-center rounded-md bg-red-100 dark:bg-red-950 hover:bg-red-200 dark:hover:bg-red-900 text-red-500 dark:text-red-400 text-sm">×</button>
                </div>
              ))}
              <button onClick={() => setEditExp((p) => p && ({ ...p, highlights: [...p.highlights, ""] }))} className="text-xs text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 transition-colors text-left px-1">+ Add highlight</button>
            </div>
            <div className="flex gap-2 justify-end pt-1">
              <button onClick={() => setEditExp(null)} className="px-4 py-2 text-sm rounded-md border border-zinc-300 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800">Cancel</button>
              <button onClick={() => saveExperience(editExp)} disabled={!editExp.title || !editExp.company} className="px-4 py-2 text-sm rounded-md bg-zinc-900 dark:bg-zinc-50 text-white dark:text-zinc-900 disabled:opacity-40">Save</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Project modal ── */}
      {editProj && (
        <div className="fixed inset-0 flex items-center justify-center bg-black/50 z-50">
          <div className="bg-white dark:bg-zinc-900 rounded-lg p-6 w-96 shadow-xl flex flex-col gap-3 max-h-[90vh] overflow-y-auto">
            <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">{editProj.idx === null ? "Add Project" : "Edit Project"}</h2>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-zinc-500 dark:text-zinc-400">Name</label>
              <input type="text" value={editProj.name} onChange={(e) => setEditProj((p) => p && ({ ...p, name: e.target.value }))} className={inputCls} />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-zinc-500 dark:text-zinc-400">Dates</label>
              <input type="text" value={editProj.dates} onChange={(e) => setEditProj((p) => p && ({ ...p, dates: e.target.value }))} placeholder="e.g. Jan 2025 – Current" className={inputCls} />
            </div>
            <div className="flex flex-col gap-2">
              <label className="text-xs font-medium text-zinc-500 dark:text-zinc-400">Highlights</label>
              {editProj.highlights.map((h, i) => (
                <div key={i} className="flex gap-1.5">
                  <input type="text" value={h} onChange={(e) => setEditProj((p) => { if (!p) return p; const hl = [...p.highlights]; hl[i] = e.target.value; return { ...p, highlights: hl } })} className={inputCls} />
                  <button onClick={() => setEditProj((p) => { if (!p) return p; const hl = p.highlights.filter((_, j) => j !== i); return { ...p, highlights: hl.length ? hl : [""] } })} className="flex-shrink-0 w-7 flex items-center justify-center rounded-md bg-red-100 dark:bg-red-950 hover:bg-red-200 dark:hover:bg-red-900 text-red-500 dark:text-red-400 text-sm">×</button>
                </div>
              ))}
              <button onClick={() => setEditProj((p) => p && ({ ...p, highlights: [...p.highlights, ""] }))} className="text-xs text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 transition-colors text-left px-1">+ Add highlight</button>
            </div>
            <div className="flex gap-2 justify-end pt-1">
              <button onClick={() => setEditProj(null)} className="px-4 py-2 text-sm rounded-md border border-zinc-300 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800">Cancel</button>
              <button onClick={() => saveProject(editProj)} disabled={!editProj.name} className="px-4 py-2 text-sm rounded-md bg-zinc-900 dark:bg-zinc-50 text-white dark:text-zinc-900 disabled:opacity-40">Save</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Edit modal ── */}
      {editOpen && (
        <div className="fixed inset-0 flex items-center justify-center bg-black/50 z-50">
          <div className="bg-white dark:bg-zinc-900 rounded-lg p-6 w-80 shadow-xl flex flex-col gap-3">
            <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">Job Preferences</h2>

            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-zinc-500 dark:text-zinc-400">Keywords</label>
              <input type="text" value={form.keywords} onChange={(e) => setForm((p) => ({ ...p, keywords: e.target.value }))} placeholder="e.g. Software Intern" className={inputCls} />
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-zinc-500 dark:text-zinc-400">Location</label>
              <input type="text" value={form.location} onChange={(e) => { setForm((p) => ({ ...p, location: e.target.value })); setLocationError(null) }} placeholder="e.g. Lowell, Massachusetts" className={inputCls} />
              {locationError && <p className="text-xs text-red-500">{locationError}</p>}
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-zinc-500 dark:text-zinc-400">Distance</label>
              <select value={form.distance} onChange={(e) => setForm((p) => ({ ...p, distance: e.target.value }))} className={inputCls}>
                {["10", "25", "50", "100"].map((d) => <option key={d} value={d}>{d} miles</option>)}
              </select>
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-zinc-500 dark:text-zinc-400">Work Type</label>
              <div className="flex flex-col gap-1">
                {WORK_TYPE_OPTIONS.map(([val, label]) => (
                  <label key={val} className="flex items-center gap-2 text-sm text-zinc-700 dark:text-zinc-300 cursor-pointer">
                    <input type="checkbox" checked={form.workTypes.includes(val)} onChange={() => toggleWorkType(val)} className="accent-zinc-700 dark:accent-zinc-300" />
                    {label}
                  </label>
                ))}
              </div>
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-zinc-500 dark:text-zinc-400">Experience Level</label>
              <div className="flex flex-col gap-1">
                {EXP_LEVEL_OPTIONS.map(([val, label]) => (
                  <label key={val} className="flex items-center gap-2 text-sm text-zinc-700 dark:text-zinc-300 cursor-pointer">
                    <input type="checkbox" checked={form.expLevels.includes(val)} onChange={() => toggleExpLevel(val)} className="accent-zinc-700 dark:accent-zinc-300" />
                    {label}
                  </label>
                ))}
              </div>
            </div>

            {saveError && <p className="text-sm text-red-500">{saveError}</p>}

            <div className="flex gap-2 justify-end pt-1">
              <button onClick={() => setEditOpen(false)} className="px-4 py-2 text-sm rounded-md border border-zinc-300 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800">
                Cancel
              </button>
              <button onClick={handleSave} disabled={saving || !form.keywords || !form.location} className="px-4 py-2 text-sm rounded-md bg-zinc-900 dark:bg-zinc-50 text-white dark:text-zinc-900 disabled:opacity-40">
                {saving ? "Saving..." : "Save"}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  )
}
