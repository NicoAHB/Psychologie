/** One activation at a time. Failed durable writes always leave the current app running. */
export class UpdateGuard {
  private running = false;
  private applied = false;
  async run(beforeApply: () => Promise<unknown>, apply: () => void): Promise<boolean> {
    if (this.running || this.applied) return false;
    this.running = true;
    try { await beforeApply(); apply(); this.applied = true; return true; }
    finally { this.running = false; }
  }
}
