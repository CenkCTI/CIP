"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";

export type WindowGeometry = {
  x: number; y: number; width: number; height: number;
  docked: boolean; minimized: boolean;
};
export const COPILOT_WINDOW_KEY = "citem:stage3-ai-window:v1";
const MIN_WIDTH = 360;
const MIN_HEIGHT = 360;
const DEFAULT_WIDTH = 440;
const DEFAULT_HEIGHT = 620;

export function clampGeometry(value: WindowGeometry, viewportWidth: number, viewportHeight: number): WindowGeometry {
  const width = Math.min(Math.max(MIN_WIDTH, value.width), Math.max(MIN_WIDTH, viewportWidth * .7));
  const height = Math.min(Math.max(MIN_HEIGHT, value.height), Math.max(MIN_HEIGHT, viewportHeight * .85));
  return {
    x: Math.max(0, Math.min(value.x, Math.max(0, viewportWidth - width))),
    y: Math.max(0, Math.min(value.y, Math.max(0, viewportHeight - (value.minimized ? 56 : height)))),
    width, height, docked: value.docked, minimized: value.minimized,
  };
}
function initial(): WindowGeometry {
  return { x: 80, y: 76, width: DEFAULT_WIDTH, height: DEFAULT_HEIGHT, docked: false, minimized: false };
}
function readGeometry(): WindowGeometry {
  try {
    const data = JSON.parse(window.sessionStorage.getItem(COPILOT_WINDOW_KEY) || "null") as Partial<WindowGeometry> | null;
    if (data && ["x", "y", "width", "height"].every(key => Number.isFinite(data[key as keyof WindowGeometry])) &&
        typeof data.docked === "boolean" && typeof data.minimized === "boolean") {
      return clampGeometry(data as WindowGeometry, window.innerWidth, window.innerHeight);
    }
  } catch { /* Storage can be unavailable; use in-memory window state. */ }
  const value = initial();
  return clampGeometry({...value, x: Math.max(0, window.innerWidth - DEFAULT_WIDTH - 28)}, window.innerWidth, window.innerHeight);
}

export function useCopilotWindow() {
  const [geometry, setGeometry] = useState<WindowGeometry>(initial);
  const [mobile, setMobile] = useState(false);
  const drag = useRef<{pointerId: number; x: number; y: number; origin: WindowGeometry; mode: "move" | "resize"} | null>(null);

  useEffect(() => {
    const media = window.matchMedia("(max-width: 767px)");
    const update = () => {
      setMobile(media.matches);
      setGeometry(current => clampGeometry(current, window.innerWidth, window.innerHeight));
    };
    setGeometry(readGeometry());
    update();
    window.addEventListener("resize", update);
    media.addEventListener("change", update);
    return () => { window.removeEventListener("resize", update); media.removeEventListener("change", update); };
  }, []);

  useEffect(() => {
    try { window.sessionStorage.setItem(COPILOT_WINDOW_KEY, JSON.stringify(geometry)); } catch {}
  }, [geometry]);

  const begin = useCallback((event: ReactPointerEvent<HTMLElement>, mode: "move" | "resize") => {
    if (mobile || geometry.docked || geometry.minimized || event.button !== 0) return;
    if (mode === "move" && (event.target as HTMLElement).closest("button,input,textarea,select,a")) return;
    drag.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, origin: geometry, mode };
    event.currentTarget.setPointerCapture(event.pointerId);
  }, [geometry, mobile]);
  const move = useCallback((event: ReactPointerEvent<HTMLElement>) => {
    const state = drag.current;
    if (!state || state.pointerId !== event.pointerId) return;
    const dx = event.clientX - state.x, dy = event.clientY - state.y;
    const next = state.mode === "move"
      ? {...state.origin, x: state.origin.x + dx, y: state.origin.y + dy}
      : {...state.origin, width: state.origin.width + dx, height: state.origin.height + dy};
    setGeometry(clampGeometry(next, window.innerWidth, window.innerHeight));
  }, []);
  const end = useCallback((event: ReactPointerEvent<HTMLElement>) => {
    if (drag.current?.pointerId === event.pointerId) drag.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  }, []);

  const toggleDock = useCallback(() => setGeometry(old => ({...old, docked: !old.docked, minimized: false})), []);
  const toggleMinimized = useCallback(() => setGeometry(old => ({...old, minimized: !old.minimized})), []);
  return {geometry, mobile, begin, move, end, toggleDock, toggleMinimized};
}
