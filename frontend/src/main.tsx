import { createRoot } from "react-dom/client";
import { RouterProvider } from "react-router/dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { router } from "./router";
import { ErrorBoundary } from "./components/ErrorBoundary";
import "./styles/globals.css";

const queryClient = new QueryClient({ defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false } } });
// A report saved, generated or moved to the bin refreshes every list and count of 报告中心 at once,
// so 首页, 我的工作 and the period summary never show the state before it (query 2026-1023 1044).
window.addEventListener("dox-artifacts-changed", () => {
  for (const queryKey of [["results"], ["recent"], ["mine"], ["home"], ["admin"]]) void queryClient.invalidateQueries({ queryKey });
});

const rootElement = document.getElementById("root");
if (rootElement) {
  createRoot(rootElement).render(
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>
    </ErrorBoundary>,
  );
}
