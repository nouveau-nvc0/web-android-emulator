export type BrowserTouchType = "down" | "move" | "up" | "cancel";
export type BrowserPointerType = "touch" | "pen" | "mouse";
export type InputMode = "stream" | "unary";

export interface BrowserTouchMessage {
  type: BrowserTouchType;
  id: string;
  x: number;
  y: number;
  pressure?: number;
  pointerType?: BrowserPointerType;
}

export interface DisplayConfig {
  width: number;
  height: number;
  display: number;
}

export interface EmulatorTouch {
  x: number;
  y: number;
  identifier: number;
  pressure: number;
  touch_major: number;
  touch_minor: number;
  orientation: number;
}

export interface EmulatorTouchEvent {
  display: number;
  touches: EmulatorTouch[];
}

export interface EmulatorInputEvent {
  touch_event: EmulatorTouchEvent;
}

export interface DisplayConfigurationResponse {
  displays?: DisplayConfigurationEntry[];
}

export interface EmulatorStatusResponse {
  version?: string;
  booted?: boolean;
  uptime?: string;
  hardwareConfig?: {
    entry?: Array<{
      key?: string;
      value?: string;
    }>;
  };
}

export interface DisplayConfigurationEntry {
  width?: number | string;
  height?: number | string;
  display?: number | string;
}

export type GrpcCallback<T> = (error: Error | null, response?: T) => void;

export interface InputEventStream {
  write(event: EmulatorInputEvent): boolean;
  end(): void;
  on(event: "error", listener: (error: Error) => void): this;
}

export interface EmulatorControllerClient {
  getDisplayConfigurations(request: Record<string, never>, callback: GrpcCallback<DisplayConfigurationResponse>): void;
  getStatus?(request: Record<string, never>, callback: GrpcCallback<EmulatorStatusResponse>): void;
  sendTouch(event: EmulatorTouchEvent, callback: GrpcCallback<Record<string, never>>): void;
  streamInputEvent(callback: GrpcCallback<Record<string, never>>): InputEventStream;
}

export interface Logger {
  info(message: string, meta?: unknown): void;
  warn(message: string, meta?: unknown): void;
  error(message: string, meta?: unknown): void;
}
