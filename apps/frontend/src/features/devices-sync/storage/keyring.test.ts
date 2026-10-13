import { beforeEach, describe, expect, it, vi } from "vitest";
import { syncStorage } from "./keyring";

const { command } = vi.hoisted(() => ({ command: vi.fn() }));
vi.mock("@/features/profiles/api", () => ({ profileCommand: command }));
vi.mock("@/adapters", () => ({ logger: { error: vi.fn() } }));

beforeEach(() => vi.resetAllMocks());

describe("sync credentials remain scoped to their enrollment", () => {
  it.each([null, JSON.stringify({ version: 2, deviceId: "new-device", deviceNonce: "new-nonce" })])(
    "rejects an old pairing after enrollment changed: %s",
    async (identity) => {
      command.mockResolvedValueOnce(identity);
      await expect(syncStorage.setE2EECredentials("old-root", 1, "old-device")).rejects.toThrow(
        "Device enrollment changed",
      );
      expect(command).toHaveBeenCalledTimes(1);
    },
  );

  it("cannot clear another enrollment's keys after a delayed reset", async () => {
    command.mockResolvedValueOnce(
      JSON.stringify({ version: 2, deviceId: "new-device", rootKey: "new-root" }),
    );
    await expect(syncStorage.clearRootKey("old-device")).rejects.toThrow(
      "Device enrollment changed",
    );
    expect(command).toHaveBeenCalledTimes(1);
  });

  it("preserves enrollment identifiers when installing matching pairing credentials", async () => {
    command.mockResolvedValueOnce(
      JSON.stringify({ version: 2, deviceId: "device", deviceNonce: "nonce" }),
    );
    await syncStorage.setE2EECredentials("root", 3, "device");
    const [operation, payload] = command.mock.calls[1];
    expect(operation).toBe("update_profile_sync_identity");
    expect(JSON.parse(payload.identity)).toEqual({
      version: 2,
      deviceId: "device",
      deviceNonce: "nonce",
      rootKey: "root",
      keyVersion: 3,
    });
  });
});
