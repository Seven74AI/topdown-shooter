import { BYTES, INPUT_BYTES, encodeInput, type PlayerInput } from "@topdown/shared";

/** Story 8.11: what the phone sends for one input (the binary `BYTES.INPUT`), for room tests. */
export function sendInput(room: { sendBytes(type: number, bytes: Uint8Array): void }, input: PlayerInput): void {
  const bytes = new Uint8Array(INPUT_BYTES);
  encodeInput(input, bytes);
  room.sendBytes(BYTES.INPUT, bytes);
}
