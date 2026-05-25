import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";
import { BASE_URL } from "@/lib/config";

export const metadata: Metadata = {
  metadataBase: new URL(BASE_URL),
  title: { default: "WSB Pulse", template: "%s · WSB Pulse" },
  description:
    "What r/WallStreetBets is buzzing about — tickers scored on sentiment and rated by AI. Rolling 90-day window.",
  openGraph: { title: "WSB Pulse", description: "r/WallStreetBets sentiment, rated by AI.", type: "website" },
  twitter: { card: "summary_large_image" },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="flex min-h-screen flex-col">
        <header className="border-b border-neutral-800">
          <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
            <Link href="/" className="text-lg font-semibold tracking-tight">
              <span aria-hidden="true">📈</span> WSB Pulse
            </Link>
            <nav className="flex gap-4 text-sm text-neutral-400">
              <Link href="/how-it-works" className="hover:text-neutral-100">How it works</Link>
              <Link href="/about" className="hover:text-neutral-100">About</Link>
            </nav>
          </div>
        </header>
        <main className="mx-auto w-full max-w-6xl flex-1 px-6 py-8">{children}</main>
        <footer className="border-t border-neutral-800 text-xs text-neutral-600">
          <div className="mx-auto flex max-w-6xl flex-col gap-1 px-6 py-6 sm:flex-row sm:justify-between">
            <span>Data covers the last 90 days · AI-generated ratings, not financial advice.</span>
            <span className="flex gap-3">
              <Link href="/how-it-works" className="hover:text-neutral-400">How it works</Link>
              <Link href="/privacy" className="hover:text-neutral-400">Privacy</Link>
            </span>
          </div>
        </footer>
      </body>
    </html>
  );
}
