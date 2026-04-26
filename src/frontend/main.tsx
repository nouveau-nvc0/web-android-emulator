import React from "react";
import { createRoot } from "react-dom/client";
import { loadFrontendConfig } from "./config";
import { RemoteEmulator } from "./RemoteEmulator";
import "./styles.css";

const root = document.getElementById("root");

if (!root) {
  throw new Error("root element not found");
}

void bootstrap();

async function bootstrap(): Promise<void> {
  await loadFrontendConfig().catch((error: unknown) => {
    console.warn("runtime config unavailable; using frontend defaults", error);
  });

  createRoot(root as HTMLElement).render(
    <React.StrictMode>
      <RemoteEmulator />
    </React.StrictMode>
  );
}
