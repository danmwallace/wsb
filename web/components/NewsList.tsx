import type { NewsHeadline } from "@/lib/queries";

export function NewsList({ items }: { items: NewsHeadline[] }) {
  if (items.length === 0) {
    return (
      <div className="rounded border border-neutral-800 bg-neutral-900 p-4 text-sm text-neutral-500">
        No headlines in the latest snapshot.
      </div>
    );
  }
  return (
    <ul className="space-y-2">
      {items.map((n, i) => (
        <li
          key={`${n.url}-${i}`}
          className="flex items-start gap-3 rounded border border-neutral-800 bg-neutral-900 p-3"
        >
          <div className="flex-1">
            <a
              href={n.url}
              target="_blank"
              rel="noreferrer"
              className="text-sm text-neutral-200 hover:underline"
            >
              {n.headline}
            </a>
            <div className="mt-1 text-xs text-neutral-500">
              {n.source ?? "unknown source"}
              {n.datetime
                ? ` · ${new Date(n.datetime * 1000).toLocaleDateString()}`
                : ""}
            </div>
          </div>
        </li>
      ))}
    </ul>
  );
}
