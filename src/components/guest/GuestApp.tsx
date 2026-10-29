"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { computeBill, formatRupees } from "@/lib/money";
import { api } from "@/components/ui";
import MenuScreen from "./MenuScreen";
import CartScreen from "./CartScreen";
import LoginScreen from "./LoginScreen";
import OrdersScreen from "./OrdersScreen";

export type Dish = {
  id: number;
  name: string;
  description: string;
  pricePaise: number;
  isVeg: boolean;
  isBestseller: boolean;
  imageUrl: string | null;
  inStock: boolean;
};
export type Category = { id: number; name: string; items: Dish[] };
export type Cart = Record<number, number>;

export type GuestOrder = {
  id: number;
  status: string;
  note: string;
  createdAt: string;
  approvedBy: string | null;
  cancelledBy: string | null;
  cancelReason: string | null;
  items: { id: number; name: string; qty: number; pricePaise: number; status: string; isVeg: boolean }[];
};
export type GuestOrdersResponse = {
  tab: { id: number; billRequested: boolean } | null;
  orders: GuestOrder[];
  bill: ReturnType<typeof computeBill> | null;
};

type Props = {
  token: string;
  table: { number: number };
  restaurant: { name: string; tagline: string; vegOnly: boolean };
  menu: Category[];
  guest: { id: number; name: string } | null;
  gstRateBp: number;
  login: { google: boolean; sms: boolean };
  loginFailed: boolean;
};

type Screen = "menu" | "cart" | "login" | "orders";

export default function GuestApp(props: Props) {
  const { token, menu, gstRateBp } = props;
  const storageKey = `hp-cart-${token}`;
  const [screen, setScreen] = useState<Screen>("menu");
  const [cart, setCart] = useState<Cart>({});
  const [note, setNote] = useState("");
  const [guest, setGuest] = useState(props.guest);
  const [orders, setOrders] = useState<GuestOrdersResponse | null>(null);

  const dishById = useMemo(() => {
    const m = new Map<number, Dish>();
    for (const c of menu) for (const d of c.items) m.set(d.id, d);
    return m;
  }, [menu]);

  // Restore the cart if the guest reloads or comes back to the page.
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(storageKey) ?? "{}") as Cart;
      const clean: Cart = {};
      for (const [id, qty] of Object.entries(saved)) {
        const d = dishById.get(Number(id));
        if (d && d.inStock && qty > 0) clean[Number(id)] = Math.min(qty, 20);
      }
      setCart(clean);
    } catch {
      /* storage unavailable */
    }
  }, [storageKey, dishById]);

  useEffect(() => {
    try {
      localStorage.setItem(storageKey, JSON.stringify(cart));
    } catch {
      /* storage unavailable */
    }
  }, [cart, storageKey]);

  const setQty = useCallback((id: number, qty: number) => {
    setCart((c) => {
      const next = { ...c };
      if (qty <= 0) delete next[id];
      else next[id] = Math.min(qty, 20);
      return next;
    });
  }, []);

  const cartLines = useMemo(
    () =>
      Object.entries(cart)
        .map(([id, qty]) => ({ dish: dishById.get(Number(id))!, qty }))
        .filter((l) => l.dish),
    [cart, dishById],
  );
  const cartCount = cartLines.reduce((a, l) => a + l.qty, 0);
  const cartBill = computeBill(
    cartLines.map((l) => ({ pricePaise: l.dish.pricePaise, qty: l.qty })),
    0,
    gstRateBp,
  );

  const refreshOrders = useCallback(async () => {
    if (!guest) return;
    try {
      setOrders(await api<GuestOrdersResponse>(`/api/t/${token}/orders`));
    } catch {
      /* keep the last good data; poll again soon */
    }
  }, [guest, token]);

  // Poll for status changes while the guest has orders at this table.
  useEffect(() => {
    if (!guest) return;
    refreshOrders();
    const fast = screen === "orders";
    const id = setInterval(refreshOrders, fast ? 4000 : 15000);
    return () => clearInterval(id);
  }, [guest, screen, refreshOrders]);

  const activeOrders = orders?.orders.filter((o) => !["served", "cancelled"].includes(o.status)).length ?? 0;
  const needsChoice = orders?.orders.some((o) => o.status === "returned") ?? false;

  const placeOrder = async () => {
    await api(`/api/t/${token}/orders`, {
      body: { lines: cartLines.map((l) => ({ menuItemId: l.dish.id, qty: l.qty })), note: note.trim() || undefined },
    });
    setCart({});
    setNote("");
    await refreshOrders();
    setScreen("orders");
  };

  return (
    <main className="mx-auto min-h-dvh max-w-[560px] bg-sand shadow-[0_0_0_1px_rgba(0,0,0,0.03)]">
      {screen === "menu" && (
        <MenuScreen
          restaurant={props.restaurant}
          table={props.table}
          menu={menu}
          cart={cart}
          setQty={setQty}
          guestName={guest?.name ?? null}
          onSignIn={() => setScreen("login")}
          ordersBadge={{ count: activeOrders, alert: needsChoice }}
          onOrders={() => setScreen("orders")}
          footer={
            cartCount > 0 ? (
              <button
                onClick={() => setScreen("cart")}
                className="flex h-[60px] w-full items-center justify-between rounded-2xl bg-palm-700 px-5 text-white shadow-[0_8px_24px_rgba(20,81,61,0.35)] transition active:scale-[0.99]"
              >
                <span className="flex flex-col items-start leading-tight">
                  <span className="text-[13px] font-semibold text-[#CFE1D8]">
                    {cartCount} {cartCount === 1 ? "item" : "items"}
                  </span>
                  <span className="text-[17px] font-extrabold">{formatRupees(cartBill.subtotalPaise)}</span>
                </span>
                <span className="text-base font-extrabold">View cart →</span>
              </button>
            ) : null
          }
        />
      )}
      {screen === "cart" && (
        <CartScreen
          restaurantName={props.restaurant.name}
          table={props.table}
          lines={cartLines}
          setQty={setQty}
          note={note}
          setNote={setNote}
          bill={cartBill}
          signedIn={!!guest}
          onBack={() => setScreen("menu")}
          onNeedLogin={() => setScreen("login")}
          onPlace={placeOrder}
        />
      )}
      {screen === "login" && (
        <LoginScreen
          token={token}
          restaurantName={props.restaurant.name}
          table={props.table}
          options={props.login}
          loginFailed={props.loginFailed}
          onBack={() => setScreen(cartCount > 0 ? "cart" : "menu")}
          onDone={(g) => {
            setGuest(g);
            setScreen(cartCount > 0 ? "cart" : "menu");
          }}
        />
      )}
      {screen === "orders" && (
        <OrdersScreen
          token={token}
          table={props.table}
          data={orders}
          refresh={refreshOrders}
          onMenu={() => setScreen("menu")}
        />
      )}
    </main>
  );
}
