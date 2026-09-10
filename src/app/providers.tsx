"use client";

import React, {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
} from "react";
import type { Project } from "@/lib/projects";
import type { ThemeName } from "@/lib/settings";

interface Ctx {
  loading: boolean;
  projects: Project[];
  current: Project | null;
  theme: ThemeName;
  setTheme: (t: ThemeName) => void;
  selectProject: (slug: string) => void;
  createProject: (name: string) => Promise<Project | null>;
  reloadProjects: () => Promise<void>;
}

const HubContext = createContext<Ctx | null>(null);

export function useHub(): Ctx {
  const ctx = useContext(HubContext);
  if (!ctx) throw new Error("useHub must be used within <Providers>");
  return ctx;
}

export function Providers({ children }: { children: React.ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [projects, setProjects] = useState<Project[]>([]);
  const [current, setCurrent] = useState<Project | null>(null);
  const [theme, setThemeState] = useState<ThemeName>("dark");

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
        selectProject,
        createProject,
        reloadProjects,
      }}
    >
      {children}
    </HubContext.Provider>
  );
}
