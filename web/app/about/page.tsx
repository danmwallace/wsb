import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "About · WSB Pulse",
  description: "About WSB Pulse — a hobby project tracking r/WallStreetBets stock sentiment.",
};

export default function About() {
  return (
    <article className="max-w-2xl space-y-4 text-sm leading-relaxed text-neutral-300">
      <h1 className="text-2xl font-semibold tracking-tight text-neutral-100">About</h1>
      <p>WSB Pulse is a hobby project that tracks which stocks r/WallStreetBets is talking about and rates them with AI. It is not affiliated with Reddit, Finnhub, or Anthropic.</p>
      <p>See <Link className="text-neutral-100 underline" href="/how-it-works">How it works</Link> for the details, or the <Link className="text-neutral-100 underline" href="/privacy">privacy policy</Link>.</p>
    </article>
  );
}
