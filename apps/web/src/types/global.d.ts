import type { Temporal as TemporalType } from "@js-temporal/polyfill";

declare global {
  var Temporal: typeof TemporalType;
}

export {};
