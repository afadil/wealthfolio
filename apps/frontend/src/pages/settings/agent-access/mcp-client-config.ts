import { isWeb } from "@/adapters";
import { selectedProfileId } from "@/features/profiles/session";
const clientHeaders = (token: string) => ({
  Authorization: `Bearer ${token}`,
  ...(isWeb && selectedProfileId() ? { "X-WF-Profile-Id": selectedProfileId() } : {}),
});
// Ready-to-paste MCP client setup snippets. Shared by the connect-client
// card (token placeholder) and the token-created dialog (real token), so both
// render identical snippets for each known agent.

/** Placeholder used when no real token is available (the connect card). */
export const TOKEN_PLACEHOLDER = "YOUR_TOKEN";

/** Environment variable the token-free snippets (.mcp.json, Codex) read. */
export const TOKEN_ENV_VAR = "WEALTHFOLIO_TOKEN";

/**
 * The single "Copy config" default: the Claude Code command, which also
 * configures the Claude Desktop Code tab. The Claude Desktop chat tab only
 * loads command (stdio) servers, so it has no preset.
 */
export const DEFAULT_PRESET_ID = "claude-code";

export interface ClientPreset {
  id: string;
  label: string;
  /** Where the user pastes or runs the snippet (file path or UI location). */
  location?: string;
  /** What `build` returns: a JSON config, a shell command, or TOML. */
  format: "json" | "command" | "toml";
  build: (url: string, token: string) => string;
}

const json = (value: unknown) => JSON.stringify(value, null, 2);

/** Shape shared by Claude Code (.mcp.json), Cursor, Windsurf, Cline, … */
const mcpServers = (url: string, headers: Record<string, string | undefined>) =>
  json({
    mcpServers: {
      wealthfolio: {
        type: "http",
        url,
        headers,
      },
    },
  });

/** TOML key, quoted only when it is not a bare key. */
const tomlKey = (key: string) => (/^[A-Za-z0-9_-]+$/.test(key) ? key : JSON.stringify(key));

/** Inline TOML table. JSON string escapes are valid TOML basic strings. */
const tomlInlineTable = (entries: Record<string, string | undefined>) =>
  `{ ${Object.entries(entries)
    .map(([key, value]) => `${tomlKey(key)} = ${JSON.stringify(value)}`)
    .join(", ")} }`;

export const CLIENT_PRESETS: ClientPreset[] = [
  {
    id: "claude-code",
    label: "Claude Code / Claude Desktop (Code tab)",
    location: "Run in a terminal; adds the server for all your projects (~/.claude.json)",
    format: "command",
    build: (url, token) =>
      [
        `claude mcp add --scope user --transport http wealthfolio ${url}`,
        ...Object.entries(clientHeaders(token)).map(
          ([name, value]) => `--header "${name}: ${value}"`,
        ),
      ].join(" "),
  },
  {
    id: "claude-code-project",
    label: "Claude Code (project)",
    location: `.mcp.json in your project root; reads the token from ${TOKEN_ENV_VAR}`,
    format: "json",
    build: (url) => mcpServers(url, clientHeaders(`\${${TOKEN_ENV_VAR}}`)),
  },
  {
    id: "codex",
    label: "Codex / ChatGPT desktop",
    location: "~/.codex/config.toml (Codex CLI, IDE extension and ChatGPT desktop app)",
    format: "toml",
    build: (url, token) =>
      [
        "[mcp_servers.wealthfolio]",
        `url = ${JSON.stringify(url)}`,
        `http_headers = ${tomlInlineTable(clientHeaders(token))}`,
        "tool_timeout_sec = 120",
      ].join("\n"),
  },
  {
    id: "cursor",
    label: "Cursor",
    location: "~/.cursor/mcp.json (or .cursor/mcp.json in a project)",
    format: "json",
    build: (url, token) => mcpServers(url, clientHeaders(token)),
  },
  {
    id: "windsurf",
    label: "Windsurf",
    location: "~/.codeium/windsurf/mcp_config.json",
    format: "json",
    build: (url, token) => mcpServers(url, clientHeaders(token)),
  },
  {
    id: "cline",
    label: "Cline",
    location: "Cline → MCP Servers → Configure (cline_mcp_settings.json)",
    format: "json",
    build: (url, token) => mcpServers(url, clientHeaders(token)),
  },
  {
    id: "lmstudio",
    label: "LM Studio",
    location: "Program → Install → Edit mcp.json",
    format: "json",
    // LM Studio follows Cursor's notation without a transport type.
    build: (url, token) =>
      json({ mcpServers: { wealthfolio: { url, headers: clientHeaders(token) } } }),
  },
  {
    id: "opencode",
    label: "OpenCode",
    location: "opencode.json in a project, or ~/.config/opencode/opencode.json",
    format: "json",
    build: (url, token) =>
      json({
        mcp: {
          wealthfolio: {
            type: "remote",
            url,
            // A bearer token, not OAuth: stop OpenCode from starting an OAuth flow.
            oauth: false,
            headers: clientHeaders(token),
          },
        },
      }),
  },
  {
    id: "vscode",
    label: "VS Code",
    location: ".vscode/mcp.json",
    format: "json",
    build: (url, token) =>
      json({
        servers: {
          wealthfolio: {
            type: "http",
            url,
            headers: clientHeaders(token),
          },
        },
      }),
  },
  {
    id: "jan",
    label: "Jan",
    location: "Settings → MCP Servers → Add",
    format: "json",
    build: (url, token) =>
      json({
        Wealthfolio: {
          active: true,
          args: [],
          command: "",
          env: {},
          headers: clientHeaders(token),
          type: "http",
          url,
        },
      }),
  },
  {
    id: "generic",
    label: "Generic HTTP",
    location: "Any client that speaks Streamable HTTP",
    format: "json",
    build: (url, token) =>
      json({
        url,
        headers: clientHeaders(token),
      }),
  },
];

/**
 * Setup snippet for a preset. When `token` is omitted, a `YOUR_TOKEN`
 * placeholder is used so the snippet stays valid for the user to fill in
 * after creating a token. Returns "" when the URL is missing.
 */
export function buildClientConfig(presetId: string, url: string, token?: string): string {
  const preset = CLIENT_PRESETS.find((entry) => entry.id === presetId) ?? CLIENT_PRESETS[0];
  if (!url) return "";
  return preset.build(url, token || TOKEN_PLACEHOLDER);
}
