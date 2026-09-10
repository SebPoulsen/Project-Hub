"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { usePathname } from "next/navigation";

/**
 * Soft-delete + undo, scoped to reflections, notes and todos.
 *
 * A caller hides the item in its own UI immediately, then calls
 * `scheduleDelete`. We show a top toast with Undo for ~5s.
 *  - Undo pressed  -> cancel; call the caller's onUndo to restore its UI.
 *  - Timer expires -> run `perform` (the real file removal + git commit).
 *  - Navigation    -> flush: run `perform` for everything still pending, so a
 *    delete is never left dangling across pages (navigating away confirms it).
 *
 * `perform` MUST be self-contained (it may run after the caller unmounts on
 * navigation); `onUndo` only runs while the caller is still mounted.
 */
interface ScheduleOpts {
  label: string;
  perform: () => Promise<void> | void;
  onUndo: () => void;
}

interface Ctx {
  scheduleDelete: (opts: ScheduleOpts) => void;
}

const PendingDeletesContext = createContext<Ctx | null>(null);

export function usePendingDeletes(): Ctx {
  const ctx = useContext(PendingDeletesContext);
  if (!ctx)
    throw new Error("usePendingDeletes must be used within PendingDeletesProvider");
  return ctx;
}

const DELAY_MS = 5000;

interface Entry {
  timer: ReturnType<typeof setTimeout>;
  perform: () => Promise<void> | void;
  onUndo: () => void;
}

export function PendingDeletesProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [toasts, setToasts] = useState<{ id: string; label: string }[]>([]);
  const pending = useRef<Map<string, Entry>>(new Map());

  const finalize = useCallback((id: string) => {
    const e = pending.current.get(id);
    if (!e) return;
    clearTimeout(e.timer);
    pending.current.delete(id);
    setToasts((t) => t.filter((x) => x.id !== id));
    Promise.resolve(e.perform()).catch(() => {});
  }, []);

  const undo = useCallback((id: string) => {
    const e = pending.current.get(id);
    if (!e) return;
    clearTimeout(e.timer);
    pending.current.delete(id);
    setToasts((t) => t.filter((x) => x.id !== id));
    e.onUndo();
  }, []);

  const scheduleDelete = useCallback(
    (opts: ScheduleOpts) => {
      const id = Math.random().toString(36).slice(2, 9);
      const timer = setTimeout(() => finalize(id), DELAY_MS);
      pending.current.set(id, {
        timer,
        perform: opts.perform,
        onUndo: opts.onUndo,
      });
      setToasts((t) => [...t, { id, label: opts.label }]);
    },
    [finalize]
  );

  // Flush every pending delete when the route changes (confirm-on-navigate).
  const pathname = usePathname();
  const prevPath = useRef(pathname);
  useEffect(() => {
    if (prevPath.current !== pathname) {
      prevPath.current = pathname;
      [...pending.current.keys()].forEach((id) => finalize(id));
    }
  }, [pathname, finalize]);

  // Safety net: flush anything still pending if the whole app unmounts.
  useEffect(() => {
    const map = pending.current;
    return () => {
      map.forEach((e) => {
        clearTimeout(e.timer);
        Promise.resolve(e.perform()).catch(() => {});
      });
      map.clear();
    };
  }, []);

  return (
    <PendingDeletesContext.Provider value={{ scheduleDelete }}>
      {children}
      {toasts.length > 0 && (
        <div className="toast-wrap">
          {toasts.map((t) => (
            <div key={t.id} className="toast" role="status">
              <span className="toast-label">{t.label}</span>
              <button className="toast-undo" onClick={() => undo(t.id)}>
                Undo
              </button>
            </div>
          ))}
        </div>
      )}
    </PendingDeletesContext.Provider>
  );
}
