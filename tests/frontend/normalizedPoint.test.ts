import { describe, expect, it } from "vitest";
import { containedContentRect, normalizedPoint, type DOMRectLike } from "../../src/frontend/touchOverlay";

describe("normalizedPoint", () => {
  it("maps a full fit without letterbox", () => {
    expect(
      normalizedPoint({
        clientX: 50,
        clientY: 100,
        stageRect: rect({ width: 100, height: 200 }),
        emulatorWidth: 100,
        emulatorHeight: 200
      })
    ).toEqual({ x: 0.5, y: 0.5 });
  });

  it("handles wide viewport with side margins", () => {
    expect(
      normalizedPoint({
        clientX: 100,
        clientY: 100,
        stageRect: rect({ width: 400, height: 200 }),
        emulatorWidth: 100,
        emulatorHeight: 100
      })
    ).toEqual({ x: 0, y: 0.5 });
  });

  it("handles tall viewport with top and bottom margins", () => {
    expect(
      normalizedPoint({
        clientX: 100,
        clientY: 100,
        stageRect: rect({ width: 200, height: 400 }),
        emulatorWidth: 100,
        emulatorHeight: 100
      })
    ).toEqual({ x: 0.5, y: 0 });
  });

  it("returns null for a point outside the video content area", () => {
    expect(
      normalizedPoint({
        clientX: 50,
        clientY: 100,
        stageRect: rect({ width: 400, height: 200 }),
        emulatorWidth: 100,
        emulatorHeight: 100
      })
    ).toBeNull();
  });

  it("returns normalized coordinates inside the content area", () => {
    expect(
      normalizedPoint({
        clientX: 200,
        clientY: 150,
        stageRect: rect({ width: 400, height: 200 }),
        emulatorWidth: 100,
        emulatorHeight: 100
      })
    ).toEqual({ x: 0.5, y: 0.75 });
  });

  it("keeps edge coordinates stable", () => {
    expect(
      normalizedPoint({
        clientX: 300,
        clientY: 200,
        stageRect: rect({ width: 400, height: 200 }),
        emulatorWidth: 100,
        emulatorHeight: 100
      })
    ).toEqual({ x: 1, y: 1 });
  });

  it("maps inside an actual 1080x2400 media rect", () => {
    const mediaRect = containedContentRect({
      frameRect: rect({ width: 390, height: 844 }),
      contentWidth: 1080,
      contentHeight: 2400
    });

    expect(mediaRect).not.toBeNull();
    expect(mediaRect?.left).toBeCloseTo(5.1);
    expect(mediaRect?.top).toBe(0);
    expect(mediaRect?.width).toBeCloseTo(379.8);
    expect(mediaRect?.height).toBe(844);

    expect(
      normalizedPoint({
        clientX: 195,
        clientY: mediaRect ? mediaRect.top + mediaRect.height / 2 : 0,
        stageRect: mediaRect ?? rect({ width: 390, height: 844 }),
        emulatorWidth: 1080,
        emulatorHeight: 2400
      })
    ).toEqual({ x: 0.5, y: 0.5 });
  });
});

function rect(overrides: Partial<DOMRectLike>): DOMRectLike {
  return {
    left: 0,
    top: 0,
    width: 100,
    height: 100,
    ...overrides
  };
}
