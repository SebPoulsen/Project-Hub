import type { Metadata } from "next";
import "./globals.css";
import { Providers } from "./providers";
import { AppShell } from "@/components/AppShell";
import { PendingDeletesProvider } from "@/components/PendingDeletes";
import { readSettings } from "@/lib/settings";

export const metadata: Metadata = {
  title: "Project Hub",
  description: "Local-first project companion. Your data, as plain files.",
};

// Read settings.json per request so the saved palette is known before the
// first paint (no flash of the default theme on reload).
export const dynamic = "force-dynamic";

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const settings = await readSettings();
  return (
    <html lang="en" data-theme={settings.theme} suppressHydrationWarning>
      <body>
        <Providers initialTheme={settings.theme}>
          <PendingDeletesProvider>
            <AppShell>{children}</AppShell>
          </PendingDeletesProvider>
        </Providers>
      </body>
    </html>
  );
}
