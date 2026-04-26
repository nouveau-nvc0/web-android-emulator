import { describe, expect, it } from "vitest";
import { toInputEvent } from "../../src/server/touchMapper";
import type { BrowserTouchMessage, DisplayConfig } from "../../src/server/types";

const display: DisplayConfig = {
  width: 1080,
  height: 2400,
  display: 0
};

describe("toInputEvent", () => {
  it("maps x=0, y=0 to pixel 0,0", () => {
    const touch = map({ x: 0, y: 0 }).touch_event.touches[0];

    expect(touch).toMatchObject({ x: 0, y: 0 });
  });

  it("maps x=1, y=1 to width-1,height-1", () => {
    const touch = map({ x: 1, y: 1 }).touch_event.touches[0];

    expect(touch).toMatchObject({ x: 1079, y: 2399 });
  });

  it("rounds midpoint coordinates", () => {
    const touch = map({ x: 0.5, y: 0.5 }).touch_event.touches[0];

    expect(touch).toMatchObject({ x: 540, y: 1200 });
  });

  it("clamps x/y below 0 and above 1", () => {
    const low = map({ x: -1, y: -1 }).touch_event.touches[0];
    const high = map({ x: 2, y: 2 }).touch_event.touches[0];

    expect(low).toMatchObject({ x: 0, y: 0 });
    expect(high).toMatchObject({ x: 1079, y: 2399 });
  });

  it("maps down pressure 0.5 to nonzero pressure", () => {
    const touch = map({ type: "down", pressure: 0.5 }).touch_event.touches[0];

    expect(touch?.pressure).toBeGreaterThan(0);
  });

  it("uses default nonzero pressure for move without pressure", () => {
    const touch = map({ type: "move", pressure: undefined }).touch_event.touches[0];

    expect(touch?.pressure).toBeGreaterThan(0);
  });

  it("always maps up to pressure 0", () => {
    const touch = map({ type: "up", pressure: 1 }).touch_event.touches[0];

    expect(touch?.pressure).toBe(0);
  });

  it("always maps cancel to pressure 0", () => {
    const touch = map({ type: "cancel", pressure: 1 }).touch_event.touches[0];

    expect(touch?.pressure).toBe(0);
  });

  it("uses slot as identifier", () => {
    const touch = map({}, 7).touch_event.touches[0];

    expect(touch?.identifier).toBe(7);
  });

  it("uses display from display config", () => {
    const inputEvent = toInputEvent({
      msg: message({}),
      slot: 0,
      display: { width: 320, height: 640, display: 2 }
    });

    expect(inputEvent.touch_event.display).toBe(2);
  });
});

function map(overrides: Partial<BrowserTouchMessage>, slot = 0) {
  return toInputEvent({
    msg: message(overrides),
    slot,
    display
  });
}

function message(overrides: Partial<BrowserTouchMessage>): BrowserTouchMessage {
  return {
    type: "down",
    id: "17",
    x: 0.42,
    y: 0.77,
    pressure: 0.5,
    pointerType: "touch",
    ...overrides
  };
}
