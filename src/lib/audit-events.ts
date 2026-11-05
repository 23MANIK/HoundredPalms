/**
 * Every event the activity log can record, with the words staff see for it.
 * The log never shows these keys. Adding an event here is the only way to record it,
 * so a new event can't reach the log without plain-English words.
 */
export const AUDIT_EVENTS = {
  "order.placed": "placed an order",
  "order.placed_by_staff": "took an order for a table",
  "order.approved": "approved an order",
  "order.returned_to_guest": "sent an order back (items unavailable)",
  "order.guest_removed_unavailable": "removed unavailable items",
  "order.preparing": "started cooking",
  "order.ready": "marked ready",
  "order.served": "served",
  "order.cancelled": "cancelled an order",
  "item.marked_unavailable": "marked an item unavailable",
  "item.marked_available": "marked an item available",
  "tab.opened": "opened a table bill",
  "tab.bill_requested": "asked for the bill",
  "tab.paid": "closed a bill",
  "menu.item_created": "added a dish",
  "menu.item_updated": "edited a dish",
  "menu.item_removed": "removed a dish",
  "menu.sold_out": "marked a dish sold out",
  "menu.back_in_stock": "put a dish back in stock",
  "table.added": "added a table",
  "table.updated": "changed a table",
  "table.restored": "restored a table",
  "table.qr_regenerated": "gave a table a new QR code",
  "staff.added": "added a staff member",
  "staff.enabled": "switched on a staff login",
  "staff.disabled": "switched off a staff login",
  "staff.login": "signed in",
  "staff.pin_reset": "set a new PIN for a staff member",
  "guest.login_phone": "signed in with a code sent to their mobile",
  "guest.login_waiter_code": "signed in with a code from the waiter",
  "guest.login_google": "signed in with Google",
  "settings.gst": "changed GST",
} as const;

export type AuditAction = keyof typeof AUDIT_EVENTS;

/** Plain words for an event. Old or unknown keys still read as words, never as a code. */
export function describeAction(action: string): string {
  const known = (AUDIT_EVENTS as Record<string, string>)[action];
  if (known) return known;
  const words = action.replace(/[._]+/g, " ").trim();
  return words ? `other activity (${words})` : "other activity";
}
