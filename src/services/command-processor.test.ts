import { describe, expect, it, vi } from "vitest";
import { processCommands, type CommandDeps, type AdminCommand, type HandledStore } from "./command-processor";

// Regression for bug-hunt C1 (2026-11-27): `restart` relaunched the app before the row was
// marked executed, so every start ran it again for up to 24 h.

function memoryHandled(initial: string[] = []): HandledStore & { ids: Set<string> } {
  const ids = new Set(initial);
  return { ids, has: (id) => ids.has(id), add: (id) => void ids.add(id) };
}

const NOW = new Date("2026-11-27T15:00:00Z").getTime();
const cmd = (over: Partial<AdminCommand> = {}): AdminCommand => ({
  id: "c1",
  target_user_id: null,
  command_type: "restart",
  payload: null,
  status: "pending",
  created_at: new Date(NOW - 60_000).toISOString(),
  ...over,
});

function deps(over: Partial<CommandDeps> = {}) {
  const calls: string[] = [];
  const d: CommandDeps = {
    now: () => NOW,
    handled: memoryHandled(),
    patch: vi.fn(async (id: string, body: Record<string, unknown>) => {
      calls.push(`patch:${id}:${body.status}`);
      return true;
    }),
    execute: vi.fn(async (c: AdminCommand) => {
      calls.push(`exec:${c.id}`);
      return "ok" as const;
    }),
    ...over,
  };
  return { d, calls };
}

describe("processCommands", () => {
  it("marks restart as executed and remembers it BEFORE running it", async () => {
    const { d, calls } = deps();
    let handledAtExec = false;
    d.execute = vi.fn(async () => {
      handledAtExec = d.handled.has("c1");
      calls.push("exec:c1");
      return "ok" as const;
    });
    await processCommands([cmd()], d);
    expect(calls).toEqual(["patch:c1:executed", "exec:c1"]);
    expect(handledAtExec).toBe(true);
  });

  it("does not run a command again after a restart even if the server PATCH failed", async () => {
    const handled = memoryHandled();
    const first = deps({ handled, patch: vi.fn(async () => false) });
    await processCommands([cmd()], first.d);
    const second = deps({ handled });
    await processCommands([cmd()], second.d);
    expect(second.d.execute).not.toHaveBeenCalled();
    expect(first.d.execute).toHaveBeenCalledTimes(1);
  });

  it("marks failed and unknown commands honestly", async () => {
    const { d, calls } = deps({
      execute: vi.fn(async (c: AdminCommand) => (c.command_type === "show_message" ? "failed" : "unknown")),
    });
    await processCommands(
      [cmd({ id: "m", command_type: "show_message" }), cmd({ id: "x", command_type: "wipe_disk" })],
      d,
    );
    expect(calls).toContain("patch:m:failed");
    expect(calls).toContain("patch:x:unsupported");
    expect(calls).not.toContain("patch:x:executed");
    expect(d.execute).not.toHaveBeenCalledWith(expect.objectContaining({ id: "x" }));
  });

  it("expires commands older than 24 h without running them", async () => {
    const { d, calls } = deps();
    await processCommands([cmd({ created_at: new Date(NOW - 25 * 3600_000).toISOString() })], d);
    expect(calls).toEqual(["patch:c1:expired"]);
    expect(d.execute).not.toHaveBeenCalled();
  });

  it("skips rows that are no longer pending", async () => {
    const { d } = deps();
    await processCommands([cmd({ status: "executed" })], d);
    expect(d.execute).not.toHaveBeenCalled();
    expect(d.patch).not.toHaveBeenCalled();
  });
});
