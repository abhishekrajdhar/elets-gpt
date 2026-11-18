import { Suspense } from "react";

import { Spinner } from "@/components/ui";
import { AppShell } from "@/components/shell/app-shell";

// Every page below is session-gated and client-rendered: the shell waits for /auth/me before rendering the page,
// so navigations into this group block on auth by design. Each page also opts out (the dropped segment is the page).
export const instant = false;

export default function AuthenticatedLayout({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={<div className="flex h-screen items-center justify-center"><Spinner className="h-5 w-5" /></div>}>
      <AppShell>{children}</AppShell>
    </Suspense>
  );
}
