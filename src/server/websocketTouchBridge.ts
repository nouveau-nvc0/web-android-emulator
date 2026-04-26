import type { Server as HttpServer } from "node:http";
import { WebSocketServer } from "ws";
import { TouchSlotAllocator } from "./slotAllocator.js";
import { toInputEvent, toTouchEvent } from "./touchMapper.js";
import type {
  BrowserTouchMessage,
  BrowserTouchType,
  DisplayConfig,
  EmulatorControllerClient,
  InputEventStream,
  InputMode,
  Logger
} from "./types.js";

const VALID_TYPES = new Set<BrowserTouchType>(["down", "move", "up", "cancel"]);

export interface TouchBridgeOptions {
  server: HttpServer;
  emulator: EmulatorControllerClient;
  getDisplayConfig: () => DisplayConfig;
  inputMode?: InputMode;
  logger?: Logger;
}

export function attachTouchWebSocket(options: TouchBridgeOptions): WebSocketServer {
  const logger = options.logger ?? console;
  const inputMode = options.inputMode ?? "unary";
  const wss = new WebSocketServer({ server: options.server, path: "/touch" });

  wss.on("connection", (socket) => {
    const allocator = new TouchSlotAllocator();
    const stream = inputMode === "stream" ? openInputStream(options.emulator, logger) : null;
    const unarySender = inputMode === "unary" ? new UnaryInputSender(options.emulator, logger) : null;

    socket.on("message", (raw) => {
      const msg = parseBrowserTouchMessage(raw.toString());
      if (!msg) {
        return;
      }

      const slot = allocator.get(msg.id);
      if (slot === null) {
        return;
      }

      const inputEvent = toInputEvent({
        msg,
        slot,
        display: options.getDisplayConfig()
      });

      writeInputEvent({
        inputEvent,
        inputMode,
        logger,
        msg,
        stream,
        unarySender
      });

      if (msg.type === "up" || msg.type === "cancel") {
        allocator.release(msg.id);
      }
    });

    socket.on("close", () => {
      if (stream) {
        stream.end();
      }

      allocator.releaseAll();
      unarySender?.close();
    });
  });

  return wss;
}

function openInputStream(emulator: EmulatorControllerClient, logger: Logger): InputEventStream {
  const stream = emulator.streamInputEvent((error) => {
    if (error) {
      logger.error("streamInputEvent callback error", error.message);
    }
  });

  stream.on("error", (error) => {
    logger.error("streamInputEvent stream error", error.message);
  });

  return stream;
}

function writeInputEvent(params: {
  inputEvent: ReturnType<typeof toInputEvent>;
  inputMode: InputMode;
  logger: Logger;
  msg: BrowserTouchMessage;
  stream: InputEventStream | null;
  unarySender: UnaryInputSender | null;
}): void {
  if (params.inputMode === "unary") {
    params.unarySender?.write({
      inputEvent: params.inputEvent,
      pointerId: params.msg.id,
      type: params.msg.type
    });
    return;
  }

  try {
    params.stream?.write(params.inputEvent);
  } catch (error) {
    params.logger.error("streamInputEvent write error", error instanceof Error ? error.message : String(error));
  }
}

class UnaryInputSender {
  private inFlight = false;
  private closed = false;
  private readonly criticalQueue: QueuedInputEvent[] = [];
  private readonly latestMoveByPointer = new Map<string, QueuedInputEvent>();

  constructor(
    private readonly emulator: EmulatorControllerClient,
    private readonly logger: Logger
  ) {}

  write(event: QueuedInputEvent): void {
    if (this.closed) {
      return;
    }

    if (event.type === "move") {
      if (this.inFlight || this.criticalQueue.length > 0) {
        this.latestMoveByPointer.set(event.pointerId, event);
        return;
      }

      this.sendNow(event);
      return;
    }

    if (event.type === "up" || event.type === "cancel") {
      this.latestMoveByPointer.delete(event.pointerId);
    }

    if (this.inFlight) {
      this.criticalQueue.push(event);
      return;
    }

    this.sendNow(event);
  }

  close(): void {
    this.closed = true;
    this.criticalQueue.length = 0;
    this.latestMoveByPointer.clear();
  }

  private sendNow(event: QueuedInputEvent): void {
    this.inFlight = true;
    this.emulator.sendTouch(toTouchEvent(event.inputEvent), (error) => {
      if (error) {
        this.logger.error("sendTouch error", error.message);
      }

      this.inFlight = false;
      this.flushNext();
    });
  }

  private flushNext(): void {
    if (this.closed) {
      return;
    }

    const criticalEvent = this.criticalQueue.shift();
    if (criticalEvent) {
      this.sendNow(criticalEvent);
      return;
    }

    const nextMove = this.latestMoveByPointer.values().next().value;
    if (!nextMove) {
      return;
    }

    this.latestMoveByPointer.delete(nextMove.pointerId);
    this.sendNow(nextMove);
  }
}

interface QueuedInputEvent {
  inputEvent: ReturnType<typeof toInputEvent>;
  pointerId: string;
  type: BrowserTouchType;
}

export function parseBrowserTouchMessage(raw: string): BrowserTouchMessage | null {
  let parsed: unknown;

  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }

  if (!isRecord(parsed)) {
    return null;
  }

  const type = parsed.type;
  if (typeof type !== "string" || !VALID_TYPES.has(type as BrowserTouchType)) {
    return null;
  }

  const x = Number(parsed.x);
  const y = Number(parsed.y);
  if (!Number.isFinite(x) || !Number.isFinite(y)) {
    return null;
  }

  return {
    type: type as BrowserTouchType,
    id: String(parsed.id),
    x,
    y,
    pressure: sanitizeOptionalNumber(parsed.pressure),
    pointerType: parsePointerType(parsed.pointerType)
  };
}

function sanitizeOptionalNumber(value: unknown): number | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }

  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : undefined;
}

function parsePointerType(value: unknown): BrowserTouchMessage["pointerType"] {
  if (value === "touch" || value === "pen" || value === "mouse") {
    return value;
  }

  return undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
