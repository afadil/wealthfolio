import { beforeEach, describe, expect, it, vi } from "vitest";

const adapterMocks = vi.hoisted(() => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
    trace: vi.fn(),
  },
  getDeviceSyncState: vi.fn(),
  enableDeviceSync: vi.fn(),
  clearDeviceSyncData: vi.fn(),
  reinitializeDeviceSync: vi.fn(),
  getSyncEngineStatus: vi.fn(),
  deviceSyncBootstrapOverwriteCheck: vi.fn(),
  deviceSyncReconcileReadyState: vi.fn(),
  syncBootstrapSnapshotIfNeeded: vi.fn(),
  syncTriggerCycle: vi.fn(),
  deviceSyncStartBackgroundEngine: vi.fn(),
  deviceSyncStopBackgroundEngine: vi.fn(),
  getDevice: vi.fn(),
  listDevices: vi.fn(),
  updateDevice: vi.fn(),
  deleteDevice: vi.fn(),
  revokeDevice: vi.fn(),
  resetTeamSync: vi.fn(),
  createPairing: vi.fn(),
  getPairing: vi.fn(),
  approvePairing: vi.fn(),
  completePairing: vi.fn(),
  cancelPairing: vi.fn(),
  claimPairing: vi.fn(),
  getPairingMessages: vi.fn(),
  confirmPairing: vi.fn(),
}));

const storageMocks = vi.hoisted(() => ({
  getRootKey: vi.fn(),
  getKeyVersion: vi.fn(),
  setE2EECredentials: vi.fn(),
  getDeviceId: vi.fn(),
  clearRootKey: vi.fn(),
  getIdentity: vi.fn(),
  setIdentity: vi.fn(),
  getServerKeyVersion: vi.fn(),
  getDeviceSecretKey: vi.fn(),
  getDevicePublicKey: vi.fn(),
}));

const cryptoMocks = vi.hoisted(() => ({
  generatePairingCode: vi.fn(),
  hashPairingCode: vi.fn(),
  generateEphemeralKeypair: vi.fn(),
  computeSharedSecret: vi.fn(),
  deriveSessionKey: vi.fn(),
  encrypt: vi.fn(),
  decrypt: vi.fn(),
  computeSAS: vi.fn(),
}));

vi.mock("@/adapters", () => adapterMocks);
vi.mock("../storage/keyring", () => ({ syncStorage: storageMocks }));
vi.mock("../crypto", () => cryptoMocks);

import type { ClaimerSession, KeyBundlePayload, PairingSession } from "../types";
import { syncService } from "./sync-service";

describe("syncService pairing remote seed status", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("maps completePairing remoteSeedPresent from API response", async () => {
    const session: PairingSession = {
      pairingId: "pair_1",
      code: "123456",
      ephemeralSecretKey: "esk",
      ephemeralPublicKey: "epk",
      claimerPublicKey: "claimer_pub",
      claimerDeviceId: "dev_2",
      sessionKey: "session_key",
      keyVersion: 7,
      expiresAt: new Date(Date.now() + 60_000),
      status: "claimed",
      requireSas: true,
    };

    storageMocks.getRootKey.mockResolvedValue("root_key");
    storageMocks.getKeyVersion.mockResolvedValue(7);
    cryptoMocks.encrypt.mockResolvedValue("encrypted_bundle");
    cryptoMocks.computeSAS.mockResolvedValue("sas");
    cryptoMocks.hashPairingCode.mockResolvedValue("signature");
    adapterMocks.completePairing.mockResolvedValue({ success: true, remoteSeedPresent: false });

    const result = await syncService.completePairing(session);

    expect(adapterMocks.completePairing).toHaveBeenCalledTimes(1);
    expect(result.remoteSeedPresent).toBe(false);
  });

  it("maps confirmPairingAsClaimer remoteSeedPresent from API response", async () => {
    const session: ClaimerSession = {
      pairingId: "pair_2",
      code: "654321",
      ephemeralSecretKey: "esk",
      ephemeralPublicKey: "epk",
      issuerPublicKey: "issuer_pub",
      sessionKey: "session_key",
      e2eeKeyVersion: 8,
      requireSas: true,
      expiresAt: new Date(Date.now() + 60_000),
      status: "approved",
    };
    const keyBundle: KeyBundlePayload = {
      version: 1,
      rootKey: "root_key",
      keyVersion: 8,
    };

    cryptoMocks.hashPairingCode.mockResolvedValue("proof");
    adapterMocks.confirmPairing.mockResolvedValue({
      success: true,
      keyVersion: 8,
      remoteSeedPresent: true,
    });
    storageMocks.setE2EECredentials.mockResolvedValue(undefined);

    const result = await syncService.confirmPairingAsClaimer(session, keyBundle);

    expect(adapterMocks.confirmPairing).toHaveBeenCalledWith("pair_2", "proof");
    expect(storageMocks.setE2EECredentials).toHaveBeenCalledTimes(1);
    expect(result.remoteSeedPresent).toBe(true);
  });
});
