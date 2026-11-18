import { Suspense } from "react";

import { LoginView } from "./login-view";

export const metadata = { title: "Sign in" };

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginView />
    </Suspense>
  );
}
