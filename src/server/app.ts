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

  if (options.debugRoutes) {
    app.get("/debug/state", (_req, res) => {
      res.json(options.getDebugState?.() ?? { display: options.getDisplayConfig() });
    });
  }

  return app;
}

function readFrontendConfig(options: AppOptions): {
  grpcWebUri: string;
  enableMouseInput: boolean;
  touchDebug: boolean;
  appLinkingEnabled: boolean;
} {
  const config = options.frontendConfig ?? {
    grpcWebUri: process.env.GRPC_WEB_URI ?? "/grpc",
    enableMouseInput: process.env.ENABLE_MOUSE_INPUT === "true",
    touchDebug: process.env.TOUCH_DEBUG === "true",
    appLinkingEnabled: Boolean(options.appControl) && process.env.APP_CONTROL_ENABLED !== "false"
  };

  return config;
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
