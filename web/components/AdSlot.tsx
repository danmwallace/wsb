const SIZES = {
  leaderboard: "h-[90px]",
  "in-feed": "h-[120px]",
} as const;

export function AdSlot({ variant }: { variant: keyof typeof SIZES }) {
  // Placeholder until an AdSense account + /privacy are live. Real <ins> goes here.
  return (
    <div
      className={`flex w-full items-center justify-center rounded-md border border-dashed border-neutral-700 bg-neutral-900/40 text-[0.65rem] uppercase tracking-wider text-neutral-600 ${SIZES[variant]}`}
      aria-hidden="true"
    >
      Advertisement
    </div>
  );
}
