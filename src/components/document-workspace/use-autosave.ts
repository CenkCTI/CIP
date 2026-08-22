"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type AutosaveStatus = "saved" | "dirty" | "saving" | "error" | "conflict";

type SaveResult = { revision: number };

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
  const inFlightRef = useRef<Promise<boolean> | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(false);
  const [status, setStatus] = useState<AutosaveStatus>("saved");
  const [error, setError] = useState<string | null>(null);

  snapshotRef.current = snapshot;
  saveRef.current = save;

  const persist = useCallback(async (): Promise<boolean> => {
    if (status === "conflict") return false;
    if (inFlightRef.current) return inFlightRef.current;
    if (changeSeqRef.current === savedSeqRef.current) {
      setStatus("saved");
      return true;
    }

    const seq = changeSeqRef.current;
    const currentSnapshot = snapshotRef.current;
    const baseRevision = revisionRef.current;
    setStatus("saving");
    setError(null);

    const request = (async () => {
      try {
        const result = await saveRef.current(currentSnapshot, baseRevision);
        revisionRef.current = result.revision;
        savedSeqRef.current = seq;
        inFlightRef.current = null;
        if (changeSeqRef.current !== savedSeqRef.current) return persist();
        setStatus("saved");
        return true;
      } catch (cause) {
        inFlightRef.current = null;
        const message = cause instanceof Error ? cause.message : "Autosave failed.";
        setError(message);
        setStatus(message === "EDIT_CONFLICT" ? "conflict" : "error");
        return false;
      }
    })();

    inFlightRef.current = request;
    return request;
  }, [status]);

  useEffect(() => {
    if (!mountedRef.current) {
      mountedRef.current = true;
      return;
    }
    changeSeqRef.current += 1;
    if (status !== "conflict") setStatus("dirty");
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      void persist();
    }, debounceMs);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [snapshot, debounceMs, persist, status]);

  const flush = useCallback(async () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    return persist();
  }, [persist]);

  const retry = useCallback(async () => {
    if (status === "conflict") return false;
    return persist();
  }, [persist, status]);

  useEffect(() => {
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (changeSeqRef.current !== savedSeqRef.current || status === "error" || status === "conflict") {
        event.preventDefault();
        event.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", beforeUnload);
    return () => window.removeEventListener("beforeunload", beforeUnload);
  }, [status]);

  return { status, error, flush, retry, revision: revisionRef.current };
}
