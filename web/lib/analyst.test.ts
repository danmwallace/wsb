import { describe, it, expect } from "vitest";
import { computeUpside, deriveConsensus } from "./analyst";

describe("computeUpside", () => {
  it("returns null when price is null", () => {
    expect(computeUpside(null, 100)).toBeNull();
  });
  it("returns null when target_mean is null", () => {
    expect(computeUpside(100, null)).toBeNull();
  });
  it("returns null when price is zero", () => {
    expect(computeUpside(0, 100)).toBeNull();
  });
  it("returns null when either input is not finite", () => {
    expect(computeUpside("not-a-number", 100)).toBeNull();
    expect(computeUpside(100, "garbage")).toBeNull();
  });
  it("computes positive upside as a percent", () => {
    expect(computeUpside(100, 120)).toBeCloseTo(20);
  });
  it("computes negative upside as a percent", () => {
    expect(computeUpside(120, 100)).toBeCloseTo(-16.6667, 3);
  });
  it("accepts numeric strings (Postgres NUMERIC comes through as string)", () => {
    expect(computeUpside("100.0000", "112.5000")).toBeCloseTo(12.5);
  });
});

describe("deriveConsensus", () => {
  it("returns null when all counts are zero", () => {
    expect(deriveConsensus({ strong_buy: 0, buy: 0, hold: 0, sell: 0, strong_sell: 0 })).toBeNull();
  });
  it("returns null when all counts are null", () => {
    expect(deriveConsensus({ strong_buy: null, buy: null, hold: null, sell: null, strong_sell: null })).toBeNull();
  });
  it("returns Strong Buy when score is >= 1.0 (all strong_buy)", () => {
    expect(deriveConsensus({ strong_buy: 10, buy: 0, hold: 0, sell: 0, strong_sell: 0 })).toBe("Strong Buy");
  });
  it("returns Buy at score = 0.5 (5 buy, 5 hold)", () => {
    expect(deriveConsensus({ strong_buy: 0, buy: 5, hold: 5, sell: 0, strong_sell: 0 })).toBe("Buy");
  });
  it("returns Hold at score = 0 (all hold)", () => {
    expect(deriveConsensus({ strong_buy: 0, buy: 0, hold: 10, sell: 0, strong_sell: 0 })).toBe("Hold");
  });
  it("returns Sell at score = -0.5", () => {
    expect(deriveConsensus({ strong_buy: 0, buy: 0, hold: 5, sell: 5, strong_sell: 0 })).toBe("Sell");
  });
  it("returns Strong Sell when score is < -1.0 (all strong_sell)", () => {
    expect(deriveConsensus({ strong_buy: 0, buy: 0, hold: 0, sell: 0, strong_sell: 10 })).toBe("Strong Sell");
  });
  it("returns Strong Buy at the boundary score = 1.0 (4 strong_buy, 4 hold)", () => {
    // score = (4*2 + 4*0) / 8 = 1.0  →  Strong Buy boundary inclusive
    expect(deriveConsensus({ strong_buy: 4, buy: 0, hold: 4, sell: 0, strong_sell: 0 })).toBe("Strong Buy");
  });
  it("returns Buy at the boundary score = 0.3 (3 buy, 7 hold)", () => {
    // 3 buy, 7 hold: (3 + 0) / 10 = 0.3 → 'score >= 0.3' is Buy
    expect(deriveConsensus({ strong_buy: 0, buy: 3, hold: 7, sell: 0, strong_sell: 0 })).toBe("Buy");
  });
  it("returns Hold at the boundary score = -0.3 (7 hold, 3 sell)", () => {
    // (0 + 0 + 0 + -3 + 0) / 10 = -0.3 → 'score >= -0.3' is Hold (inclusive)
    expect(deriveConsensus({ strong_buy: 0, buy: 0, hold: 7, sell: 3, strong_sell: 0 })).toBe("Hold");
  });
  it("returns Sell at the boundary score = -1.0 (4 hold, 4 sell)", () => {
    // (0 + -4) / 8 = -1.0 → 'score >= -1.0' is Sell (inclusive)
    expect(deriveConsensus({ strong_buy: 0, buy: 0, hold: 4, sell: 4, strong_sell: 0 })).toBe("Sell");
  });
  it("treats null counts as zero (some-null mix)", () => {
    expect(deriveConsensus({ strong_buy: 10, buy: null, hold: null, sell: null, strong_sell: null })).toBe("Strong Buy");
  });
});
