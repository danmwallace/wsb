"use server";

import { revalidatePath } from "next/cache";
import { addCustomTicker } from "@/lib/mutations";

export type AddTickerState =
  | { status: "idle" }
  | { status: "success"; ticker: string; inserted: boolean }
  | { status: "error"; message: string };

const TICKER_PATTERN = /^[A-Z]{1,5}$/;

export async function addTickerAction(
  _prev: AddTickerState,
  formData: FormData
): Promise<AddTickerState> {
  const ticker = String(formData.get("ticker") || "").trim().toUpperCase();
  const company = String(formData.get("company") || "").trim() || null;

  if (!TICKER_PATTERN.test(ticker)) {
    return {
      status: "error",
      message: "Ticker must be 1–5 uppercase letters (e.g. NVDA).",
    };
  }

  try {
    const { inserted } = await addCustomTicker(ticker, company);
    revalidatePath("/");
    return { status: "success", ticker, inserted };
  } catch (err) {
    return {
      status: "error",
      message: err instanceof Error ? err.message : "Failed to add ticker.",
    };
  }
}
