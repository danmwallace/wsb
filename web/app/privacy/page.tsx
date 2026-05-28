import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Privacy",
  description: "WSB Pulse privacy policy.",
};

export default function Privacy() {
  return (
    <article className="max-w-2xl space-y-4 text-sm leading-relaxed text-neutral-300">
      <h1 className="text-2xl font-semibold tracking-tight text-neutral-100">Privacy</h1>
      <p>WSB Pulse does not require an account and does not ask you for personal information.</p>
      <p>The site uses standard server logs and may serve third-party advertising. Ad partners (e.g. Google AdSense) may use cookies or similar technologies to serve and measure ads; see the respective partner&apos;s policy for details. This page will be updated before any advertising is enabled.</p>
      <p>Questions: <a className="text-neutral-100 underline" href="mailto:noreply@wallace.boston">noreply@wallace.boston</a>.</p>
    </article>
  );
}
