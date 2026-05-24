"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { deleteTicker } from "@/lib/mutations";

export async function deleteTickerAction(rawTicker: string): Promise<void> {
  const ticker = String(rawTicker || "").trim().toUpperCase();
  if (!ticker) throw new Error("Ticker is required");

  await deleteTicker(ticker);

  revalidatePath("/");
  redirect("/");
}
