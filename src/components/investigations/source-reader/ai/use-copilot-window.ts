"use client";

import { useCallback, useEffect, useState, type PointerEvent } from "react";

export const COPILOT_WINDOW_KEY = "citem:stage3-ai-window:v1";
export type CopilotGeometry = {
  x: number; y: number; width: number; height: number;
  docked: boolean; minimized: boolean;
};
const DEFAULT: CopilotGeometry = { x: 64, y: 72, width: 440, height: 620, docked: false, minimized: false };

export function clampCopilotGeometry(value: CopilotGeometry, viewportWidth: number, viewportHeight: number): CopilotGeometry {
  const width = Math.min(Math.max(360, value.width), Math.max(360, viewportWidth - 24));
  const height = Math.min(Math.max(360, value.height), Math.max(360, viewportHeight - 24));
  return {
    ...value, width, height,
    x: Math.max(0, Math.min(value.x, Math.max(0, viewportWidth - width))),
    y: Math.max(0, Math.min(value.y, Math.max(0, viewportHeight - (value.minimized ? 56 : height)))),
  };
}

function readSaved(): CopilotGeometry {
  try {
    const raw = window.sessionStorage.getItem(COPILOT_WINDOW_KEY);
    const input = raw ? JSON.parse(raw) as Partial<CopilotGeometry> : null;
    if (!input || ![input.x,input.y,input.width,input.height].every((v) => typeof v === "number" && Number.isFinite(v))) {
      return clampCopilotGeometry({ ...DEFAULT, x: window.innerWidth - 464 }, window.innerWidth, window.innerHeight);
    }
    return clampCopilotGeometry({
      x: input.x!, y: input.y!, width: input.width!, height: input.height!,
      docked: input.docked === true, minimized: input.minimized === true,
    }, window.innerWidth, window.innerHeight);
  } catch {
    return clampCopilotGeometry(DEFAULT, window.innerWidth, window.innerHeight);
  }
}

export function useCopilotWindow() {
  const [geometry, setGeometry] = useState<CopilotGeometry>(DEFAULT);
  const [mobile, setMobile] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => {
    const update = () => {
      setMobile(window.innerWidth < 768);
      setGeometry((previous) => clampCopilotGeometry(previous, window.innerWidth, window.innerHeight));
    };
    const saved=readSaved();
    const frame=window.requestAnimationFrame(() => {
      setGeometry(clampCopilotGeometry(saved,window.innerWidth,window.innerHeight));
      setMobile(window.innerWidth<768);
      setHydrated(true);
    });
    window.addEventListener("resize", update);
    return () => {window.cancelAnimationFrame(frame);window.removeEventListener("resize", update);};
  }, []);
  useEffect(() => {
    if (!hydrated) return;
    try { window.sessionStorage.setItem(COPILOT_WINDOW_KEY, JSON.stringify(geometry)); } catch {}
  }, [geometry,hydrated]);

  const setDocked = useCallback(() => setGeometry((v) => ({ ...v, docked: !v.docked, minimized: false })), []);
  const setMinimized = useCallback(() => setGeometry((v) => ({ ...v, minimized: !v.minimized })), []);

  function startPointer(event: PointerEvent<HTMLElement>, mode: "drag" | "resize") {
    if (event.button !== 0 || mobile || geometry.docked) return;
    if (mode === "drag" && (event.target as Element).closest("button, input, select, textarea")) return;
    event.preventDefault();
    const el = event.currentTarget;
    const start = { x: event.clientX, y: event.clientY, geometry };
    el.setPointerCapture(event.pointerId);
    const move = (e: globalThis.PointerEvent) => {
      const dx = e.clientX - start.x, dy = e.clientY - start.y;
      const next = mode === "drag"
        ? { ...start.geometry, x: start.geometry.x + dx, y: start.geometry.y + dy }
        : { ...start.geometry, width: start.geometry.width + dx, height: start.geometry.height + dy };
      setGeometry(clampCopilotGeometry(next, window.innerWidth, window.innerHeight));
    };
    const stop = () => {
      el.removeEventListener("pointermove", move);
      el.removeEventListener("pointerup", stop);
      el.removeEventListener("pointercancel", stop);
      if (el.hasPointerCapture(event.pointerId)) el.releasePointerCapture(event.pointerId);
    };
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerup", stop);
    el.addEventListener("pointercancel", stop);
  }

  const style = mobile
    ? { left: 0, top: 0, width: "100vw", height: "100dvh" }
    : geometry.docked
      ? { right: 0, top: 64, width: Math.min(440, windowSafeWidth() - 12), height: geometry.minimized ? 56 : "calc(100dvh - 64px)" }
      : { left: geometry.x, top: geometry.y, width: geometry.width, height: geometry.minimized ? 56 : geometry.height };
  return { geometry, mobile, style, setDocked, setMinimized, startPointer };
}

function windowSafeWidth() { return typeof window === "undefined" ? 440 : window.innerWidth; }
