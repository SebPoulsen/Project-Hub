import fs from "node:fs/promises";
import { companiesFile, exists } from "./paths";
import { cryptoRandomId } from "./projects";

export type CompanyStatus = "planned" | "visited";

/**
 * A company / site in the visits tracker. Stored in a flat `companies.json`
 * (parallel to todos.json / research.json). `status` distinguishes "ideas to
 * visit" (planned) from "already visited". Coordinates are optional — a company
 * without lat/lng simply doesn't get a map pin until one is set.
 */
export interface Company {
  id: string;
  name: string;
  status: CompanyStatus;
  address: string;
  website: string;
  notes: string;
  lat: number | null;
  lng: number | null;
  visitDate: string | null; // YYYY-MM-DD, for visited companies
  createdAt: string;
}

export interface CompaniesFile {
  items: Company[];
}

export function emptyCompanies(): CompaniesFile {
  return { items: [] };
}

function coerceNum(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/** Normalize a raw stored/POSTed record into a well-formed Company. */
function normalize(raw: Partial<Company> & { id: string }): Company {
  const status: CompanyStatus = raw.status === "visited" ? "visited" : "planned";
  return {
    id: raw.id,
    name: String(raw.name ?? "").trim() || "Untitled company",
    status,
    address: String(raw.address ?? "").trim(),
    website: String(raw.website ?? "").trim(),
    notes: String(raw.notes ?? "").trim(),
    lat: coerceNum(raw.lat),
    lng: coerceNum(raw.lng),
    visitDate: raw.visitDate ? String(raw.visitDate).slice(0, 10) : null,
    createdAt: raw.createdAt ?? new Date().toISOString(),
  };
}

export async function readCompanies(slug: string): Promise<CompaniesFile> {
  const file = companiesFile(slug);
  if (!(await exists(file))) return emptyCompanies();
  try {
    const parsed = JSON.parse(await fs.readFile(file, "utf8"));
    // Current shape.
    if (Array.isArray(parsed?.items)) {
      return { items: parsed.items.filter(Boolean).map(normalize) };
    }
    // Migrate the Phase-1 placeholder shape (a bare []).
    if (Array.isArray(parsed)) {
      return { items: parsed.filter(Boolean).map(normalize) };
    }
    return emptyCompanies();
  } catch {
    return emptyCompanies();
  }
}

export async function writeCompanies(
  slug: string,
  data: CompaniesFile
): Promise<void> {
  await fs.writeFile(
    companiesFile(slug),
    JSON.stringify({ items: data.items ?? [] }, null, 2)
  );
}

export type CompanyInput = Omit<Company, "id" | "createdAt">;

export async function createCompany(
  slug: string,
  input: Partial<CompanyInput>
): Promise<Company> {
  const file = await readCompanies(slug);
  const company = normalize({ ...input, id: `co-${cryptoRandomId()}` });
  file.items.push(company);
  await writeCompanies(slug, file);
  return company;
}

export async function updateCompany(
  slug: string,
  id: string,
  patch: Partial<CompanyInput>
): Promise<Company | null> {
  const file = await readCompanies(slug);
  const idx = file.items.findIndex((c) => c.id === id);
  if (idx === -1) return null;
  const merged = normalize({ ...file.items[idx], ...patch, id });
  file.items[idx] = merged;
  await writeCompanies(slug, file);
  return merged;
}

export async function deleteCompany(slug: string, id: string): Promise<boolean> {
  const file = await readCompanies(slug);
  const next = file.items.filter((c) => c.id !== id);
  if (next.length === file.items.length) return false;
  await writeCompanies(slug, { items: next });
  return true;
}
