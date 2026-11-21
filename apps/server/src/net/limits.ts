/**
 * Security limits for client traffic (architecture › Security and Operations). These are not
 * gameplay numbers, so they live here and not in balance.
 */

/** Largest client frame (and join options JSON) accepted, in bytes. A real client sends ~200. */
export const MAX_CLIENT_MESSAGE_BYTES = 1024;

/** `input.send` bucket: capacity and refill per second (inputs are sent 20/s). */
export const MAX_INPUTS_PER_S = 25;

/** Shared bucket for every other client message type: capacity and refill per second. */
export const MAX_OTHER_MESSAGES_PER_S = 10;

/** At most one `client_message_rejected` warn per client and reason in this window. */
export const DROP_LOG_INTERVAL_MS = 10_000;
