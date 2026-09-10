import type { Metadata } from "next";
import "./globals.css";
import { Providers } from "./providers";
import { AppShell } from "@/components/AppShell";
import { PendingDeletesProvider } from "@/components/PendingDeletes";

export const metadata: Metadata = {
  title: "Project Hub",
  description: "Local-first project companion. Your data, as plain files.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" data-theme="dark" suppressHydrationWarning>
      <body>
        <Providers>
          <PendingDeletesProvider>
            <AppShell>{children}</AppShell>
          </PendingDeletesProvider>
        </Providers>
      </body>
    </html>
  );
}
