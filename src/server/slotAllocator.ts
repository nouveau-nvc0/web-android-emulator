export class TouchSlotAllocator {
  private readonly slots = new Map<string, number>();

  constructor(private readonly maxSlots = 10) {}

  get(webPointerId: string): number | null {
    const existing = this.slots.get(webPointerId);
    if (existing !== undefined) {
      return existing;
    }

    for (let slot = 0; slot < this.maxSlots; slot += 1) {
      if (!this.hasSlot(slot)) {
        this.slots.set(webPointerId, slot);
        return slot;
      }
    }

    return null;
  }

  release(webPointerId: string): void {
    this.slots.delete(webPointerId);
  }

  releaseAll(): void {
    this.slots.clear();
  }

  private hasSlot(slot: number): boolean {
    for (const usedSlot of this.slots.values()) {
      if (usedSlot === slot) {
        return true;
      }
    }

    return false;
  }
}
