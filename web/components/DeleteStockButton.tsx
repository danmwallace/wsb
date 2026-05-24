"use client";

import { useTransition } from "react";
import { deleteTickerAction } from "@/app/stocks/[ticker]/actions";

export function DeleteStockButton({ ticker }: { ticker: string }) {
  const [isPending, startTransition] = useTransition();

  const onClick = () => {
    const ok = window.confirm(
      `Delete ${ticker}? This removes the ticker, its posts, and all research / ratings from the database. Archived rows are kept.`
    );
    if (!ok) return;
    startTransition(async () => {
      try {
        await deleteTickerAction(ticker);
      } catch (err) {
        // redirect() throws a NEXT_REDIRECT signal that the transition swallows
        // on success; only surface real failures.
        const msg = err instanceof Error ? err.message : String(err);
        if (!msg.includes("NEXT_REDIRECT")) {
          window.alert(`Failed to delete ${ticker}: ${msg}`);
        }
      }
    });
  };

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={isPending}
      className="rounded-md border border-rating-sell/40 bg-rating-sell/10 px-3 py-1.5 text-xs font-medium text-rating-sell hover:bg-rating-sell/20 disabled:opacity-50"
    >
      {isPending ? "Deleting…" : "Delete stock"}
    </button>
  );
}
