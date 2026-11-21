import { TICK_DT_S } from "../config/constants";

/** Whole ticks (≥ 1) for an interval in seconds. Simulation timers count ticks: no float drift. */
export const ticksFor = (seconds: number): number => Math.max(1, Math.round(seconds / TICK_DT_S));
