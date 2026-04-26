import express from "express";
import type { DisplayConfig, InputMode } from "./types.js";

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
  };
  getDebugState?: () => {
    display: DisplayConfig;
    inputMode: InputMode;
    emulatorGrpc: string;
  };
}

export function createServerApp(options: AppOptions): express.Express {
  const app = express();

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
} {
    const config = options.frontendConfig ?? {
      grpcWebUri: process.env.GRPC_WEB_URI ?? "/grpc",
      enableMouseInput: process.env.ENABLE_MOUSE_INPUT === "true",
      touchDebug: process.env.TOUCH_DEBUG === "true"
    };

  return config;
}
