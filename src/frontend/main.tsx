import React from "react";
import { createRoot } from "react-dom/client";
import { loadFrontendConfig } from "./config";
import { RemoteEmulator } from "./RemoteEmulator";
import { readUrlAppPackage } from "./appLinking";
import { installFullscreenRequest, registerServiceWorker, syncManifestLink } from "./pwa";
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

  syncManifestLink(readUrlAppPackage());
  installFullscreenRequest();
  registerServiceWorker();

  createRoot(root as HTMLElement).render(
    <React.StrictMode>
      <RemoteEmulator />
    </React.StrictMode>
  );
}
