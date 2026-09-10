"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { useHub } from "@/app/providers";
import type { ThemeName } from "@/lib/settings";

const NAV = [
  { href: "/", label: "Dashboard", icon: "◧" },
  { href: "/reflections", label: "Reflections", icon: "✎" },
  { href: "/todos", label: "To-dos", icon: "☑" },
  { href: "/notes", label: "Notes", icon: "❏" },
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

        {/* Project switcher */}
        <div style={{ padding: "0 6px 10px" }}>
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

          {creating ? (
            <div className="stack" style={{ marginTop: 8 }}>
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
              style={{ marginTop: 8, width: "100%" }}
              onClick={() => setCreating(true)}
            >
              + New project
            </button>
          )}
        </div>

        {/* Nav */}
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

        {/* Theme switcher */}
        <div style={{ padding: "0 6px" }}>
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
      </aside>

      <main className="main">{children}</main>
    </div>
  );
}
