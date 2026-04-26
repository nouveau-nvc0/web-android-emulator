import { createServer } from "node:http";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import { AdbAppControl } from "./adbAppControl.js";
import { createServerApp } from "./app.js";
import { DisplayConfigStore, fallbackDisplayConfigFromEnv } from "./displayConfig.js";
import { createGrpcClient } from "./grpcClient.js";
import { attachTouchWebSocket } from "./websocketTouchBridge.js";
import type { InputMode } from "./types.js";

const PORT = Number(process.env.PORT ?? 3000);
const EMULATOR_GRPC = process.env.EMULATOR_GRPC ?? "emulator:8554";
const INPUT_MODE = parseInputMode(process.env.INPUT_MODE);
const DEBUG_ROUTES = process.env.DEBUG_ROUTES === "true";
const GRPC_WEB_URI = process.env.GRPC_WEB_URI ?? "/grpc";
const APP_CONTROL_ENABLED = process.env.APP_CONTROL_ENABLED !== "false";
const EMULATOR_ADB_SERIAL = process.env.EMULATOR_ADB_SERIAL ?? "emulator:5555";
const ADB_BIN = process.env.ADB_BIN ?? "adb";
const ADBKEY = process.env.ADBKEY;
const ADBKEY_PUB = process.env.ADBKEY_PUB;

const client = createGrpcClient({
  target: EMULATOR_GRPC,
  protoPath: process.env.EMULATOR_PROTO
});
const displayStore = new DisplayConfigStore(client, fallbackDisplayConfigFromEnv());
displayStore.start();
const appControl = APP_CONTROL_ENABLED
  ? new AdbAppControl({
      adbBin: ADB_BIN,
      serial: EMULATOR_ADB_SERIAL,
      adbKey: ADBKEY,
      adbKeyPub: ADBKEY_PUB
    })
  : undefined;

const app = createServerApp({
  getDisplayConfig: () => displayStore.get(),
  getEmulatorStatus: () => displayStore.getStatus(),
  debugRoutes: DEBUG_ROUTES,
  appControl,
  frontendConfig: {
    grpcWebUri: GRPC_WEB_URI,
    enableMouseInput: process.env.ENABLE_MOUSE_INPUT === "true",
    touchDebug: process.env.TOUCH_DEBUG === "true",
    appLinkingEnabled: APP_CONTROL_ENABLED
  },
  getDebugState: () => ({
    display: displayStore.get(),
    emulatorStatus: displayStore.getStatus(),
    inputMode: INPUT_MODE,
    emulatorGrpc: EMULATOR_GRPC,
    appControlEnabled: APP_CONTROL_ENABLED,
    emulatorAdbSerial: EMULATOR_ADB_SERIAL
  })
});

serveFrontend(app);

const server = createServer(app);
attachTouchWebSocket({
  server,
  emulator: client,
  getDisplayConfig: () => displayStore.get(),
  inputMode: INPUT_MODE
});

server.listen(PORT, () => {
  console.info(`remote android emulator app listening on ${PORT}`);
});

function parseInputMode(value: string | undefined): InputMode {
  return value === "stream" ? "stream" : "unary";
}

function serveFrontend(app: express.Express): void {
  const currentFile = fileURLToPath(import.meta.url);
  const frontendDir = join(dirname(currentFile), "../frontend");
  app.use(express.static(frontendDir));
  app.get(/.*/, (_req, res) => {
    res.sendFile(join(frontendDir, "index.html"));
  });
}
