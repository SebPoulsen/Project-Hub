"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useHub } from "@/app/providers";
import { DeleteProjectModal } from "@/components/DeleteProjectModal";
import type { ThemeName } from "@/lib/settings";

const NAV = [
  { href: "/", label: "Dashboard", icon: "◧" },
  { href: "/reflections", label: "Reflections", icon: "✎" },
  { href: "/todos", label: "To-dos", icon: "☑" },
  { href: "/notes", label: "Notes", icon: "❏" },
  { href: "/meetings", label: "Meetings", icon: "▤" },
  { href: "/research", label: "Research", icon: "◈" },
  { href: "/companies", label: "Companies", icon: "⚑" },
  { href: "/placement", label: "Placement", icon: "⌂" },
  { href: "/calendar", label: "Calendar", icon: "▦" },
];

const THEMES: { name: ThemeName; bg: string; accent: string }[] = [
  { name: "dark", bg: "#12151c", accent: "#e8a94a" },
  { name: "light", bg: "#faf9f6", accent: "#b5651d" },
  { name: "beige", bg: "#ece5d8", accent: "#8a6d3b" },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { projects, current, selectProject, createProject, theme, setTheme } =
    useHub();
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const foldoutRef = useRef<HTMLDivElement>(null);

  // Close the Settings fold-out when clicking anywhere outside it.
  useEffect(() => {
    if (!settingsOpen) return;
    const onDown = (e: MouseEvent) => {
      if (foldoutRef.current && !foldoutRef.current.contains(e.target as Node)) {
        setSettingsOpen(false);
      }
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [settingsOpen]);

  async function handleCreate() {
    const name = newName.trim();
    if (!name) return;
    await createProject(name);
    setNewName("");
    setCreating(false);
  }

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="brand">
          <span className="dot" />
          Project Hub
        </div>

        {/* Current project */}
        <div className="label" style={{ padding: "0 12px 12px" }}>
          Project: {current?.name ?? "None"}
        </div>

        {/* Primary navigation */}
        <nav className="stack" style={{ gap: 2 }}>
          {NAV.map((n) => {
            const active =
              n.href === "/" ? pathname === "/" : pathname.startsWith(n.href);
            return (
              <Link
                key={n.href}
                href={n.href}
                className={`nav-link ${active ? "active" : ""}`}
              >
                <span style={{ width: 18, textAlign: "center" }}>{n.icon}</span>
                {n.label}
              </Link>
            );
          })}
        </nav>

        <div className="sidebar-spacer" />

        {/* Fold-out: project management + palette (collapsed by default) */}
        <div className="foldout" ref={foldoutRef}>
          <button
            className="foldout-head"
            aria-expanded={settingsOpen}
            onClick={() => setSettingsOpen((o) => !o)}
          >
            <span className="row" style={{ gap: 10 }}>
              <span style={{ width: 18, textAlign: "center" }}>⚙</span>
              Settings
            </span>
            <span className={`chev ${settingsOpen ? "open" : ""}`}>›</span>
          </button>

          {settingsOpen && (
            <div className="foldout-body stack">
              {/* Project switcher */}
              <div>
                <div className="label" style={{ marginBottom: 6 }}>
                  Project
                </div>
                {projects.length > 0 ? (
                  <select
                    value={current?.slug ?? ""}
                    onChange={(e) => selectProject(e.target.value)}
                  >
                    {projects.map((p) => (
                      <option key={p.slug} value={p.slug}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                ) : (
                  <div className="muted" style={{ fontSize: 13 }}>
                    No projects yet
                  </div>
                )}
              </div>

              {/* New project */}
              {creating ? (
                <div className="stack">
                  <input
                    type="text"
                    autoFocus
                    placeholder="New project name"
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleCreate()}
                  />
                  <div className="row">
                    <button className="btn btn-accent" onClick={handleCreate}>
                      Create
                    </button>
                    <button
                      className="btn btn-ghost"
                      onClick={() => setCreating(false)}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  className="btn"
                  style={{ width: "100%" }}
                  onClick={() => setCreating(true)}
                >
                  + New project
                </button>
              )}

              {/* Palette */}
              <div>
                <div className="label" style={{ marginBottom: 4 }}>
                  Palette
                </div>
                <div className="theme-swatches">
                  {THEMES.map((t) => (
                    <button
                      key={t.name}
                      title={t.name}
                      aria-label={`${t.name} theme`}
                      className={`swatch ${theme === t.name ? "active" : ""}`}
                      style={{ background: t.bg }}
                      onClick={() => setTheme(t.name)}
                    >
                      <span
                        style={{
                          position: "absolute",
                          right: 4,
                          bottom: 4,
                          width: 8,
                          height: 8,
                          borderRadius: "50%",
                          background: t.accent,
                        }}
                      />
                    </button>
                  ))}
                </div>
              </div>

              {/* Destructive action — kept visually distinct even when tucked away */}
              {current && (
                <button
                  className="btn btn-ghost danger"
                  style={{ width: "100%", fontSize: 13 }}
                  onClick={() => setDeleteOpen(true)}
                >
                  Delete project…
                </button>
              )}
            </div>
          )}
        </div>
      </aside>

      <main className="main">{children}</main>

      {deleteOpen && current && (
        <DeleteProjectModal
          project={current}
          onClose={() => setDeleteOpen(false)}
        />
      )}
    </div>
  );
}
