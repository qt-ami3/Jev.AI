import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";
import Sidebar from "./components/Sidebar";
import { ThemeProvider } from "./components/ThemeProvider";

const mapleMono = localFont({
  src: "../../fonts/MapleMono[wght]-VF.woff2",
  variable: "--font-maple-mono",
});

export const metadata: Metadata = {
  title: "jev.app",
  description: "LinkedIn Scraper",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: `(function(){var s=localStorage.getItem('theme'),d=window.matchMedia('(prefers-color-scheme: dark)').matches;if(s==='dark'||(!s&&d))document.documentElement.classList.add('dark');})();` }} />
      </head>
      <body
        className={`${mapleMono.variable} antialiased flex h-screen overflow-hidden`}
      >
        <ThemeProvider>
          <Sidebar />
          <main className="flex-1 overflow-auto bg-zinc-50 dark:bg-zinc-950 p-8">
            {children}
          </main>
        </ThemeProvider>
      </body>
    </html>
  );
}
