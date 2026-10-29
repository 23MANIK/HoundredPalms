import { notFound } from "next/navigation";
import { getDb } from "@/db";
import { getGstRateBp, getMenu, getTableByToken } from "@/lib/domain";
import { currentGuest } from "@/lib/http";
import { googleEnabled } from "@/lib/google";
import { devOtpAllowed, smsConfigured } from "@/lib/auth";
import GuestApp from "@/components/guest/GuestApp";

export const dynamic = "force-dynamic";

export default async function TablePage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ login?: string }>;
}) {
  const { token } = await params;
  const db = getDb();
  const found = await getTableByToken(db, token);
  if (!found) notFound();
  const [menu, guest, gstRateBp] = await Promise.all([
    getMenu(db, { vegOnly: found.restaurant.vegOnly }),
    currentGuest(db),
    getGstRateBp(db),
  ]);
  return (
    <GuestApp
      token={token}
      table={{ number: found.table.number }}
      restaurant={{ name: found.restaurant.name, tagline: found.restaurant.tagline, vegOnly: found.restaurant.vegOnly }}
      menu={menu}
      guest={guest ? { id: guest.id, name: guest.name } : null}
      gstRateBp={gstRateBp}
      login={{ google: googleEnabled(), sms: smsConfigured() || devOtpAllowed() }}
      loginFailed={(await searchParams).login === "failed"}
    />
  );
}
