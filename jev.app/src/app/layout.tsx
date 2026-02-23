import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";
import Sidebar from "./components/Sidebar";

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
    <html lang="en">
      <body
        className={`${mapleMono.variable} antialiased flex h-screen overflow-hidden`}
      >
        <Sidebar />
        <main className="flex-1 overflow-auto bg-zinc-50 dark:bg-zinc-950 p-8">
          {children}
        </main>
      </body>
    </html>
  );
}
