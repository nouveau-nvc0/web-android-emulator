import { createServer, type Server } from "node:http";
import WebSocket, { WebSocketServer } from "ws";
import { afterEach, describe, expect, it } from "vitest";
import { createServerApp } from "../../src/server/app";
import { attachTouchWebSocket } from "../../src/server/websocketTouchBridge";
import { MockGrpcClient } from "./mockGrpc";
import type { EmulatorTouchEvent, GrpcCallback } from "../../src/server/types";

const display = { width: 1080, height: 1920, display: 0 };

let currentServer: Server | null = null;
let currentWss: WebSocketServer | null = null;
let currentClient: WebSocket | null = null;

afterEach(async () => {
  currentClient?.terminate();
  currentClient = null;

  if (currentWss) {
    await closeWebSocketServer(currentWss);
    currentWss = null;
  }

  if (currentServer) {
    await closeServer(currentServer);
    currentServer = null;
  }
});

describe("websocket touch bridge", () => {
  it("writes a down event to the stream", async () => {
    const { client, grpc } = await connect();

    client.send(message({ type: "down", id: 1 }));
    await waitFor(() => grpc.streams[0]?.events.length === 1);

    expect(grpc.streams[0]?.events[0]?.touch_event.touches[0]).toMatchObject({
      identifier: 0,
      pressure: 512
    });
  });

  it("keeps the same identifier for move", async () => {
    const { client, grpc } = await connect();

    client.send(message({ type: "down", id: 17 }));
    client.send(message({ type: "move", id: 17, x: 0.5, y: 0.5 }));
    await waitFor(() => grpc.streams[0]?.events.length === 2);

    expect(grpc.streams[0]?.events[0]?.touch_event.touches[0]?.identifier).toBe(0);
    expect(grpc.streams[0]?.events[1]?.touch_event.touches[0]?.identifier).toBe(0);
  });

  it("sends pressure 0 on up and releases the slot", async () => {
    const { client, grpc } = await connect();

    client.send(message({ type: "down", id: 1 }));
    client.send(message({ type: "up", id: 1, pressure: 1 }));
    client.send(message({ type: "down", id: 2 }));
    await waitFor(() => grpc.streams[0]?.events.length === 3);

    expect(grpc.streams[0]?.events[1]?.touch_event.touches[0]).toMatchObject({
      identifier: 0,
      pressure: 0
    });
    expect(grpc.streams[0]?.events[2]?.touch_event.touches[0]?.identifier).toBe(0);
  });

  it("ignores invalid JSON", async () => {
    const { client, grpc } = await connect();

    client.send("{");
    await delay(30);

    expect(grpc.streams[0]?.events).toHaveLength(0);
  });

  it("ignores invalid event type", async () => {
    const { client, grpc } = await connect();

    client.send(JSON.stringify({ type: "tap", id: 1, x: 0.1, y: 0.2 }));
    await delay(30);

    expect(grpc.streams[0]?.events).toHaveLength(0);
  });

  it("ends the stream when websocket closes", async () => {
    const { client, grpc } = await connect();

    client.close();
    await waitFor(() => grpc.streams[0]?.ended === true);

    expect(grpc.streams[0]?.ended).toBe(true);
  });

  it("ignores the eleventh simultaneous pointer", async () => {
    const { client, grpc } = await connect();

    for (let id = 0; id < 11; id += 1) {
      client.send(message({ type: "down", id }));
    }

    await waitFor(() => grpc.streams[0]?.events.length === 10);
    await delay(30);

    expect(grpc.streams[0]?.events).toHaveLength(10);
  });

  it("writes touch events with sendTouch in unary mode", async () => {
    const { client, grpc } = await connect("unary");

    client.send(message({ type: "down", id: 1 }));
    await waitFor(() => grpc.sentTouches.length === 1);

    expect(grpc.streams).toHaveLength(0);
    expect(grpc.sentTouches[0]?.touches[0]).toMatchObject({
      identifier: 0,
      pressure: 512
    });
  });

  it("serializes unary sendTouch calls and keeps only the latest pending move", async () => {
    const grpc = new DeferredUnaryGrpcClient();
    const { client } = await connect("unary", grpc);

    client.send(message({ type: "down", id: 1 }));
    await waitFor(() => grpc.sentTouches.length === 1);

    client.send(message({ type: "move", id: 1, x: 0.2, y: 0.2 }));
    client.send(message({ type: "move", id: 1, x: 0.3, y: 0.3 }));
    await delay(30);
    expect(grpc.sentTouches).toHaveLength(1);

    grpc.resolveNext();
    await waitFor(() => grpc.sentTouches.length === 2);

    expect(grpc.sentTouches[1]?.touches[0]).toMatchObject({
      identifier: 0,
      x: 324,
      y: 576
    });
  });
});

async function connect(
  inputMode: "stream" | "unary" = "stream",
  grpc: MockGrpcClient = new MockGrpcClient()
): Promise<{ client: WebSocket; grpc: MockGrpcClient }> {
  const app = createServerApp({ getDisplayConfig: () => display });
  const server = createServer(app);
  currentServer = server;
  currentWss = attachTouchWebSocket({
    server,
    emulator: grpc,
    getDisplayConfig: () => display,
    inputMode
  });
  const port = await listen(server);
  const client = new WebSocket(`ws://127.0.0.1:${port}/touch`);
  currentClient = client;
  await onceOpen(client);
  if (inputMode === "stream") {
    await waitFor(() => grpc.streams.length === 1);
  }

  return { client, grpc };
}

function message(overrides: { type: "down" | "move" | "up" | "cancel"; id: number; x?: number; y?: number; pressure?: number }): string {
  return JSON.stringify({
    x: 0.25,
    y: 0.5,
    pressure: 0.5,
    pointerType: "touch",
    ...overrides
  });
}

function listen(server: Server): Promise<number> {
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
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

function closeServer(server: Server): Promise<void> {
  if (!server.listening) {
    return Promise.resolve();
  }

  return new Promise((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error);
        return;
      }

      resolve();
    });
  });
}

function closeWebSocketServer(wss: WebSocketServer): Promise<void> {
  return new Promise((resolve, reject) => {
    wss.close((error) => {
      if (error) {
        reject(error);
        return;
      }

      resolve();
    });
  });
}

async function waitFor(predicate: () => boolean, timeoutMs = 500): Promise<void> {
  const startedAt = Date.now();

  while (!predicate()) {
    if (Date.now() - startedAt > timeoutMs) {
      throw new Error("timed out waiting for condition");
    }

    await delay(5);
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

class DeferredUnaryGrpcClient extends MockGrpcClient {
  private readonly callbacks: Array<GrpcCallback<Record<string, never>>> = [];

  override sendTouch(event: EmulatorTouchEvent, callback: GrpcCallback<Record<string, never>>): void {
    this.sentTouches.push(event);
    this.callbacks.push(callback);
  }

  resolveNext(): void {
    this.callbacks.shift()?.(null, {});
  }
}
