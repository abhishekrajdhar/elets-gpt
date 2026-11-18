import { Suspense } from "react";

import { Spinner } from "@/components/ui";
import { WorkspaceView } from "@/components/workspace/workspace-view";

// Session-gated client page (see ../layout.tsx): navigations block on auth by design.
export const instant = false;

export const metadata = { title: "AI Workspace" };

export default function WorkspacePage() {
  return (
    <Suspense fallback={<div className="flex h-full items-center justify-center"><Spinner /></div>}>
      <WorkspaceView />
    </Suspense>
  );
}
