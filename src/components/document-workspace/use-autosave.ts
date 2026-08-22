"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type AutosaveStatus = "saved" | "dirty" | "saving" | "error" | "conflict";

type SaveResult = { revision: number };
type FlushEvent = CustomEvent<{ promises: Promise<boolean>[] }>;

const AUTOSAVE_FLUSH_EVENT = "citem:autosave-flush";

export async function requestAutosaveFlush() {
  const detail = { promises: [] as Promise<boolean>[] };
  window.dispatchEvent(new CustomEvent(AUTOSAVE_FLUSH_EVENT, { detail }));
  if (!detail.promises.length) return true;
  const results = await Promise.all(detail.promises);
  return results.every(Boolean);
}

type Options<T> = {
  snapshot: T;
  initialRevision: number;
  save: (snapshot: T, baseRevision: number) => Promise<SaveResult>;
  debounceMs?: number;
};

export function useAutosave<T>({
  snapshot,
  initialRevision,
  save,
  debounceMs = 700,
}: Options<T>) {
  const snapshotRef = useRef(snapshot);
  const revisionRef = useRef(initialRevision);
  const saveRef = useRef(save);
  const changeSeqRef = useRef(0);
  const savedSeqRef = useRef(0);
  const conflictRef = useRef(false);
  const inFlightRef = useRef<Promise<boolean> | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(false);
  const [status, setStatus] = useState<AutosaveStatus>("saved");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    snapshotRef.current = snapshot;
    saveRef.current = save;
  }, [snapshot, save]);

  const persist = useCallback(async (): Promise<boolean> => {
    if (conflictRef.current) return false;
    if (inFlightRef.current) return inFlightRef.current;
    if (changeSeqRef.current === savedSeqRef.current) {
      setStatus("saved");
      return true;
    }

    const request = (async () => {
      while (!conflictRef.current && changeSeqRef.current !== savedSeqRef.current) {
        const seq = changeSeqRef.current;
        const currentSnapshot = snapshotRef.current;
        const baseRevision = revisionRef.current;
        setStatus("saving");
        setError(null);

        try {
          const result = await saveRef.current(currentSnapshot, baseRevision);
          revisionRef.current = result.revision;
          savedSeqRef.current = seq;
        } catch (cause) {
          const message = cause instanceof Error ? cause.message : "Autosave failed.";
          setError(message);
          if (message === "EDIT_CONFLICT") {
            conflictRef.current = true;
            setStatus("conflict");
          } else {
            setStatus("error");
          }
          return false;
        }
      }

      if (conflictRef.current) return false;
      setStatus("saved");
      return true;
    })();

    inFlightRef.current = request;
    const result = await request;
    inFlightRef.current = null;
    return result;
  }, []);

  useEffect(() => {
    if (!mountedRef.current) {
      mountedRef.current = true;
      return;
    }
    changeSeqRef.current += 1;
    if (!conflictRef.current) setStatus("dirty");
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      void persist();
    }, debounceMs);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [snapshot, debounceMs, persist]);

  const flush = useCallback(async () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    return persist();
  }, [persist]);

  const retry = useCallback(async () => {
    if (conflictRef.current) return false;
    return persist();
  }, [persist]);

  useEffect(() => {
    const onFlush = (event: Event) => {
      (event as FlushEvent).detail.promises.push(flush());
    };
    window.addEventListener(AUTOSAVE_FLUSH_EVENT, onFlush);
    return () => window.removeEventListener(AUTOSAVE_FLUSH_EVENT, onFlush);
  }, [flush]);

  useEffect(() => {
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (
        changeSeqRef.current !== savedSeqRef.current ||
        status === "error" ||
        status === "conflict"
      ) {
        event.preventDefault();
        event.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", beforeUnload);
    return () => window.removeEventListener("beforeunload", beforeUnload);
  }, [status]);

  return { status, error, flush, retry };
}
