import { describe, expect, it } from "vitest";
import { computeBill, formatRupees } from "@/lib/money";

describe("computeBill", () => {
  it("adds 5% GST split into CGST and SGST", () => {
    const b = computeBill([{ pricePaise: 28000, qty: 1 }, { pricePaise: 6000, qty: 4 }], 0, 500);
    expect(b.subtotalPaise).toBe(52000);
    expect(b.cgstPaise).toBe(1300);
    expect(b.sgstPaise).toBe(1300);
    expect(b.totalPaise).toBe(54600);
  });

  it("applies discount before tax", () => {
    const b = computeBill([{ pricePaise: 10000, qty: 1 }], 10, 500);
    expect(b.discountPaise).toBe(1000);
    expect(b.taxablePaise).toBe(9000);
    expect(b.totalPaise).toBe(9450);
  });

  it("total always equals taxable plus both taxes", () => {
    for (let p = 1; p < 5000; p += 37) {
      const b = computeBill([{ pricePaise: p, qty: 3 }], 7, 500);
      expect(b.totalPaise).toBe(b.taxablePaise + b.cgstPaise + b.sgstPaise);
    }
  });

  it("rejects bad discounts", () => {
    expect(() => computeBill([], 101, 500)).toThrow();
    expect(() => computeBill([], 1.5, 500)).toThrow();
  });

  it("formats rupees Indian style", () => {
    expect(formatRupees(12345600)).toBe("₹1,23,456");
    expect(formatRupees(9450)).toBe("₹94.50");
  });
});
