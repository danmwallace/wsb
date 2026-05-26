const SIZES = {
  leaderboard: "h-[90px]",
  "in-feed": "h-[120px]",
} as const;

// Ads stay hidden until an AdSense account is approved and /privacy is fleshed out.
// Flip ADS_ENABLED to true (and swap the placeholder below for the real AdSense
// <ins> unit, sized via SIZES[variant]) to re-enable.
const ADS_ENABLED = false;

export function AdSlot({ variant }: { variant: keyof typeof SIZES }) {
  if (!ADS_ENABLED) return null;
  return (
    <div
      className={`flex w-full items-center justify-center rounded-md border border-dashed border-neutral-700 bg-neutral-900/40 text-[0.65rem] uppercase tracking-wider text-neutral-600 ${SIZES[variant]}`}
      aria-hidden="true"
    >
      Advertisement
    </div>
  );
}
