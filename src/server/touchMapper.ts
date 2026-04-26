import type { BrowserTouchMessage, DisplayConfig, EmulatorInputEvent, EmulatorTouchEvent } from "./types.js";

const DEFAULT_PRESSURE = 0.5;
const PRESSURE_MAX = 1024;
const TOUCH_SIZE = 8;

export function clamp01(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.min(1, Math.max(0, value));
}

export function toInputEvent(params: {
  msg: BrowserTouchMessage;
  slot: number;
  display: DisplayConfig;
}): EmulatorInputEvent {
  const { msg, slot, display } = params;
  const x = Math.round(clamp01(msg.x) * (display.width - 1));
  const y = Math.round(clamp01(msg.y) * (display.height - 1));
  const pressure = msg.type === "up" || msg.type === "cancel" ? 0 : toEmulatorPressure(msg.pressure);

  return {
    touch_event: {
      display: display.display,
      touches: [
        {
          x,
          y,
          identifier: slot,
          pressure,
          touch_major: TOUCH_SIZE,
          touch_minor: TOUCH_SIZE,
          orientation: 0
        }
      ]
    }
  };
}

export function toTouchEvent(inputEvent: EmulatorInputEvent): EmulatorTouchEvent {
  return inputEvent.touch_event;
}

function toEmulatorPressure(value: number | undefined): number {
  const normalized = clamp01(value ?? DEFAULT_PRESSURE);
  return Math.max(1, Math.round(normalized * PRESSURE_MAX));
}
