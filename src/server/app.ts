import express from "express";
import { isValidAndroidPackageName } from "./androidPackage.js";
import type { AppControl, DisplayConfig, ForegroundAppState, InputMode } from "./types.js";

export interface AppOptions {
  getDisplayConfig: () => DisplayConfig;
  getEmulatorStatus?: () => {
    grpcAvailable: boolean;
    lastError: string | null;
    lastSuccessfulRefreshAt: string | null;
  };
  debugRoutes?: boolean;
  frontendConfig?: {
    grpcWebUri: string;
    enableMouseInput: boolean;
    touchDebug: boolean;
    appLinkingEnabled: boolean;
  };
  appControl?: AppControl;
  getDebugState?: () => {
    display: DisplayConfig;
    inputMode: InputMode;
    emulatorGrpc: string;
    emulatorStatus?: unknown;
    appControlEnabled?: boolean;
    emulatorAdbSerial?: string;
    androidNavigationMode?: string | null;
  };
}

export function createServerApp(options: AppOptions): express.Express {
  const app = express();

  app.use(express.json({ limit: "4kb" }));

  app.get("/healthz", (_req, res) => {
    res.json({ ok: true });
  });

  app.get("/display-config", (_req, res) => {
    res.json(options.getDisplayConfig());
  });

  app.get("/emulator-status", (_req, res) => {
    res.json(
      options.getEmulatorStatus?.() ?? {
        grpcAvailable: null,
        lastError: null,
        lastSuccessfulRefreshAt: null
      }
    );
  });

  app.get("/app-state", async (_req, res) => {
    if (!options.appControl) {
      res.json(disabledAppState());
      return;
    }

    try {
      res.json(await options.appControl.getForegroundPackage());
    } catch (error) {
      res.json({
        packageName: null,
        lastError: formatError(error),
        checkedAt: new Date().toISOString()
      } satisfies ForegroundAppState);
    }
  });

  app.post("/launch-app", async (req, res) => {
    if (!options.appControl) {
      res.status(503).json({ error: "app control disabled" });
      return;
    }

    const packageName = readPackageName(req.body);
    if (!packageName || !isValidAndroidPackageName(packageName)) {
      res.status(400).json({ error: "invalid packageName" });
      return;
    }

    try {
      await options.appControl.launchPackage(packageName);
      res.json({ packageName });
    } catch (error) {
      res.status(502).json({ error: formatError(error), packageName });
    }
  });

  app.get("/config.json", (_req, res) => {
    res.json(readFrontendConfig(options));
  });

  app.get("/config.js", (_req, res) => {
    const config = readFrontendConfig(options);
    res.type("application/javascript");
    res.send(`window.REMOTE_EMULATOR_CONFIG=${JSON.stringify(config)};`);
  });

  app.get("/manifest.webmanifest", (req, res) => {
    res.type("application/manifest+json");
    res.json(createWebManifest(readManifestPackage(req.query.app)));
  });

  if (options.debugRoutes) {
    app.get("/debug/state", (_req, res) => {
      res.json(options.getDebugState?.() ?? { display: options.getDisplayConfig() });
    });
  }

  return app;
}

function createWebManifest(packageName: string | null): {
  id: string;
  name: string;
  short_name: string;
  description: string;
  start_url: string;
  scope: string;
  display: "fullscreen";
  display_override: string[];
  orientation: "portrait";
  background_color: string;
  theme_color: string;
  icons: Array<{
    src: string;
    sizes: string;
    type: string;
    purpose?: string;
  }>;
} {
  const appSlug = packageName ? encodeURIComponent(packageName) : null;
  const shortName = packageName ? shortAppName(packageName) : "Emulator";

  return {
    id: appSlug ? `/pwa/${appSlug}` : "/pwa/default",
    name: packageName ? `Android ${shortName}` : "Remote Android Emulator",
    short_name: shortName,
    description: packageName ? `Remote Android Emulator shortcut for ${packageName}` : "Remote Android Emulator",
    start_url: packageName ? `/?app=${appSlug}` : "/",
    scope: "/",
    display: "fullscreen",
    display_override: ["fullscreen", "standalone", "minimal-ui"],
    orientation: "portrait",
    background_color: "#000000",
    theme_color: "#000000",
    icons: [
      {
        src: "/pwa-icon-192.png",
        sizes: "192x192",
        type: "image/png"
      },
      {
        src: "/pwa-icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "maskable"
      },
      {
        src: "/pwa-icon-512.png",
        sizes: "512x512",
        type: "image/png"
      },
      {
        src: "/pwa-icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable"
      }
    ]
  };
}

function readManifestPackage(value: unknown): string | null {
  return typeof value === "string" && isValidAndroidPackageName(value) ? value : null;
}

function shortAppName(packageName: string): string {
  const segment = packageName.split(".").at(-1) ?? packageName;
  return segment.length > 12 ? segment.slice(0, 12) : segment;
}

function readFrontendConfig(options: AppOptions): {
  grpcWebUri: string;
  enableMouseInput: boolean;
  touchDebug: boolean;
  appLinkingEnabled: boolean;
  displayConfig: DisplayConfig;
} {
  const config = options.frontendConfig ?? {
    grpcWebUri: process.env.GRPC_WEB_URI ?? "/grpc",
    enableMouseInput: process.env.ENABLE_MOUSE_INPUT === "true",
    touchDebug: process.env.TOUCH_DEBUG === "true",
    appLinkingEnabled: Boolean(options.appControl) && process.env.APP_CONTROL_ENABLED !== "false"
  };

  return {
    ...config,
    displayConfig: options.getDisplayConfig()
  };
}

function readPackageName(body: unknown): string | null {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return null;
  }

  const value = (body as { packageName?: unknown }).packageName;
  return typeof value === "string" ? value.trim() : null;
}

function disabledAppState(): ForegroundAppState {
  return {
    packageName: null,
    lastError: "app control disabled",
    checkedAt: null
  };
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
