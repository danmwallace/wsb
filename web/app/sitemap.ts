import type { MetadataRoute } from "next";
import { BASE_URL } from "@/lib/config";

export default function sitemap(): MetadataRoute.Sitemap {
  // Static pages only; /stocks/[ticker] pages are discovered by crawling the dashboard links.
  return ["", "/how-it-works", "/about", "/privacy"].map((path) => ({
    url: `${BASE_URL}${path}`,
  }));
}
