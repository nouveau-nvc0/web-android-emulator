import type {
  DisplayConfig,
  DisplayConfigurationEntry,
  DisplayConfigurationResponse,
  EmulatorControllerClient,
  EmulatorStatusResponse,
  Logger
} from "./types.js";

const DEFAULT_WIDTH = 1080;
const DEFAULT_HEIGHT = 1920;
const DEFAULT_DISPLAY = 0;
const DEFAULT_REFRESH_MS = 5000;
const LOG_THROTTLE_MS = 30000;

export function fallbackDisplayConfigFromEnv(env: NodeJS.ProcessEnv = process.env): DisplayConfig {
  return {
    width: readPositiveInt(env.EMU_WIDTH, DEFAULT_WIDTH),
    height: readPositiveInt(env.EMU_HEIGHT, DEFAULT_HEIGHT),
    display: readNonNegativeInt(env.EMU_DISPLAY, DEFAULT_DISPLAY)
  };
}

export function selectDisplayConfig(
  response: DisplayConfigurationResponse | undefined,
  fallback: DisplayConfig
): DisplayConfig {
  const displays = response?.displays ?? [];
  const selected = displays.find((display) => toNumber(display.display) === 0) ?? displays[0];

  if (!selected) {
    return fallback;
  }

  const width = toNumber(selected.width);
  const height = toNumber(selected.height);
  const display = toNumber(selected.display);

  if (!isPositiveInt(width) || !isPositiveInt(height) || !isNonNegativeInt(display)) {
    return fallback;
  }

  return { width, height, display };
}

export function selectDisplayConfigFromStatus(
  response: EmulatorStatusResponse | undefined,
  fallback: DisplayConfig
): DisplayConfig {
  const entries = response?.hardwareConfig?.entry ?? [];
  const hardware = new Map(entries.map((entry) => [entry.key, entry.value]));
  const width = readPositiveInt(hardware.get("hw.lcd.width"), fallback.width);
  const height = readPositiveInt(hardware.get("hw.lcd.height"), fallback.height);

  return {
    width,
    height,
    display: fallback.display
  };
}

export class DisplayConfigStore {
  private current: DisplayConfig;
  private timer: NodeJS.Timeout | null = null;
  private lastLogAt = 0;
  private grpcAvailable = false;
  private lastError: string | null = null;
  private lastSuccessfulRefreshAt: string | null = null;

  constructor(
    private readonly client: EmulatorControllerClient,
    private readonly fallback: DisplayConfig,
    private readonly logger: Logger = console,
    private readonly refreshMs = DEFAULT_REFRESH_MS
  ) {
    this.current = fallback;
  }

  get(): DisplayConfig {
    return this.current;
  }

  getStatus(): {
    grpcAvailable: boolean;
    lastError: string | null;
    lastSuccessfulRefreshAt: string | null;
  } {
    return {
      grpcAvailable: this.grpcAvailable,
      lastError: this.lastError,
      lastSuccessfulRefreshAt: this.lastSuccessfulRefreshAt
    };
  }

  async refresh(): Promise<DisplayConfig> {
    try {
      const response = await getDisplayConfigurations(this.client);
      this.current = selectDisplayConfig(response, this.fallback);
      this.grpcAvailable = true;
      this.lastError = null;
      this.lastSuccessfulRefreshAt = new Date().toISOString();
    } catch (error) {
      if (isUnimplemented(error) && this.client.getStatus) {
        await this.refreshStatusOnly(error);
      } else {
        this.grpcAvailable = false;
        this.lastError = formatError(error);
        this.logGrpcError(error);
        this.current = this.current ?? this.fallback;
      }
    }

    return this.current;
  }

  private async refreshStatusOnly(originalError: unknown): Promise<void> {
    try {
      const status = await getStatus(this.client);
      this.current = selectDisplayConfigFromStatus(status, this.current ?? this.fallback);
      this.grpcAvailable = true;
      this.lastError =
        "getDisplayConfigurations is not implemented by this emulator image; using getStatus hardware config";
      this.lastSuccessfulRefreshAt = new Date().toISOString();
    } catch (statusError) {
      this.grpcAvailable = false;
      this.lastError = formatError(statusError);
      this.logGrpcError(originalError);
      this.current = this.current ?? this.fallback;
    }
  }

  start(): void {
    if (this.timer) {
      return;
    }

    void this.refresh();
    this.timer = setInterval(() => {
      void this.refresh();
    }, this.refreshMs);
  }

  stop(): void {
    if (!this.timer) {
      return;
    }

    clearInterval(this.timer);
    this.timer = null;
  }

  private logGrpcError(error: unknown): void {
    const now = Date.now();
    if (now - this.lastLogAt < LOG_THROTTLE_MS) {
      return;
    }

    this.lastLogAt = now;
    this.logger.warn("display config grpc unavailable; using fallback/current config", formatError(error));
  }
}

function getDisplayConfigurations(client: EmulatorControllerClient): Promise<DisplayConfigurationResponse> {
  return new Promise((resolve, reject) => {
    client.getDisplayConfigurations({}, (error, response) => {
      if (error) {
        reject(error);
        return;
      }

      resolve(response ?? {});
    });
  });
}

function getStatus(client: EmulatorControllerClient): Promise<EmulatorStatusResponse> {
  return new Promise((resolve, reject) => {
    if (!client.getStatus) {
      reject(new Error("getStatus is not available on grpc client"));
      return;
    }

    client.getStatus({}, (error, response) => {
      if (error) {
        reject(error);
        return;
      }

      resolve(response ?? {});
    });
  });
}

function readPositiveInt(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return isPositiveInt(parsed) ? parsed : fallback;
}

function readNonNegativeInt(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return isNonNegativeInt(parsed) ? parsed : fallback;
}

function toNumber(value: number | string | undefined): number {
  return typeof value === "string" ? Number(value) : value ?? Number.NaN;
}

function isPositiveInt(value: number): boolean {
  return Number.isInteger(value) && value > 0;
}

function isNonNegativeInt(value: number): boolean {
  return Number.isInteger(value) && value >= 0;
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function isUnimplemented(error: unknown): boolean {
  return error instanceof Error && error.message.includes("UNIMPLEMENTED");
}
