import QRCode from "qrcode";
import { asc, eq } from "drizzle-orm";
import { headers } from "next/headers";
import { getDb } from "@/db";
import { diningTables, restaurants } from "@/db/schema";
import { pageStaff } from "@/lib/staff-session";
import PrintButton from "@/components/staff/PrintButton";

export default async function QrSheet() {
  await pageStaff(["manager"]);
  const h = await headers();
  const base = (process.env.APP_URL || `https://${h.get("host")}`).replace(/\/$/, "");
  const rows = await getDb()
    .select({ table: diningTables, restaurant: restaurants })
    .from(diningTables)
    .innerJoin(restaurants, eq(restaurants.id, diningTables.restaurantId))
    .where(eq(diningTables.active, true))
    .orderBy(asc(restaurants.id), asc(diningTables.number));
  const cards = await Promise.all(
    rows.map(async (r) => ({
      id: r.table.id,
      number: r.table.number,
      restaurant: r.restaurant.name,
      svg: await QRCode.toString(`${base}/t/${r.table.qrToken}`, { type: "svg", margin: 1, color: { dark: "#0D3A2B", light: "#FFFFFF" } }),
    })),
  );
  return (
    <main className="mx-auto max-w-[1100px] px-4 py-6">
      <div className="no-print mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold">Table QR cards</h1>
          <p className="text-sm text-ink-3">Print, cut and place one on each table. Each code opens that table&apos;s menu.</p>
        </div>
        <PrintButton />
      </div>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 print:grid-cols-3">
        {cards.map((c) => (
          <div key={c.id} className="flex break-inside-avoid flex-col items-center gap-2 rounded-2xl border-2 border-palm-700 bg-white p-4 text-center">
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-palm-700">Hundred Palms · {c.restaurant}</p>
            <div className="w-full max-w-[180px]" dangerouslySetInnerHTML={{ __html: c.svg }} />
            <p className="text-2xl font-extrabold">Table {c.number}</p>
            <p className="text-xs text-ink-3">Scan to see the menu and order</p>
          </div>
        ))}
      </div>
    </main>
  );
}
