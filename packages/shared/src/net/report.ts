/**
 * Story 10.6 (B1, B2): "Report a problem". `POST /api/account/report` (the server sees `/account/report`: Caddy and
 * Vite strip `/api`). The limits are protocol limits, not gameplay numbers.
 */
import { z } from "zod";

export const ACCOUNT_REPORT_PATH = "/account/report";
/** B2: the only path whose body may be larger than the 2 KB HTTP cap (Caddy: 64KB for `/api/account/report`). */
export const REPORT_MAX_BYTES = 65_536;
export const REPORT_NOTE_MAX = 500;
/** The counter turns amber from here (AC 2). */
export const REPORT_NOTE_WARN = 450;
export const REPORT_LINES_MAX = 200;
export const REPORT_LINE_MAX = 300;
/** B3: per account per 24 h (counted in the database). */
export const REPORT_DAILY_MAX = 20;
/** B5: reports older than this are deleted by the housekeeping job. */
export const REPORT_KEEP_DAYS = 30;
/** Q3 B: the 4-character report code alphabet (A–Z without I and O, 2–9). */
export const REPORT_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export const REPORT_CODE_LENGTH = 4;
export const reportCodeSchema = z.string().regex(/^[A-HJ-NP-Z2-9]{4}$/);

const shortText = (max: number) => z.string().max(max);
const num = z.number().finite();

/** AC 3: device and browser info. No names, tokens, cookies or IP (B7). */
export const reportDeviceSchema = z
  .object({
    userAgent: shortText(400),
    brands: z.array(shortText(80)).max(8).optional(),
    platform: shortText(40).optional(),
    mobile: z.boolean().optional(),
    screen: z.object({ w: num, h: num }).strict(),
    viewport: z.object({ w: num, h: num }).strict(),
    dpr: num,
    safeArea: z.object({ top: num, right: num, bottom: num, left: num }).strict(),
    input: z.enum(["touch", "mouse"]),
    gfxTier: shortText(40).optional(),
    renderer: shortText(200).optional(),
    language: shortText(40),
    installed: z.boolean(),
    quality: z.record(shortText(32), z.union([z.string().max(32), z.number().finite(), z.boolean()])).optional(),
  })
  .strict();
export type ReportDevice = z.infer<typeof reportDeviceSchema>;

export const reportPayloadSchema = z
  .object({
    lines: z.array(z.string().max(REPORT_LINE_MAX)).max(REPORT_LINES_MAX),
    roomId: shortText(64).optional(),
    runSeed: z.number().int().optional(),
    wave: z.number().int().min(0).max(10_000).optional(),
    phase: shortText(32).optional(),
    protocol: z.number().int().optional(),
    build: shortText(64).optional(),
    device: reportDeviceSchema,
  })
  .strict();
export type ReportPayload = z.infer<typeof reportPayloadSchema>;

export const reportRequestSchema = z.object({ note: z.string().max(REPORT_NOTE_MAX), payload: reportPayloadSchema }).strict();
export type ReportRequest = z.infer<typeof reportRequestSchema>;

export const reportResponseSchema = z.object({ ok: z.literal(true), code: reportCodeSchema });
export type ReportResponse = z.infer<typeof reportResponseSchema>;
