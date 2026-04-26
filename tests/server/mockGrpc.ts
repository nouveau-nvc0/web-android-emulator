import { EventEmitter } from "node:events";
import type {
  DisplayConfigurationResponse,
  EmulatorControllerClient,
  EmulatorInputEvent,
  EmulatorTouchEvent,
  GrpcCallback,
  InputEventStream
} from "../../src/server/types";

export class MockInputStream extends EventEmitter implements InputEventStream {
  readonly events: EmulatorInputEvent[] = [];
  ended = false;

  write(event: EmulatorInputEvent): boolean {
    this.events.push(event);
    return true;
  }

  end(): void {
    this.ended = true;
  }
}

export class MockGrpcClient implements EmulatorControllerClient {
  readonly streams: MockInputStream[] = [];
  readonly sentTouches: EmulatorTouchEvent[] = [];

  constructor(private readonly displayResponse: DisplayConfigurationResponse = {}) {}

  getDisplayConfigurations(
    _request: Record<string, never>,
    callback: GrpcCallback<DisplayConfigurationResponse>
  ): void {
    callback(null, this.displayResponse);
  }

  sendTouch(event: EmulatorTouchEvent, callback: GrpcCallback<Record<string, never>>): void {
    this.sentTouches.push(event);
    callback(null, {});
  }

  streamInputEvent(_callback: GrpcCallback<Record<string, never>>): InputEventStream {
    const stream = new MockInputStream();
    this.streams.push(stream);
    return stream;
  }
}
