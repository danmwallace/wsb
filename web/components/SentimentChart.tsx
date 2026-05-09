"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

interface Datum {
  day: string;
  positive: number;
  neutral: number;
  negative: number;
}

export function SentimentChart({ data }: { data: Datum[] }) {
  if (data.length === 0) {
    return (
      <div className="flex h-48 items-center justify-center rounded border border-neutral-800 bg-neutral-900 text-sm text-neutral-500">
        No sentiment data yet.
      </div>
    );
  }
  return (
    <div className="h-48">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -16 }}>
          <CartesianGrid stroke="#262626" strokeDasharray="3 3" />
          <XAxis dataKey="day" tick={{ fill: "#737373", fontSize: 11 }} />
          <YAxis tick={{ fill: "#737373", fontSize: 11 }} allowDecimals={false} />
          <Tooltip
            contentStyle={{
              background: "#0a0a0a",
              border: "1px solid #262626",
              fontSize: 12,
            }}
            cursor={{ fill: "#171717" }}
          />
          <Bar dataKey="positive" stackId="s" fill="#16a34a" />
          <Bar dataKey="neutral" stackId="s" fill="#737373" />
          <Bar dataKey="negative" stackId="s" fill="#dc2626" />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
