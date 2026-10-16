import { beforeEach, describe, expect, it, vi } from "vitest";

const runtime = vi.hoisted(() => ({ web: false, profileId: undefined as string | undefined }));

vi.mock("@/adapters", () => ({
  get isWeb() {
    return runtime.web;
  },
}));
vi.mock("@/features/profiles/session", () => ({
  selectedProfileId: () => runtime.profileId,
}));

import { buildClientConfig, DEFAULT_PRESET_ID } from "./mcp-client-config";

const URL = "http://127.0.0.1:4321/mcp";
const TOKEN = "wfp_abcDEF123-_xyz";

describe("buildClientConfig", () => {
  beforeEach(() => {
    runtime.web = false;
    runtime.profileId = undefined;
  });

  it("defaults to the user-scope Claude Code command", () => {
    expect(DEFAULT_PRESET_ID).toBe("claude-code");
    expect(buildClientConfig(DEFAULT_PRESET_ID, URL, TOKEN)).toBe(
      `claude mcp add --scope user --transport http wealthfolio ${URL} ` +
        `--header "Authorization: Bearer ${TOKEN}"`,
    );
  });

  it("uses the token placeholder until a token exists", () => {
    expect(buildClientConfig(DEFAULT_PRESET_ID, URL)).toContain(
      '--header "Authorization: Bearer YOUR_TOKEN"',
    );
  });

  it("returns nothing without a server URL", () => {
    expect(buildClientConfig(DEFAULT_PRESET_ID, "", TOKEN)).toBe("");
  });

  it("writes Codex config.toml with the token header and a tool timeout", () => {
    expect(buildClientConfig("codex", URL, TOKEN)).toBe(
      [
        "[mcp_servers.wealthfolio]",
        `url = "${URL}"`,
        `http_headers = { Authorization = "Bearer ${TOKEN}" }`,
        "tool_timeout_sec = 120",
      ].join("\n"),
    );
  });

  it("keeps the token out of the project .mcp.json", () => {
    const config = JSON.parse(buildClientConfig("claude-code-project", URL, TOKEN));
    expect(config).toEqual({
      mcpServers: {
        wealthfolio: {
          type: "http",
          url: URL,
          headers: { Authorization: "Bearer ${WEALTHFOLIO_TOKEN}" },
        },
      },
    });
  });

  it("writes OpenCode's remote entry with OAuth off", () => {
    expect(JSON.parse(buildClientConfig("opencode", URL, TOKEN))).toEqual({
      mcp: {
        wealthfolio: {
          type: "remote",
          url: URL,
          oauth: false,
          headers: { Authorization: `Bearer ${TOKEN}` },
        },
      },
    });
  });

  it("writes LM Studio's mcp.json without a transport type", () => {
    expect(JSON.parse(buildClientConfig("lmstudio", URL, TOKEN))).toEqual({
      mcpServers: { wealthfolio: { url: URL, headers: { Authorization: `Bearer ${TOKEN}` } } },
    });
  });

  it("adds the profile header on the web build", () => {
    runtime.web = true;
    runtime.profileId = "profile-1";

    expect(buildClientConfig(DEFAULT_PRESET_ID, URL, TOKEN)).toBe(
      `claude mcp add --scope user --transport http wealthfolio ${URL} ` +
        `--header "Authorization: Bearer ${TOKEN}" --header "X-WF-Profile-Id: profile-1"`,
    );
    expect(buildClientConfig("codex", URL, TOKEN)).toContain(
      `http_headers = { Authorization = "Bearer ${TOKEN}", X-WF-Profile-Id = "profile-1" }`,
    );
    expect(
      JSON.parse(buildClientConfig("cursor", URL, TOKEN)).mcpServers.wealthfolio.headers,
    ).toEqual({ Authorization: `Bearer ${TOKEN}`, "X-WF-Profile-Id": "profile-1" });
  });
});
