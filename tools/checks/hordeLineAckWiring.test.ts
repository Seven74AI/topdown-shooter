import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = join(__dirname, "..", "..");
const code = (...p: string[]): string =>
  readFileSync(join(root, ...p), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/.*$/gm, "");

/** Story 8.13 (D1, D3): the tick ack goes from the phone (and the bots) through the room into the horde encoder. */
describe("Story 8.13: the slow-line ack is wired end to end", () => {
  it("RunRoom: the input parser keeps the ack; onInput and the rate-dropped input hand it to the encoder", () => {
    const src = code("apps", "server", "src", "rooms", "RunRoom.ts");
    expect(src).toMatch(/this\.inputAck = decodeInputAck\(b\)/);
    const onInput = src.slice(src.indexOf("onInput(client: RunClient, input: PlayerInput)"));
    expect(onInput.slice(0, 400)).toMatch(/this\.horde\?\.ack\(client, this\.inputAck, performance\.now\(\)\)/);
    const dropped = src.slice(src.indexOf("onInputRateDropped(client: RunClient"));
    expect(dropped.slice(0, 600)).toMatch(/this\.horde\?\.ack\(client, decodeInputAck\(message\), performance\.now\(\)\)/);
  });

  it("the phone and the bots send the newest tick they received as the ack", () => {
    expect(code("apps", "client", "src", "sim", "NetSimHost.ts")).toMatch(/encodeInput\(buf, this\.sendBytes, Math\.max\(this\.snapshots\.latestTick, this\.horde\.latestTick\)\)/);
    expect(code("tools", "bots", "botClient.ts")).toMatch(/encodeInput\(this\.input, this\.inputBytes, SEND_ACK \? Math\.max\(state\.tick, this\.horde\.tick\) : -1\)/);
  });
});
