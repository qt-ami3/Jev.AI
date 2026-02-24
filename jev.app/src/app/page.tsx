'use client'

import { handleGettingStarted } from "./TS/gettingStarted"

export default function Dashboard() {
  return (
    <div className="max-w-4xl">
      <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">
        Dashboard
      </h1>

      <br/>

      <button onClick={handleGettingStarted} className="textbox group relative pr-6" style={{ marginLeft: "5px" }}>
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
    </div>
  );
}
