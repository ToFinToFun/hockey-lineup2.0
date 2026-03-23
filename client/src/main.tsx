import { trpc } from "@/lib/trpc";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { httpBatchLink } from "@trpc/client";
import { createRoot } from "react-dom/client";
import superjson from "superjson";
import App from "./App";
import "./index.css";

const queryClient = new QueryClient();

const trpcClient = trpc.createClient({
  links: [
    httpBatchLink({
      url: "/api/trpc",
      transformer: superjson,
      fetch(input, init) {
        return globalThis.fetch(input, {
          ...(init ?? {}),
          credentials: "include",
        });
      },
    }),
  ],
});

createRoot(document.getElementById("root")!).render(
  <trpc.Provider client={trpcClient} queryClient={queryClient}>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </trpc.Provider>
);

// Dynamic manifest selection based on current route
function setManifest() {
  const path = window.location.pathname;
  let manifestUrl = "/manifest.json";
  if (path.startsWith("/lineup")) {
    manifestUrl = "/lineup-manifest.json";
  } else if (path.startsWith("/score")) {
    manifestUrl = "/score-manifest.json";
  }
  const existing = document.querySelector('link[rel="manifest"]');
  if (existing) {
    existing.setAttribute("href", manifestUrl);
  }
}

setManifest();

// Register service worker for PWA installability
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").then(
      (registration) => {
        console.log("[SW] Registered:", registration.scope);
      },
      (error) => {
        console.log("[SW] Registration failed:", error);
      }
    );
  });
}
