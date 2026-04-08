"use client"

import { SessionProvider } from "next-auth/react"
import Sidebar from "./components/Sidebar"
import { ThemeProvider } from "./components/ThemeProvider"

export default function AppLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <SessionProvider>
      <ThemeProvider>
        <div className="flex h-screen overflow-hidden">
          <Sidebar />
          <main className="flex-1 overflow-auto bg-zinc-50 dark:bg-zinc-950 p-8">
            {children}
          </main>
        </div>
      </ThemeProvider>
    </SessionProvider>
  )
}
