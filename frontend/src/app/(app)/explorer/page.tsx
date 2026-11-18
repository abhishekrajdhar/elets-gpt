import { Suspense } from "react";

import { ExplorerView } from "@/components/explorer/explorer-view";
import { Spinner } from "@/components/ui";

// Session-gated client page (see ../layout.tsx): navigations block on auth by design.
export const instant = false;

export const metadata = { title: "Knowledge Explorer" };

export default function ExplorerPage() {
  return (
    <Suspense fallback={<div className="flex h-full items-center justify-center"><Spinner /></div>}>
      <ExplorerView />
    </Suspense>
  );
}
