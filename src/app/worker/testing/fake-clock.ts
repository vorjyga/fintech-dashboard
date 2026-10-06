export class FakeClock {
  time = 0;
  private nextId = 1;
  readonly tasks = new Map<number, { at: number; callback: () => void }>();
  setTimer = (callback: () => void, delay: number): number => {
    const id = this.nextId++;
    this.tasks.set(id, { at: this.time + delay, callback });
    return id;
  };
  clearTimer = (id: unknown): void => {
    this.tasks.delete(id as number);
  };
  advance(ms: number): void {
    const target = this.time + ms;
    while (true) {
      const next = [...this.tasks].sort((a, b) => a[1].at - b[1].at)[0];
      if (!next || next[1].at > target) break;
      this.tasks.delete(next[0]);
      this.time = Math.max(this.time, next[1].at);
      next[1].callback();
    }
    this.time = Math.max(this.time, target);
  }
}
