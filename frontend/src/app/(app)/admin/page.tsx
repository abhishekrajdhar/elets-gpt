import { Suspense } from "react";

import { AdminView } from "@/components/admin/admin-view";
import { Spinner } from "@/components/ui";

// Session-gated client page (see ../layout.tsx): navigations block on auth by design.
export const instant = false;

export const metadata = { title: "Administration" };

export default function Page() {
  return (
    <Suspense fallback={<div className="flex h-full items-center justify-center"><Spinner /></div>}>
      <AdminView />
    </Suspense>
  );
}
