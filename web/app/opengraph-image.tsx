import { ImageResponse } from "next/og";

export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OgImage() {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "center", padding: 80, background: "#0a0a0a", color: "#fafafa", fontSize: 64, fontWeight: 600 }}>
        <div style={{ fontSize: 40, color: "#16a34a" }}>📈 WSB Pulse</div>
        <div style={{ marginTop: 24 }}>What r/WallStreetBets is buzzing about — rated by AI</div>
        <div style={{ marginTop: 24, fontSize: 28, color: "#a3a3a3" }}>Sentiment-scored · Claude-rated · last 90 days</div>
      </div>
    ),
    { ...size }
  );
}
