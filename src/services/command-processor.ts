/**
 * Decides what to do with pending admin commands. Kept free of network and UI code so the
 * ordering rules can be tested: a command is remembered locally and marked on the server
 * BEFORE it runs, because `restart` and `force_update` end the process.
 */
import { safeGetItem, safeSetItem } from "@/lib/storage";

export interface AdminCommand {
  id: string;
  target_user_id: string | null;
  command_type: string;
  payload: Record<string, unknown> | null;
  status: string;
  created_at: string;
}

export type ExecuteResult = "ok" | "failed" | "unknown";

export interface HandledStore {
  has(id: string): boolean;
  add(id: string): void;
}

export interface CommandDeps {
  now: () => number;
  handled: HandledStore;
  /** PATCH the row; resolves false when the server did not accept it. */
  patch: (id: string, body: Record<string, unknown>) => Promise<boolean>;
  execute: (cmd: AdminCommand) => Promise<ExecuteResult>;
}

export const MAX_COMMAND_AGE_MS = 24 * 60 * 60 * 1000;
export const KNOWN_COMMANDS = new Set(["force_update", "show_message", "restart"]);
const HANDLED_KEY = "psitrak_handled_commands";
const HANDLED_LIMIT = 100;

export const localHandledStore: HandledStore = {
  has(id) {
    return readHandled().includes(id);
  },
  add(id) {
    const ids = readHandled().filter((x) => x !== id);
    ids.push(id);
    safeSetItem(HANDLED_KEY, JSON.stringify(ids.slice(-HANDLED_LIMIT)));
  },
};

function readHandled(): string[] {
  try {
    const parsed = JSON.parse(safeGetItem(HANDLED_KEY) ?? "[]");
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

export async function processCommands(commands: AdminCommand[], deps: CommandDeps): Promise<void> {
  for (const cmd of commands) {
    if (cmd.status !== "pending" || deps.handled.has(cmd.id)) continue;
    deps.handled.add(cmd.id);

    const age = deps.now() - new Date(cmd.created_at).getTime();
    if (age > MAX_COMMAND_AGE_MS) {
      await deps.patch(cmd.id, { status: "expired" });
      continue;
    }

    if (!KNOWN_COMMANDS.has(cmd.command_type)) {
      await deps.patch(cmd.id, { status: "unsupported" });
      continue;
    }

    await deps.patch(cmd.id, { status: "executed", executed_at: new Date(deps.now()).toISOString() });
    const result = await deps.execute(cmd);
    if (result === "failed") await deps.patch(cmd.id, { status: "failed" });
    if (result === "unknown") await deps.patch(cmd.id, { status: "unsupported" });
  }
}
