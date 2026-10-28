"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "@/components/ui";

/** Fetches a URL now and every `ms` while the tab is visible. */
export function usePoll<T>(url: string, ms = 4000) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const urlRef = useRef(url);
  urlRef.current = url;

  const load = useCallback(async () => {
    try {
      setData(await api<T>(urlRef.current));
      setError(null);
    } catch (e) {
      setError((e as Error).message);
      if ((e as Error).message === "Please sign in") window.location.href = "/staff/login";
    }
  }, []);

  useEffect(() => {
    load();
    const id = setInterval(() => {
      if (document.visibilityState === "visible") load();
    }, ms);
    const onVis = () => document.visibilityState === "visible" && load();
    document.addEventListener("visibilitychange", onVis);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [load, ms, url]);

  return { data, error, reload: load };
}

/** A short two-tone chime so staff hear new orders. */
export function chime() {
  try {
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new Ctx();
    [880, 1320].forEach((f, i) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.frequency.value = f;
      g.gain.setValueAtTime(0.0001, ctx.currentTime + i * 0.18);
      g.gain.exponentialRampToValueAtTime(0.25, ctx.currentTime + i * 0.18 + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + i * 0.18 + 0.16);
      o.connect(g).connect(ctx.destination);
      o.start(ctx.currentTime + i * 0.18);
      o.stop(ctx.currentTime + i * 0.18 + 0.18);
    });
    if ("vibrate" in navigator) navigator.vibrate(200);
  } catch {
    /* sound not available */
  }
}

export type StaffOrder = {
  id: number;
  status: string;
  note: string;
  createdAt: string;
  updatedAt: string;
  tabId: number;
  table: { id: number; number: number };
  restaurant: { id: number; name: string };
  guest: string;
  items: { id: number; name: string; qty: number; status: string; isVeg: boolean }[];
};

export function minutesAgo(iso: string) {
  const m = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  return m === 0 ? "just now" : m === 1 ? "1 min ago" : `${m} min ago`;
}
