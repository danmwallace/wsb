import type { PostRow } from "@/lib/queries";
import { fmtRelative } from "@/lib/format";

const sentimentClass: Record<PostRow["sentiment"], string> = {
  Positive: "text-rating-buy",
  Neutral: "text-neutral-400",
  Negative: "text-rating-sell",
};

export function PostList({ posts }: { posts: PostRow[] }) {
  if (posts.length === 0) {
    return (
      <div className="rounded border border-neutral-800 bg-neutral-900 p-4 text-sm text-neutral-500">
        No posts captured.
      </div>
    );
  }
  return (
    <ul className="space-y-3">
      {posts.map((p) => (
        <li
          key={`${p.post_id}-${p.ticker}`}
          className="rounded-lg border border-neutral-800 bg-neutral-900 p-4"
        >
          <div className="flex items-start justify-between gap-4">
            <p className="flex-1 text-sm leading-relaxed text-neutral-300">
              {p.summary || <em className="text-neutral-500">no summary</em>}
            </p>
            <span
              className={`text-xs font-medium ${sentimentClass[p.sentiment]}`}
            >
              {p.sentiment}
            </span>
          </div>
          <div className="mt-2 flex items-center justify-between text-xs text-neutral-500">
            <span>{fmtRelative(p.observed_at)}</span>
            {p.link ? (
              <a
                href={p.link}
                target="_blank"
                rel="noreferrer"
                className="hover:text-neutral-200 hover:underline"
              >
                Open on Reddit ↗
              </a>
            ) : null}
          </div>
        </li>
      ))}
    </ul>
  );
}
