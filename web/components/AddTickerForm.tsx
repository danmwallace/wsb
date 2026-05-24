"use client";

import { useActionState, useEffect, useRef } from "react";
import { useFormStatus } from "react-dom";
import { addTickerAction, type AddTickerState } from "@/app/actions";

const INITIAL: AddTickerState = { status: "idle" };

export function AddTickerForm() {
  const [state, formAction] = useActionState(addTickerAction, INITIAL);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.status === "success") formRef.current?.reset();
  }, [state]);

  return (
    <form
      ref={formRef}
      action={formAction}
      className="flex flex-wrap items-end gap-3 rounded-lg border border-neutral-800 bg-neutral-900 p-3"
    >
      <Field label="Ticker" hint="1–5 uppercase letters">
        <input
          name="ticker"
          required
          autoComplete="off"
          spellCheck={false}
          maxLength={5}
          pattern="[A-Za-z]{1,5}"
          placeholder="NVDA"
          className="w-28 rounded-md border border-neutral-700 bg-neutral-950 px-2 py-1.5 text-sm uppercase tabular-nums focus:border-neutral-500 focus:outline-none"
        />
      </Field>
      <Field label="Company" hint="optional">
        <input
          name="company"
          autoComplete="off"
          maxLength={120}
          placeholder="NVIDIA Corporation"
          className="w-64 rounded-md border border-neutral-700 bg-neutral-950 px-2 py-1.5 text-sm focus:border-neutral-500 focus:outline-none"
        />
      </Field>
      <SubmitButton />
      <StatusMessage state={state} />
    </form>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[0.65rem] uppercase tracking-wider text-neutral-500">
        {label}
        {hint ? <span className="ml-1 text-neutral-600">· {hint}</span> : null}
      </span>
      {children}
    </label>
  );
}

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-md border border-neutral-700 bg-neutral-800 px-3 py-1.5 text-sm font-medium text-neutral-100 hover:bg-neutral-700 disabled:opacity-50"
    >
      {pending ? "Adding…" : "Add ticker"}
    </button>
  );
}

function StatusMessage({ state }: { state: AddTickerState }) {
  if (state.status === "idle") return null;
  if (state.status === "error") {
    return <p className="text-xs text-rating-sell">{state.message}</p>;
  }
  const msg = state.inserted
    ? `Added ${state.ticker}. Next Research and Rate run will pick it up.`
    : `${state.ticker} is already tracked.`;
  return <p className="text-xs text-rating-buy">{msg}</p>;
}
