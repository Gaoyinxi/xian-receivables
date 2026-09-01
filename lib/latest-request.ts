/** One winning read per owner. Invalidating an identity also invalidates errors. */
export class LatestRequest {
  private revision = 0;
  private controller: AbortController | null = null;
  cancel() {
    this.revision++;
    this.controller?.abort();
    this.controller = null;
  }
  start() {
    this.cancel();
    const revision = this.revision;
    const controller = new AbortController();
    this.controller = controller;
    return {
      signal: controller.signal,
      current: () => this.revision === revision && !controller.signal.aborted,
    };
  }
}
