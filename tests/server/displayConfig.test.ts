import { describe, expect, it } from "vitest";
import {
  DisplayConfigStore,
  fallbackDisplayConfigFromEnv,
  selectDisplayConfig,
  selectDisplayConfigFromStatus
} from "../../src/server/displayConfig";
import type {
  DisplayConfigurationResponse,
  EmulatorControllerClient,
  EmulatorInputEvent,
  EmulatorStatusResponse,
  EmulatorTouchEvent,
  GrpcCallback,
  InputEventStream
} from "../../src/server/types";

describe("display config", () => {
  it("uses a 1080x2400 default fallback when env is unset", () => {
    expect(fallbackDisplayConfigFromEnv({})).toEqual({ width: 1080, height: 2400, display: 0 });
  });

  it("uses fallback env when gRPC is unavailable", async () => {
    const client = new MockDisplayClient(new Error("unavailable"));
    const store = new DisplayConfigStore(
      client,
      fallbackDisplayConfigFromEnv({
        EMU_WIDTH: "720",
        EMU_HEIGHT: "1280",
        EMU_DISPLAY: "0"
      }),
      silentLogger()
    );

    await store.refresh();

    expect(store.get()).toEqual({ width: 720, height: 1280, display: 0 });
    expect(store.getStatus()).toMatchObject({
      grpcAvailable: false,
      lastSuccessfulRefreshAt: null
    });
  });

  it("updates width and height from getDisplayConfigurations", async () => {
    const client = new MockDisplayClient(undefined, {
      displays: [{ width: 1440, height: 3120, display: 0 }]
    });
    const store = new DisplayConfigStore(client, { width: 1080, height: 2400, display: 0 }, silentLogger());

    await store.refresh();

    expect(store.get()).toEqual({ width: 1440, height: 3120, display: 0 });
    expect(store.getStatus().grpcAvailable).toBe(true);
    expect(store.getStatus().lastError).toBeNull();
  });

  it("marks grpc available when display config is unimplemented but getStatus works", async () => {
    const client = new MockDisplayClient(new Error("12 UNIMPLEMENTED: "), {}, {
      hardwareConfig: {
        entry: [
          { key: "hw.lcd.width", value: "1080" },
          { key: "hw.lcd.height", value: "2400" }
        ]
      }
    });
    const store = new DisplayConfigStore(client, { width: 1080, height: 2400, display: 0 }, silentLogger());

    await store.refresh();

    expect(store.get()).toEqual({ width: 1080, height: 2400, display: 0 });
    expect(store.getStatus()).toMatchObject({
      grpcAvailable: true,
      lastError: "getDisplayConfigurations is not implemented by this emulator image; using getStatus hardware config"
    });
  });

  it("selects width and height from getStatus hardware config", () => {
    expect(
      selectDisplayConfigFromStatus(
        {
          hardwareConfig: {
            entry: [
              { key: "hw.lcd.width", value: "720" },
              { key: "hw.lcd.height", value: "1280" }
            ]
          }
        },
        { width: 1080, height: 2400, display: 0 }
      )
    ).toEqual({ width: 720, height: 1280, display: 0 });
  });

  it("selects display 0 when present", () => {
    const selected = selectDisplayConfig(
      {
        displays: [
          { width: 800, height: 600, display: 2 },
          { width: 1080, height: 2400, display: 0 }
        ]
      },
      { width: 320, height: 640, display: 0 }
    );

    expect(selected).toEqual({ width: 1080, height: 2400, display: 0 });
  });

  it("selects first display when display 0 is absent", () => {
    const selected = selectDisplayConfig(
      {
        displays: [
          { width: 800, height: 600, display: 2 },
          { width: 1024, height: 768, display: 3 }
        ]
      },
      { width: 320, height: 640, display: 0 }
    );

    expect(selected).toEqual({ width: 800, height: 600, display: 2 });
  });
});

class MockDisplayClient implements EmulatorControllerClient {
  constructor(
    private readonly error?: Error,
    private readonly response: DisplayConfigurationResponse = {},
    private readonly statusResponse?: EmulatorStatusResponse
  ) {}

  getDisplayConfigurations(
    _request: Record<string, never>,
    callback: GrpcCallback<DisplayConfigurationResponse>
  ): void {
    callback(this.error ?? null, this.response);
  }

  getStatus(_request: Record<string, never>, callback: GrpcCallback<EmulatorStatusResponse>): void {
    if (!this.statusResponse) {
      callback(new Error("unavailable"));
      return;
    }

    callback(null, this.statusResponse);
  }

  sendTouch(_event: EmulatorTouchEvent, callback: GrpcCallback<Record<string, never>>): void {
    callback(null, {});
  }

  streamInputEvent(callback: GrpcCallback<Record<string, never>>): InputEventStream {
    callback(null, {});
    return new EmptyStream();
  }
}

class EmptyStream implements InputEventStream {
  write(_event: EmulatorInputEvent): boolean {
    return true;
  }

  end(): void {}

  on(_event: "error", _listener: (error: Error) => void): this {
    return this;
  }
}

function silentLogger() {
  return {
    info: () => {},
    warn: () => {},
    error: () => {}
  };
}
