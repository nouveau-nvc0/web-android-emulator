export interface DOMRectLike {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface DisplayConfig {
  width: number;
  height: number;
  display: number;
}

export interface BrowserTouchMessage {
  type: "down" | "move" | "up" | "cancel";
  id: number;
  x: number;
  y: number;
  pressure: number;
  pointerType: "touch" | "pen" | "mouse";
}

export function normalizedPoint(params: {
  clientX: number;
  clientY: number;
  stageRect: DOMRectLike;
  emulatorWidth: number;
  emulatorHeight: number;
}): { x: number; y: number } | null {
  const { clientX, clientY, stageRect, emulatorWidth, emulatorHeight } = params;
  if (stageRect.width <= 0 || stageRect.height <= 0 || emulatorWidth <= 0 || emulatorHeight <= 0) {
    return null;
  }

  const stageAspect = stageRect.width / stageRect.height;
  const emulatorAspect = emulatorWidth / emulatorHeight;
  let contentWidth = stageRect.width;
  let contentHeight = stageRect.height;
  let offsetX = 0;
  let offsetY = 0;

  if (stageAspect > emulatorAspect) {
    contentHeight = stageRect.height;
    contentWidth = contentHeight * emulatorAspect;
    offsetX = (stageRect.width - contentWidth) / 2;
  } else if (stageAspect < emulatorAspect) {
    contentWidth = stageRect.width;
    contentHeight = contentWidth / emulatorAspect;
    offsetY = (stageRect.height - contentHeight) / 2;
  }

  const xInContent = clientX - stageRect.left - offsetX;
  const yInContent = clientY - stageRect.top - offsetY;

  if (xInContent < 0 || yInContent < 0 || xInContent > contentWidth || yInContent > contentHeight) {
    return null;
  }

  return {
    x: clamp01(xInContent / contentWidth),
    y: clamp01(yInContent / contentHeight)
  };
}

export function containedContentRect(params: {
  frameRect: DOMRectLike;
  contentWidth: number;
  contentHeight: number;
}): DOMRectLike | null {
  const { frameRect, contentWidth, contentHeight } = params;
  if (frameRect.width <= 0 || frameRect.height <= 0 || contentWidth <= 0 || contentHeight <= 0) {
    return null;
  }

  const frameAspect = frameRect.width / frameRect.height;
  const contentAspect = contentWidth / contentHeight;
  let width = frameRect.width;
  let height = frameRect.height;
  let left = frameRect.left;
  let top = frameRect.top;

  if (frameAspect > contentAspect) {
    height = frameRect.height;
    width = height * contentAspect;
    left = frameRect.left + (frameRect.width - width) / 2;
  } else if (frameAspect < contentAspect) {
    width = frameRect.width;
    height = width / contentAspect;
    top = frameRect.top + (frameRect.height - height) / 2;
  }

  return { left, top, width, height };
}

export function mediaContentRect(container: HTMLElement | null): DOMRectLike | null {
  const media = container?.querySelector("video, canvas, img");
  if (!media) {
    return null;
  }

  const frameRect = media.getBoundingClientRect();
  const intrinsicSize = getIntrinsicMediaSize(media);
  if (!intrinsicSize) {
    return null;
  }

  return containedContentRect({
    frameRect,
    contentWidth: intrinsicSize.width,
    contentHeight: intrinsicSize.height
  });
}

export function installTouchOverlay(params: {
  layer: HTMLElement;
  socketUrl: string;
  getDisplayConfig: () => DisplayConfig;
  getStageRect?: () => DOMRectLike | null;
  enableMouseInput?: boolean;
  onDebugPoints?: (points: Map<number, { x: number; y: number }>) => void;
}): () => void {
  const sender = new TouchSocket(params.socketUrl);
  const activePointers = new Set<number>();
  const lastPoints = new Map<number, { x: number; y: number }>();
  const debugPoints = new Map<number, { x: number; y: number }>();

  const emitDebug = (): void => {
    params.onDebugPoints?.(new Map(debugPoints));
  };

  const toNormalized = (event: PointerEvent): { x: number; y: number } | null => {
    const display = params.getDisplayConfig();
    const stageRect = params.getStageRect?.() ?? params.layer.getBoundingClientRect();
    return normalizedPoint({
      clientX: event.clientX,
      clientY: event.clientY,
      stageRect,
      emulatorWidth: display.width,
      emulatorHeight: display.height
    });
  };

  const send = (event: PointerEvent, type: BrowserTouchMessage["type"], point: { x: number; y: number }): void => {
    const message: BrowserTouchMessage = {
      type,
      id: event.pointerId,
      x: point.x,
      y: point.y,
      pressure: type === "up" || type === "cancel" ? 0 : normalizePressure(event.pressure),
      pointerType: event.pointerType as BrowserTouchMessage["pointerType"]
    };
    sender.send(message);
  };

  const onPointerDown = (event: PointerEvent): void => {
    if (!isAllowedPointer(event, params.enableMouseInput === true)) {
      return;
    }

    event.preventDefault();
    const point = toNormalized(event);
    if (!point) {
      return;
    }

    params.layer.setPointerCapture(event.pointerId);
    activePointers.add(event.pointerId);
    lastPoints.set(event.pointerId, point);
    debugPoints.set(event.pointerId, point);
    emitDebug();
    send(event, "down", point);
  };

  const onPointerMove = (event: PointerEvent): void => {
    if (!activePointers.has(event.pointerId)) {
      return;
    }

    event.preventDefault();
    const coalescedEvents = event.getCoalescedEvents?.() ?? [event];
    const latestEvent = coalescedEvents.at(-1) ?? event;
    const point = toNormalized(latestEvent);
    if (point) {
      lastPoints.set(event.pointerId, point);
      debugPoints.set(event.pointerId, point);
      send(latestEvent, "move", point);
    }

    emitDebug();
  };

  const release = (event: PointerEvent, type: "up" | "cancel"): void => {
    if (!activePointers.has(event.pointerId)) {
      return;
    }

    event.preventDefault();
    const point = toNormalized(event) ?? lastPoints.get(event.pointerId);
    if (point) {
      send(event, type, point);
    }

    activePointers.delete(event.pointerId);
    lastPoints.delete(event.pointerId);
    debugPoints.delete(event.pointerId);
    emitDebug();

    if (params.layer.hasPointerCapture(event.pointerId)) {
      params.layer.releasePointerCapture(event.pointerId);
    }
  };

  const onPointerUp = (event: PointerEvent): void => release(event, "up");
  const onPointerCancel = (event: PointerEvent): void => release(event, "cancel");
  const onContextMenu = (event: MouseEvent): void => event.preventDefault();

  params.layer.addEventListener("pointerdown", onPointerDown);
  params.layer.addEventListener("pointermove", onPointerMove);
  params.layer.addEventListener("pointerup", onPointerUp);
  params.layer.addEventListener("pointercancel", onPointerCancel);
  params.layer.addEventListener("contextmenu", onContextMenu);

  return () => {
    params.layer.removeEventListener("pointerdown", onPointerDown);
    params.layer.removeEventListener("pointermove", onPointerMove);
    params.layer.removeEventListener("pointerup", onPointerUp);
    params.layer.removeEventListener("pointercancel", onPointerCancel);
    params.layer.removeEventListener("contextmenu", onContextMenu);
    sender.close();
  };
}

class TouchSocket {
  private socket: WebSocket | null = null;
  private closed = false;
  private reconnectTimer: number | null = null;

  constructor(private readonly url: string) {
    this.connect();
  }

  send(message: BrowserTouchMessage): void {
    if (this.socket?.readyState !== WebSocket.OPEN) {
      return;
    }

    this.socket.send(JSON.stringify(message));
  }

  close(): void {
    this.closed = true;
    if (this.reconnectTimer !== null) {
      window.clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    this.socket?.close();
  }

  private connect(): void {
    this.socket = new WebSocket(this.url);
    this.socket.addEventListener("close", () => this.scheduleReconnect());
    this.socket.addEventListener("error", () => this.socket?.close());
  }

  private scheduleReconnect(): void {
    if (this.closed || this.reconnectTimer !== null) {
      return;
    }

    this.reconnectTimer = window.setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, 1000);
  }
}

function isAllowedPointer(event: PointerEvent, enableMouseInput: boolean): boolean {
  return event.pointerType === "touch" || event.pointerType === "pen" || (enableMouseInput && event.pointerType === "mouse");
}

function normalizePressure(pressure: number): number {
  return clamp01(pressure || 0.5);
}

function getIntrinsicMediaSize(media: Element): { width: number; height: number } | null {
  if (media instanceof HTMLVideoElement && media.videoWidth > 0 && media.videoHeight > 0) {
    return {
      width: media.videoWidth,
      height: media.videoHeight
    };
  }

  if (media instanceof HTMLCanvasElement && media.width > 0 && media.height > 0) {
    return {
      width: media.width,
      height: media.height
    };
  }

  if (media instanceof HTMLImageElement && media.naturalWidth > 0 && media.naturalHeight > 0) {
    return {
      width: media.naturalWidth,
      height: media.naturalHeight
    };
  }

  return null;
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.min(1, Math.max(0, value));
}
