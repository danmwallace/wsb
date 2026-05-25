import { describe, it, expect } from "vitest";
import { isSpike, classifyRatingChange, classifySpike, mergeMovers, type TopMover } from "./movers";

describe("isSpike", () => {
  it("is true when recent is >= 2x prior and >= 3", () => {
    expect(isSpike(6, 2)).toBe(true);
  });
  it("is true when prior is 0 but recent >= 3", () => {
    expect(isSpike(3, 0)).toBe(true);
  });
  it("is false below the floor of 3", () => {
    expect(isSpike(2, 0)).toBe(false);
  });
  it("is false when recent is not 2x prior", () => {
    expect(isSpike(5, 4)).toBe(false);
  });
});

describe("classifyRatingChange", () => {
  it("labels an upgrade as up", () => {
    const m = classifyRatingChange({ ticker: "AMD", company: "Advanced Micro Devices", rating: "Buy", prevRating: "Hold", asOf: new Date("2026-05-23") });
    expect(m.kind).toBe("rating");
    expect(m.label).toBe("Hold → Buy");
    expect(m.direction).toBe("up");
  });
  it("labels a downgrade to Sell as down", () => {
    const m = classifyRatingChange({ ticker: "RDDT", company: "Reddit", rating: "Hold", prevRating: "Buy", asOf: new Date("2026-05-24") });
    expect(m.direction).toBe("down");
    expect(m.label).toBe("Buy → Hold");
  });
});

describe("classifySpike", () => {
  it("returns a ratio label when prior > 0", () => {
    const m = classifySpike({ ticker: "ASTS", company: "AST", recent: 8, prior: 2, pos: 6, neu: 1, neg: 1 });
    expect(m?.label).toBe("mentions ×4");
    expect(m?.direction).toBe("up");
  });
  it("returns a 'new chatter' label when prior is 0", () => {
    const m = classifySpike({ ticker: "XYZ", company: null, recent: 4, prior: 0, pos: 1, neu: 3, neg: 0 });
    expect(m?.label).toBe("new chatter");
  });
  it("returns null when not a spike", () => {
    expect(classifySpike({ ticker: "AAA", company: null, recent: 2, prior: 2, pos: 1, neu: 1, neg: 0 })).toBeNull();
  });
  it("leans down when negative dominates", () => {
    const m = classifySpike({ ticker: "BBB", company: null, recent: 6, prior: 1, pos: 0, neu: 1, neg: 5 });
    expect(m?.direction).toBe("down");
  });
  it("is neutral when neither sentiment dominates", () => {
    const m = classifySpike({ ticker: "CCC", company: null, recent: 5, prior: 1, pos: 1, neu: 3, neg: 1 });
    expect(m?.direction).toBe("neutral");
  });
});

describe("mergeMovers", () => {
  const rating: TopMover[] = [{ ticker: "AMD", company: null, kind: "rating", label: "Hold → Buy", direction: "up", sortKey: 100 }];
  const spike: TopMover[] = [
    { ticker: "AMD", company: null, kind: "spike", label: "mentions ×3", direction: "up", sortKey: 50 },
    { ticker: "ASTS", company: null, kind: "spike", label: "mentions ×4", direction: "up", sortKey: 80 },
  ];
  it("dedupes by ticker, preferring the rating change", () => {
    const out = mergeMovers(rating, spike, 6);
    expect(out.filter((m) => m.ticker === "AMD")).toHaveLength(1);
    expect(out.find((m) => m.ticker === "AMD")?.kind).toBe("rating");
  });
  it("caps the result and sorts by sortKey desc", () => {
    const out = mergeMovers(rating, spike, 2);
    expect(out).toHaveLength(2);
    expect(out[0].sortKey).toBeGreaterThanOrEqual(out[1].sortKey);
  });
  it("ranks a rating change above a spike at realistic sortKey scales", () => {
    const r: TopMover[] = [{ ticker: "AMD", company: null, kind: "rating", label: "Hold → Buy", direction: "up", sortKey: 1000 + new Date("2026-05-24").getTime() / 1e9 }];
    const s: TopMover[] = [{ ticker: "ASTS", company: null, kind: "spike", label: "mentions ×4", direction: "up", sortKey: 10 }];
    const out = mergeMovers(r, s, 6);
    expect(out[0].ticker).toBe("AMD");
  });
});
