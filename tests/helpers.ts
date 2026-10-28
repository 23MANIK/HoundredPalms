import { sql } from "drizzle-orm";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { getDb } from "@/db";
import { diningTables, menuCategories, menuItems, restaurants, staff } from "@/db/schema";
import { hashPin, newQrToken } from "@/lib/crypto";
import type { StaffActor, GuestActor } from "@/lib/domain";
import { guests } from "@/db/schema";

export async function resetDb() {
  const db = getDb();
  await db.execute(sql`drop schema if exists public cascade; drop schema if exists drizzle cascade; create schema public;`);
  await migrate(db, { migrationsFolder: "./drizzle" });
  return db;
}

export async function fixture() {
  const db = await resetDb();
  const [veg, mixed] = await db
    .insert(restaurants)
    .values([
      { slug: "veg", name: "Veg", vegOnly: true },
      { slug: "mixed", name: "Good Life", vegOnly: false },
    ])
    .returning();
  const [vegTable] = await db.insert(diningTables).values({ restaurantId: veg.id, number: 1, qrToken: newQrToken() }).returning();
  const [table] = await db.insert(diningTables).values({ restaurantId: mixed.id, number: 7, qrToken: newQrToken() }).returning();
  const [cat] = await db.insert(menuCategories).values({ name: "Main" }).returning();
  const [paneer, dal, chicken] = await db
    .insert(menuItems)
    .values([
      { categoryId: cat.id, name: "Paneer", pricePaise: 29000, isVeg: true },
      { categoryId: cat.id, name: "Dal", pricePaise: 24000, isVeg: true },
      { categoryId: cat.id, name: "Chicken", pricePaise: 36000, isVeg: false },
    ])
    .returning();
  const pinHash = await hashPin("1234");
  const mk = async (name: string, role: StaffActor["role"], phone: string): Promise<StaffActor> => {
    const [s] = await db.insert(staff).values({ name, role, phone, pinHash }).returning();
    return { kind: "staff", id: s.id, name, role };
  };
  const waiter = await mk("Ramesh", "waiter", "+919000000001");
  const kitchen = await mk("Cook", "kitchen", "+919000000002");
  const cashier = await mk("Suresh", "cashier", "+919000000003");
  const manager = await mk("Boss", "manager", "+919000000004");
  const mkGuest = async (name: string): Promise<GuestActor> => {
    const [g] = await db.insert(guests).values({ name }).returning();
    return { kind: "guest", id: g.id, name };
  };
  const priya = await mkGuest("Priya");
  const amit = await mkGuest("Amit");
  return { db, veg, mixed, vegTable, table, paneer, dal, chicken, waiter, kitchen, cashier, manager, priya, amit };
}
