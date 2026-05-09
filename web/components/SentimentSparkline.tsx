export function SentimentSparkline({
  positive,
  neutral,
  negative,
}: {
  positive: number;
  neutral: number;
  negative: number;
}) {
  const total = positive + neutral + negative;
  if (total === 0) {
    return <span className="text-xs text-neutral-600">no posts</span>;
  }
  const segments: { value: number; className: string }[] = [
    { value: positive, className: "bg-rating-buy" },
    { value: neutral, className: "bg-neutral-500" },
    { value: negative, className: "bg-rating-sell" },
  ];
  return (
    <div className="flex items-center gap-2">
      <div className="flex h-2 w-28 overflow-hidden rounded bg-neutral-800">
        {segments.map((s, i) =>
          s.value === 0 ? null : (
            <div
              key={i}
              className={s.className}
              style={{ width: `${(s.value / total) * 100}%` }}
            />
          )
        )}
      </div>
      <span className="tabular-nums text-xs text-neutral-400">
        {positive}/{neutral}/{negative}
      </span>
    </div>
  );
}
