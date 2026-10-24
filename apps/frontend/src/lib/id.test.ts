import { afterEach, describe, expect, it, vi } from "vitest";
import { generateId, generateSecureUuid } from "./id";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("generateSecureUuid", () => {
  it("uses the native secure UUID API when available", () => {
    const uuid = "f81d4fae-7dec-4f00-a765-00a0c91e6bf6";
    const randomUUID = vi.fn(() => uuid);
    const getRandomValues = vi.fn();
    vi.stubGlobal("crypto", { randomUUID, getRandomValues });
    expect(generateSecureUuid()).toBe(uuid);
    expect(randomUUID).toHaveBeenCalledTimes(1);
    expect(getRandomValues).not.toHaveBeenCalled();
  });

  it("preserves random bytes except the UUID version and variant bits", () => {
    const getRandomValues = vi.fn((bytes: Uint8Array) => bytes.fill(0xff));
    vi.stubGlobal("crypto", { getRandomValues });
    const random = vi.spyOn(Math, "random");
    expect(generateSecureUuid()).toBe("ffffffff-ffff-4fff-bfff-ffffffffffff");
    expect(getRandomValues).toHaveBeenCalledTimes(1);
    expect(getRandomValues.mock.calls[0][0]).toHaveLength(16);
    expect(random).not.toHaveBeenCalled();
  });

  it.each([undefined, {}])("fails closed without secure randomness (%j)", (crypto) => {
    vi.stubGlobal("crypto", crypto);
    const random = vi.spyOn(Math, "random");
    expect(generateSecureUuid).toThrow("Secure randomness");
    expect(random).not.toHaveBeenCalled();
  });

  it("propagates a random-source failure without downgrading", () => {
    vi.stubGlobal("crypto", {
      getRandomValues: () => {
        throw new Error("Random source failed");
      },
    });
    const random = vi.spyOn(Math, "random");
    expect(generateSecureUuid).toThrow("Random source failed");
    expect(random).not.toHaveBeenCalled();
  });
});

it("still generates non-security IDs when crypto is absent", () => {
  vi.stubGlobal("crypto", undefined);
  const first = generateId("item");
  expect(first).toMatch(/^item-[A-Za-z0-9_-]{21}$/);
  expect(generateId("item")).not.toBe(first);
});
