import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { WealthfolioConnectProvider, useWealthfolioConnect } from "./wealthfolio-connect-provider";

const mocks = vi.hoisted(() => ({
  platform: "web",
  configured: false,
  account: "",
  onAuth: (_event: string) => {},
  onDeepLink: (_event: { payload: string }) => {},
  signOut: vi.fn(),
  signIn: vi.fn(),
  exchange: vi.fn(),
  getUserInfo: vi.fn(),
  getStatus: vi.fn(),
  store: vi.fn(),
  clear: vi.fn(),
  t: (key: string) => key,
}));

vi.mock("@/lib/connect-config", () => ({ CONNECT_ENABLED: true }));
vi.mock("@/context/auth-context", () => ({ useAuth: () => ({ isAuthenticated: true }) }));
vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: mocks.t }) }));
vi.mock("@/hooks/use-platform", () => ({
  getPlatform: async () => ({
    os: mocks.platform,
    is_mobile: mocks.platform !== "web",
    capabilities: { cloud_sync: true },
  }),
}));
vi.mock("tauri-plugin-web-auth-api", () => ({ authenticate: vi.fn() }));
vi.mock("@/adapters", () => ({
  isDesktop: true,
  getCurrentDeepLinks: async () => [],
  listenDeepLink: async (callback: typeof mocks.onDeepLink) => {
    mocks.onDeepLink = callback;
    return async () => {};
  },
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  openUrlInBrowser: vi.fn(),
}));
vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({
    auth: {
      signOut: mocks.signOut,
      signInWithPassword: mocks.signIn,
      exchangeCodeForSession: mocks.exchange,
      onAuthStateChange: (callback: typeof mocks.onAuth) => {
        mocks.onAuth = callback;
        return { data: { subscription: { unsubscribe: vi.fn() } } };
      },
    },
  }),
}));
vi.mock("../services/auth-service", () => ({
  restoreSyncSession: async () => {
    throw new Error("No stored session");
  },
  getSyncSessionStatus: mocks.getStatus,
  clearSyncSession: mocks.clear,
  storeSyncSession: mocks.store,
}));
vi.mock("../services/broker-service", () => ({ getUserInfo: mocks.getUserInfo }));

const session = (account: string) => ({
  user: { id: account },
  refresh_token: account,
  access_token: `${account}-access`,
});
const info = (account: string, status: string | null = "active") => ({
  id: account,
  team: { subscription_status: status },
});
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}
const wrapper = ({ children }: { children: ReactNode }) => (
  <WealthfolioConnectProvider>{children}</WealthfolioConnectProvider>
);
async function setup() {
  const hook = renderHook(useWealthfolioConnect, { wrapper });
  await waitFor(() => expect(hook.result.current.isInitializing).toBe(false));
  return hook;
}

beforeEach(() => {
  vi.resetAllMocks();
  mocks.configured = false;
  mocks.account = "";
  mocks.platform = "web";
  mocks.getStatus.mockImplementation(async () => ({ isConfigured: mocks.configured }));
  mocks.store.mockImplementation(async (account: string) => {
    mocks.account = account;
    mocks.configured = true;
  });
  mocks.clear.mockImplementation(async () => {
    mocks.configured = false;
  });
  mocks.signIn.mockImplementation(async ({ email }: { email: string }) => ({
    data: { session: session(email) },
    error: null,
  }));
  mocks.exchange.mockResolvedValue({ data: { session: session("B") }, error: null });
  mocks.signOut.mockImplementation(async () => {
    mocks.onAuth("SIGNED_OUT");
    return { error: null };
  });
  mocks.getUserInfo.mockImplementation(async () => info(mocks.account));
});

describe("Cloud session lifecycle", () => {
  it.each(["web", "ios", "android"])(
    "ignores a canceled response from a replaced session on %s",
    async (platform) => {
      mocks.platform = platform;
      const old = deferred<ReturnType<typeof info>>();
      mocks.getUserInfo.mockImplementationOnce(() => old.promise);
      const { result } = await setup();
      await act(() => result.current.signInWithEmail("A", "password"));
      await waitFor(() => expect(mocks.getUserInfo).toHaveBeenCalledTimes(1));
      await act(() => result.current.signOut());
      await act(() => result.current.signInWithEmail("B", "password"));
      await waitFor(() => expect(result.current.userInfo?.id).toBe("B"));
      await act(async () => {
        old.resolve(info("A", "canceled"));
      });
      expect(result.current.user?.id).toBe("B");
      expect(result.current.userInfo?.id).toBe("B");
      expect(mocks.signOut).toHaveBeenCalledTimes(1);
      expect(mocks.clear).toHaveBeenCalledTimes(1);
      expect(mocks.configured).toBe(true);
    },
  );

  it("ignores errors from an obsolete request", async () => {
    const old = deferred<ReturnType<typeof info>>();
    mocks.getUserInfo.mockImplementationOnce(() => old.promise);
    const { result } = await setup();
    await act(() => result.current.signInWithEmail("A", "password"));
    await waitFor(() => expect(mocks.getUserInfo).toHaveBeenCalledTimes(1));
    await act(() => result.current.signInWithEmail("B", "password"));
    await waitFor(() => expect(result.current.userInfo?.id).toBe("B"));
    await act(async () => {
      old.reject(new Error("Old account request failed"));
    });
    expect(result.current.error).toBeNull();
    expect(result.current.userInfo?.id).toBe("B");
    expect(result.current.isLoadingUserInfo).toBe(false);
  });

  it.each([null, "canceled", "unpaid", "incomplete", "incomplete_expired", "paused", "unknown"])(
    "keeps authentication and exposes inactive status %s for pricing",
    async (status) => {
      mocks.getUserInfo.mockResolvedValue(info("A", status));
      const { result } = await setup();
      await act(() => result.current.signInWithEmail("A", "password"));
      await waitFor(() => expect(result.current.userInfo?.id).toBe("A"));
      expect(result.current.isConnected).toBe(true);
      expect(result.current.userInfo?.team?.subscription_status).toBe(status);
      expect(mocks.signOut).not.toHaveBeenCalled();
      expect(mocks.clear).not.toHaveBeenCalled();
      expect(mocks.configured).toBe(true);
    },
  );

  it("resumes sync after purchasing a subscription without another login", async () => {
    mocks.getUserInfo.mockResolvedValue(info("A", null));
    const { result } = await setup();
    await act(() => result.current.signInWithEmail("A", "password"));
    await waitFor(() => expect(result.current.userInfo?.id).toBe("A"));
    const oldRequest = result.current.postLoginSyncRequest!.id;
    act(() => result.current.consumePostLoginSyncRequest(oldRequest));
    mocks.getUserInfo.mockResolvedValue(info("A", "active"));
    await act(async () => document.dispatchEvent(new Event("visibilitychange")));
    await waitFor(() =>
      expect(result.current.postLoginSyncRequest?.source).toBe("subscription-activated"),
    );
    expect(result.current.isConnected).toBe(true);
    expect(mocks.signIn).toHaveBeenCalledTimes(1);
    expect(mocks.signOut).not.toHaveBeenCalled();
  });

  it("keeps login on lookup failures and recovers on refresh", async () => {
    mocks.getUserInfo.mockRejectedValue(new Error("Service unavailable"));
    const { result } = await setup();
    await act(() => result.current.signInWithEmail("A", "password"));
    await waitFor(() => expect(result.current.error).toBe("Service unavailable"));
    expect(result.current.userInfo).toBeNull();
    expect(result.current.isConnected).toBe(true);
    mocks.getUserInfo.mockResolvedValue(info("A", "active"));
    await act(() => result.current.refetchUserInfo());
    expect(result.current.postLoginSyncRequest?.source).toBe("subscription-activated");
    expect(mocks.signOut).not.toHaveBeenCalled();
  });

  it("signs out only when the backend auth session is missing on mobile resume", async () => {
    mocks.platform = "ios";
    const { result } = await setup();
    await act(() => result.current.signInWithEmail("A", "password"));
    await waitFor(() => expect(result.current.userInfo?.id).toBe("A"));
    mocks.configured = false;
    await act(async () => document.dispatchEvent(new Event("visibilitychange")));
    await waitFor(() => expect(result.current.isConnected).toBe(false));
    expect(mocks.clear).not.toHaveBeenCalled();
  });

  it("queues a mobile OAuth callback behind ongoing sign-out cleanup", async () => {
    mocks.platform = "ios";
    const cleanup = deferred<void>();
    const { result } = await setup();
    await act(() => result.current.signInWithEmail("A", "password"));
    await waitFor(() => expect(result.current.userInfo?.id).toBe("A"));
    mocks.clear.mockImplementationOnce(() => cleanup.promise);
    let logout!: Promise<void>;
    act(() => {
      logout = result.current.signOut();
    });
    await waitFor(() => expect(mocks.clear).toHaveBeenCalledTimes(1));
    await act(async () =>
      mocks.onDeepLink({ payload: "wealthfolio://auth/callback?code=mobile-code" }),
    );
    expect(mocks.exchange).not.toHaveBeenCalled();
    await act(async () => {
      cleanup.resolve();
      await logout;
    });
    await waitFor(() => expect(result.current.user?.id).toBe("B"));
    expect(mocks.account).toBe("B");
    expect(mocks.configured).toBe(true);
  });
});
