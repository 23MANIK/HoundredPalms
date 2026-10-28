export type BillLine = { pricePaise: number; qty: number };

export type Bill = {
  subtotalPaise: number;
  discountPct: number;
  discountPaise: number;
  taxablePaise: number;
  gstRateBp: number; // basis points, 500 = 5%
  cgstPaise: number;
  sgstPaise: number;
  totalPaise: number;
};

/**
 * GST on restaurant food is split equally into CGST and SGST.
 * Each half is rounded to the nearest paisa, so the total always equals
 * taxable + cgst + sgst exactly, the way it prints on the bill.
 */
export function computeBill(lines: BillLine[], discountPct: number, gstRateBp: number): Bill {
  if (!Number.isInteger(discountPct) || discountPct < 0 || discountPct > 100) {
    throw new Error("Discount must be a whole number from 0 to 100");
  }
  if (!Number.isInteger(gstRateBp) || gstRateBp < 0 || gstRateBp > 2800) {
    throw new Error("GST rate must be between 0% and 28%");
  }
  const subtotalPaise = lines.reduce((sum, l) => sum + l.pricePaise * l.qty, 0);
  const discountPaise = Math.round((subtotalPaise * discountPct) / 100);
  const taxablePaise = subtotalPaise - discountPaise;
  const halfRate = gstRateBp / 2;
  const cgstPaise = Math.round((taxablePaise * halfRate) / 10000);
  const sgstPaise = cgstPaise;
  return {
    subtotalPaise,
    discountPct,
    discountPaise,
    taxablePaise,
    gstRateBp,
    cgstPaise,
    sgstPaise,
    totalPaise: taxablePaise + cgstPaise + sgstPaise,
  };
}

export function formatRupees(paise: number): string {
  const rupees = paise / 100;
  const hasPaise = paise % 100 !== 0;
  return (
    "₹" +
    rupees.toLocaleString("en-IN", {
      minimumFractionDigits: hasPaise ? 2 : 0,
      maximumFractionDigits: 2,
    })
  );
}
