import type { TopMover } from "@/lib/movers";
import { MoverCard } from "./MoverCard";

export function TopMovers({ movers }: { movers: TopMover[] }) {
  if (movers.length === 0) return null;
  return (
    <section>
      <h2 className="mb-2 text-xs font-medium uppercase tracking-wider text-neutral-400">Top movers</h2>
      <div className="flex gap-3 overflow-x-auto pb-1">
        {movers.map((m) => (
          <MoverCard key={`${m.kind}:${m.ticker}`} mover={m} />
        ))}
      </div>
    </section>
  );
}
