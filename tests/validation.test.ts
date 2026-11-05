import { describe, expect, it } from "vitest";
import { z } from "zod";
import { zodMessage } from "@/lib/http";

describe("server error messages", () => {
  const schema = z.object({ gstPercent: z.number(), lines: z.array(z.object({ qty: z.number().int() })) });

  it("names the field that is wrong", () => {
    const r = schema.safeParse({ gstPercent: "five", lines: [] });
    expect(zodMessage(r.error!)).toBe("GST is missing or not valid");
  });

  it("uses the innermost named field", () => {
    const r = schema.safeParse({ gstPercent: 5, lines: [{ qty: 1.5 }] });
    expect(zodMessage(r.error!)).toBe("Quantity is missing or not valid");
  });

  it("falls back to a general message for unknown fields", () => {
    const r = z.object({ somethingElse: z.number() }).safeParse({});
    expect(zodMessage(r.error!)).toBe("Some details are missing or not valid");
  });
});
