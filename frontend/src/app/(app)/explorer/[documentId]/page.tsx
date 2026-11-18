import { Suspense } from "react";

import { DocumentView } from "@/components/explorer/document-view";
import { Spinner } from "@/components/ui";

// Session-gated client page (see ../layout.tsx): navigations block on auth by design.
export const instant = false;

export const metadata = { title: "Document" };

export default function DocumentPage() {
  return (
    <Suspense fallback={<div className="flex h-full items-center justify-center"><Spinner /></div>}>
      <DocumentView />
    </Suspense>
  );
}
