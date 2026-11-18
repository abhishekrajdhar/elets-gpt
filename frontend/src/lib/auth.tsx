"use client";

import { QueryClient, QueryClientProvider, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";

import { ToastProvider } from "@/components/ui";
import { api, ApiError } from "./api";
import type { Capabilities, Me } from "./types";

export function Providers({ children }: { children: ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 15_000,
            refetchOnWindowFocus: false,
            retry: (count, err) => !(err instanceof ApiError && err.status < 500) && count < 2,
          },
        },
      }),
  );
  return (
    <QueryClientProvider client={client}>
      <ToastProvider>{children}</ToastProvider>
    </QueryClientProvider>
  );
}

export function useMe() {
  return useQuery({ queryKey: ["me"], queryFn: () => api<Me>("/auth/me"), staleTime: 60_000 });
}

export function useCan() {
  const { data } = useMe();
  return (permission: string) => !!data?.permissions.includes(permission);
}

export function useCapabilities() {
  return useQuery({
    queryKey: ["capabilities"],
    queryFn: () => api<Capabilities>("/system/capabilities"),
    staleTime: 5 * 60_000,
  });
}

/** Returns the feature descriptor (enabled + phase) for a capability key. */
export function useFeature(key: string) {
  const { data } = useCapabilities();
  return data?.features[key];
}

export function useLogout() {
  const qc = useQueryClient();
  const router = useRouter();
  return async () => {
    await api("/auth/logout", { method: "POST" }).catch(() => {});
    router.replace("/login");
    qc.clear();
  };
}
