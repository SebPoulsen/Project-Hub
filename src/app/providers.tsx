"use client";

import React, {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
} from "react";
import type { Project } from "@/lib/projects";
import type { ThemeName, MapView } from "@/lib/settings";

const DEFAULT_MAP_VIEW: MapView = { lat: 20, lng: 0, zoom: 2 };

interface Ctx {
  loading: boolean;
  projects: Project[];
  current: Project | null;
  theme: ThemeName;
  setTheme: (t: ThemeName) => void;
  mapDefault: MapView;
  setMapDefault: (v: MapView) => void;
  selectProject: (slug: string) => void;
  createProject: (name: string) => Promise<Project | null>;
  deleteProject: (slug: string) => Promise<void>;
  reloadProjects: () => Promise<void>;
}

const HubContext = createContext<Ctx | null>(null);

export function useHub(): Ctx {
  const ctx = useContext(HubContext);
  if (!ctx) throw new Error("useHub must be used within <Providers>");
  return ctx;
}

export function Providers({
  children,
  initialTheme = "dark",
}: {
  children: React.ReactNode;
  initialTheme?: ThemeName;
}) {
  const [loading, setLoading] = useState(true);
  const [projects, setProjects] = useState<Project[]>([]);
  const [current, setCurrent] = useState<Project | null>(null);
  // Seeded from the server-read palette (see layout) so it matches the theme
  // already on <html> — no post-hydration flip.
  const [theme, setThemeState] = useState<ThemeName>(initialTheme);
  const [mapDefault, setMapDefaultState] = useState<MapView>(DEFAULT_MAP_VIEW);

  const applyTheme = (t: ThemeName) => {
    document.documentElement.setAttribute("data-theme", t);
  };

  const setTheme = useCallback((t: ThemeName) => {
    setThemeState(t);
    applyTheme(t);
    fetch("/api/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ theme: t }),
    }).catch(() => {});
  }, []);

  const setMapDefault = useCallback((v: MapView) => {
    setMapDefaultState(v);
    fetch("/api/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mapDefault: v }),
    }).catch(() => {});
  }, []);

  const reloadProjects = useCallback(async () => {
    const res = await fetch("/api/projects");
    const list: Project[] = await res.json();
    setProjects(list);
    return;
  }, []);

  const selectProject = useCallback(
    (slug: string) => {
      const found = projects.find((p) => p.slug === slug) ?? null;
      setCurrent(found);
      fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lastProject: slug }),
      }).catch(() => {});
    },
    [projects]
  );

  const createProject = useCallback(
    async (name: string): Promise<Project | null> => {
      const res = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      if (!res.ok) return null;
      const project: Project = await res.json();
      const list = await fetch("/api/projects").then((r) => r.json());
      setProjects(list);
      setCurrent(project);
      return project;
    },
    []
  );

  const deleteProject = useCallback(
    async (slug: string): Promise<void> => {
      await fetch(`/api/projects?slug=${encodeURIComponent(slug)}`, {
        method: "DELETE",
      });
      const list: Project[] = await fetch("/api/projects").then((r) => r.json());
      setProjects(list);
      setCurrent((prev) => {
        if (prev && prev.slug !== slug) return prev; // deleted a different one
        return list[0] ?? null; // deleted the active one -> fall back
      });
    },
    []
  );

  // Initial load: settings + projects.
  useEffect(() => {
    (async () => {
      try {
        const [settings, list] = await Promise.all([
          fetch("/api/settings").then((r) => r.json()),
          fetch("/api/projects").then((r) => r.json()),
        ]);
        const t: ThemeName = settings?.theme ?? "dark";
        setThemeState(t);
        applyTheme(t);
        if (settings?.mapDefault) setMapDefaultState(settings.mapDefault);
        setProjects(list);
        const last =
          list.find((p: Project) => p.slug === settings?.lastProject) ??
          list[0] ??
          null;
        setCurrent(last);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  return (
    <HubContext.Provider
      value={{
        loading,
        projects,
        current,
        theme,
        setTheme,
        mapDefault,
        setMapDefault,
        selectProject,
        createProject,
        deleteProject,
        reloadProjects,
      }}
    >
      {children}
    </HubContext.Provider>
  );
}
