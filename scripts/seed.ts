import { getDb, closeDb } from "../src/db";
import { diningTables, menuCategories, menuItems, restaurants, settings, staff } from "../src/db/schema";
import { hashPin, newQrToken } from "../src/lib/crypto";
import { normalizeIndianPhone } from "../src/lib/auth";
import { SAMPLE_MENU, SAMPLE_CATEGORIES } from "../src/lib/sample-menu";

/**
 * Seeds an empty database with the two restaurants, 10 sample tables each,
 * the sample menu and the first manager login. Safe to run twice: it stops
 * if restaurants already exist.
 */
async function main() {
  const db = getDb();
  const existing = await db.select().from(restaurants).limit(1);
  if (existing.length) {
    console.log("Database already has data. Nothing to seed.");
    return;
  }
  const pin = process.env.SEED_MANAGER_PIN;
  const phoneRaw = process.env.SEED_MANAGER_PHONE;
  if (!pin || !/^\d{4,6}$/.test(pin) || !phoneRaw) {
    throw new Error("Set SEED_MANAGER_PHONE and SEED_MANAGER_PIN (4 to 6 digits) before seeding");
  }

  await db.transaction(async (tx) => {
    const [ground, goodLife] = await tx
      .insert(restaurants)
      .values([
        { slug: "ground-floor", name: "Ground Floor Restaurant", tagline: "Pure vegetarian", vegOnly: true },
        { slug: "good-life", name: "Good Life", tagline: "Veg and non-veg, 2nd floor", vegOnly: false },
      ])
      .returning();
    for (const r of [ground, goodLife]) {
      await tx.insert(diningTables).values(
        Array.from({ length: 10 }, (_, i) => ({ restaurantId: r.id, number: i + 1, seats: 4, qrToken: newQrToken() })),
      );
    }
    const cats = await tx
      .insert(menuCategories)
      .values(SAMPLE_CATEGORIES.map((name, i) => ({ name, sort: i })))
      .returning();
    const catId = new Map(cats.map((c) => [c.name, c.id]));
    await tx.insert(menuItems).values(
      SAMPLE_MENU.map((m, i) => ({
        categoryId: catId.get(m.category)!,
        name: m.name,
        description: m.description,
        pricePaise: m.price * 100,
        isVeg: m.veg,
        isBestseller: !!m.bestseller,
        sort: i,
      })),
    );
    await tx.insert(settings).values({ key: "gst_rate_bp", value: "500" });
    await tx.insert(staff).values({
      name: "Manager",
      phone: normalizeIndianPhone(phoneRaw),
      pinHash: await hashPin(pin),
      role: "manager",
    });
  });
  console.log("Seeded 2 restaurants, 20 tables, sample menu and the manager login.");
}

main()
  .then(() => closeDb())
  .catch(async (err) => {
    console.error(err);
    await closeDb();
    process.exit(1);
  });
