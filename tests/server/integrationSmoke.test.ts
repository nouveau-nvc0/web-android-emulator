import { createServer } from "node:http";
import request from "supertest";
import WebSocket, { WebSocketServer } from "ws";
import { afterEach, describe, expect, it } from "vitest";
import { createServerApp } from "../../src/server/app";
import { attachTouchWebSocket } from "../../src/server/websocketTouchBridge";
import { MockGrpcClient } from "./mockGrpc";

const display = { width: 1080, height: 1920, display: 0 };
let server: ReturnType<typeof createServer> | null = null;
let wss: WebSocketServer | null = null;

afterEach(async () => {
  if (wss) {
    await new Promise<void>((resolve, reject) => {
      wss?.close((error) => {
        if (error) {
          reject(error);
          return;
        }

        resolve();
      });
    });
    wss = null;
  }

  if (!server) {
    return;
  }

  if (!server.listening) {
    server = null;
    return;
  }

  await new Promise<void>((resolve, reject) => {
    server?.close((error) => {
      if (error) {
        reject(error);
        return;
      }

      resolve();
    });
  });
  server = null;
});

describe("integration smoke", () => {
  it("serves healthz, display-config, and accepts websocket touch", async () => {
    const grpc = new MockGrpcClient();
    const app = createServerApp({ getDisplayConfig: () => display });
    server = createServer(app);
    wss = attachTouchWebSocket({
      server,
      emulator: grpc,
      getDisplayConfig: () => display,
      inputMode: "stream"
    });
    const port = await listen(server);

    await request(app).get("/healthz").expect(200, { ok: true });
    await request(app).get("/display-config").expect(200, display);
    await request(app).get("/emulator-status").expect(200);

    const ws = new WebSocket(`ws://127.0.0.1:${port}/touch`);
    await onceOpen(ws);
    ws.send(JSON.stringify({ type: "down", id: 1, x: 0.1, y: 0.2, pressure: 0.5, pointerType: "touch" }));
    await waitFor(() => grpc.streams[0]?.events.length === 1);
    ws.terminate();

    expect(grpc.streams[0]?.events[0]?.touch_event.touches[0]).toMatchObject({
      identifier: 0,
      x: 108,
      y: 384
    });
  });

  it("serves app state and validates package launches", async () => {
    const launches: string[] = [];
    const app = createServerApp({
      getDisplayConfig: () => display,
      appControl: {
        getForegroundPackage: async () => ({
          packageName: "com.example.active",
          lastError: null,
          checkedAt: "2026-04-26T00:00:00.000Z"
        }),
        launchPackage: async (packageName) => {
          launches.push(packageName);
        }
      }
    });

    await request(app).get("/app-state").expect(200, {
      packageName: "com.example.active",
      lastError: null,
      checkedAt: "2026-04-26T00:00:00.000Z"
    });

    await request(app).post("/launch-app").send({ packageName: "com.example.target" }).expect(200, {
      packageName: "com.example.target"
    });
    await request(app).post("/launch-app").send({ packageName: "bad;package" }).expect(400);

    expect(launches).toEqual(["com.example.target"]);
  });
});

function listen(target: ReturnType<typeof createServer>): Promise<number> {
  return new Promise((resolve) => {
    target.listen(0, "127.0.0.1", () => {
      const address = target.address();
      if (address && typeof address === "object") {
        resolve(address.port);
      }
    });
  });
}

function onceOpen(client: WebSocket): Promise<void> {
  return new Promise((resolve, reject) => {
    client.once("open", () => resolve());
    client.once("error", reject);
  });
}

async function waitFor(predicate: () => boolean, timeoutMs = 500): Promise<void> {
  const startedAt = Date.now();

  while (!predicate()) {
    if (Date.now() - startedAt > timeoutMs) {
      throw new Error("timed out waiting for condition");
    }

    await new Promise((resolve) => {
      setTimeout(resolve, 5);
    });
  }
}
