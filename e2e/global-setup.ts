import { chromium, request, type FullConfig } from "@playwright/test";
import fs from "node:fs";
import { STATE_DIR, STAFF_STATE, TABLES_FILE, bypassHeaders, staffLogin, type TableLink } from "./helpers";

/**
 * Signs in once as the manager, saves the login for every test, and reads the
 * table links from the printable QR sheet, the same links the QR codes open.
 */
export default async function globalSetup(config: FullConfig) {
  const baseURL = config.projects[0].use.baseURL!;
  const { phone, pin } = staffLogin();
  fs.mkdirSync(STATE_DIR, { recursive: true });

  const api = await request.newContext({ baseURL, extraHTTPHeaders: bypassHeaders() });
  const res = await api.post("/api/staff/login", { data: { phone, pin } });
  if (!res.ok()) {
    throw new Error(`Staff sign-in failed on ${baseURL} (${res.status()}): ${await res.text()}`);
  }
  await api.storageState({ path: STAFF_STATE });
  await api.dispose();

  const browser = await chromium.launch();
  const page = await browser.newPage({ baseURL, storageState: STAFF_STATE, extraHTTPHeaders: bypassHeaders() });
  await page.goto("/staff/manager/qr");
  const links = page.getByRole("link", { name: /^Open .+ table \d+ menu$/ });
  await links
    .first()
    .waitFor({ timeout: 20_000 })
    .catch(() => {
      throw new Error(`No "Open table page" links on ${baseURL}/staff/manager/qr. The site may be older than these checks.`);
    });
  const tables: TableLink[] = [];
  for (const link of await links.all()) {
    const label = (await link.getAttribute("aria-label"))!;
    const [, restaurant, number] = label.match(/^Open (.+) table (\d+) menu$/)!;
    tables.push({ restaurant, number: Number(number), path: (await link.getAttribute("href"))! });
  }
  await browser.close();
  if (tables.length === 0) throw new Error("No tables found on the QR sheet");
  fs.writeFileSync(TABLES_FILE, JSON.stringify(tables, null, 2));
}
