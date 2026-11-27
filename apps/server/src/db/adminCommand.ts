/**
 * Story 10.11 (AC 1, AD-1): the operator's `admin add|remove|list` command (run by `adminCli.ts` on the VPS). Names a
 * REGISTERED account by its case-blind username; a guest has none, so it can never be named. Each change logs one
 * `account_admin { accountId, admin }` line (no username, no IP: brief 28). The list goes to the operator's terminal only.
 */
import { log } from "../ops/logger";
import type { AdminsRepo } from "./accountsRepo";

export const ADMIN_USAGE = "usage: npm run admin -w @topdown/server -- add <username> | remove <username> | list";

/** Runs one command; returns the process exit code (0 = done). `out` gets the operator's text. */
export async function runAdminCommand(args: readonly string[], repo: AdminsRepo, out: (line: string) => void): Promise<number> {
  const [cmd, name, ...rest] = args;
  if (cmd === "list" && name === undefined) {
    const admins = await repo.listAdmins();
    if (admins.length === 0) out("no admins");
    for (const a of admins) out(a.username);
    return 0;
  }
  if ((cmd === "add" || cmd === "remove") && name !== undefined && name.trim() !== "" && rest.length === 0) {
    const admin = cmd === "add";
    const r = await repo.setAdmin(name.trim().toLowerCase(), admin);
    if (r === null) {
      out(`no registered account named "${name}"`);
      return 1;
    }
    log.info({ accountId: r.accountId, admin }, "account_admin");
    out(admin ? `${name} is now an admin (shows at their next session fetch: the start screen or a reload)` : `${name} is no longer an admin`);
    return 0;
  }
  out(ADMIN_USAGE);
  return 2;
}
