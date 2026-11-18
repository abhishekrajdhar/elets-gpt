import { Suspense } from "react";

import { KnowledgeView } from "@/components/knowledge/knowledge-view";
import { Spinner } from "@/components/ui";

// Session-gated client page (see ../layout.tsx): navigations block on auth by design.
export const instant = false;

export const metadata = { title: "Knowledge Management" };

export default function Page() {
  return (
    <Suspense fallback={<div className="flex h-full items-center justify-center"><Spinner /></div>}>
      <KnowledgeView />
    </Suspense>
  );
}
