import { describe, expect, it } from "vitest";
import { TouchSlotAllocator } from "../../src/server/slotAllocator";

describe("TouchSlotAllocator", () => {
  it("assigns slot 0 to the first pointer", () => {
    const allocator = new TouchSlotAllocator();

    expect(allocator.get("first")).toBe(0);
  });

  it("assigns slot 1 to the second pointer", () => {
    const allocator = new TouchSlotAllocator();

    expect(allocator.get("first")).toBe(0);
    expect(allocator.get("second")).toBe(1);
  });

  it("returns the same slot for the same pointer until release", () => {
    const allocator = new TouchSlotAllocator();

    expect(allocator.get("first")).toBe(0);
    expect(allocator.get("first")).toBe(0);
  });

  it("returns a slot to the pool after release", () => {
    const allocator = new TouchSlotAllocator();

    expect(allocator.get("first")).toBe(0);
    allocator.release("first");

    expect(allocator.get("second")).toBe(0);
  });

  it("returns null for the eleventh active pointer", () => {
    const allocator = new TouchSlotAllocator();

    for (let index = 0; index < 10; index += 1) {
      expect(allocator.get(`pointer-${index}`)).toBe(index);
    }

    expect(allocator.get("overflow")).toBeNull();
  });

  it("reuses released slots in ascending order", () => {
    const allocator = new TouchSlotAllocator();

    for (let index = 0; index < 4; index += 1) {
      expect(allocator.get(`pointer-${index}`)).toBe(index);
    }

    allocator.release("pointer-2");
    allocator.release("pointer-0");

    expect(allocator.get("next")).toBe(0);
    expect(allocator.get("after-next")).toBe(2);
  });

  it("clears state with releaseAll", () => {
    const allocator = new TouchSlotAllocator();

    expect(allocator.get("first")).toBe(0);
    expect(allocator.get("second")).toBe(1);
    allocator.releaseAll();

    expect(allocator.get("third")).toBe(0);
  });
});
