import Link from "next/link";

export function Pagination({
  currentPage,
  totalPages,
}: {
  currentPage: number;
  totalPages: number;
}) {
  if (totalPages <= 1) return null;

  const linkClass =
    "rounded-md border border-neutral-800 bg-neutral-900 px-3 py-1.5 text-sm text-neutral-300 hover:bg-neutral-800";
  const disabledClass =
    "rounded-md border border-neutral-800 bg-neutral-900/40 px-3 py-1.5 text-sm text-neutral-600";

  return (
    <nav aria-label="Pagination" className="flex items-center justify-between gap-3">
      {currentPage <= 1 ? (
        <span className={disabledClass} aria-disabled="true">
          ← Prev
        </span>
      ) : (
        <Link href={`/?page=${currentPage - 1}`} className={linkClass} rel="prev">
          ← Prev
        </Link>
      )}

      <span className="text-xs text-neutral-500">
        Page {currentPage} of {totalPages}
      </span>

      {currentPage >= totalPages ? (
        <span className={disabledClass} aria-disabled="true">
          Next →
        </span>
      ) : (
        <Link href={`/?page=${currentPage + 1}`} className={linkClass} rel="next">
          Next →
        </Link>
      )}
    </nav>
  );
}
