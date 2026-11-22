import type { Action } from "../core/types";

/** Keep distinct quick taps in order; a held key never builds a long backlog. */
export class ManualActions {
  private pending: Action[] = [];
  enqueue(action: Action, repeat = false) {
    if ((repeat && this.pending.length) || this.pending.length >= 12) return;
    this.pending.push(action);
  }
  take(): Action { return this.pending.shift() ?? "WAIT"; }
  clear() { this.pending.length = 0; }
}
