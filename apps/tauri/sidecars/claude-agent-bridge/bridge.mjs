// Wealthfolio Claude Subscription Bridge
//
// A long-running Node sidecar process. Reads NDJSON commands from stdin,
// writes NDJSON events to stdout. Talks to Claude via @anthropic-ai/claude-agent-sdk,
// which uses the user's locally-installed, logged-in Claude Code as the auth
// source — no API key needed.
//
// === Protocol ===
//
// Each line on stdin is a JSON object with a `type` field. Lines on stdout
// are also JSON objects with a `type` field.
//
// Commands (stdin):
//   {type:"ping", id}
//   {type:"start_query", threadId, prompt, systemPrompt?, toolDefs?, maxTurns?, cwd?, model?}
//   {type:"tool_result", threadId, toolCallId, ok, content?, error?}
//   {type:"cancel", threadId}
//   {type:"shutdown"}
//
// Events (stdout):
//   {type:"pong", id}
//   {type:"system",   threadId, sessionId, model, tools}
//   {type:"text_delta",       threadId, text}
//   {type:"reasoning_delta",  threadId, text}
//   {type:"tool_call",        threadId, toolCallId, name, args}     // parent must reply with tool_result
//   {type:"tool_result_ack",  threadId, toolCallId}                 // sidecar acknowledges receipt
//   {type:"rate_limit",       threadId, status, resetsAt}
//   {type:"usage",            threadId, inputTokens, outputTokens, estimatedCostUsd}
//   {type:"error",            threadId|null, message, recoverable}
//   {type:"done",             threadId, sessionId, ok, totalTokens, totalCostUsd}
//
// === Tool bridging ===
//
// The parent (Rust) supplies a list of tool definitions in `start_query.toolDefs`.
// Each one becomes an in-process MCP tool registered with the Agent SDK via
// createSdkMcpServer/tool(). When Claude calls one, the sidecar emits a
// `tool_call` event to stdout and AWAITS a matching `tool_result` from stdin
// (correlated by toolCallId). The result is returned to Claude.
//
// The sidecar passes `tools: []` to query() so the default Claude Code tools
// (Bash, Edit, etc.) are NOT exposed — only the Wealthfolio MCP tools.

import readline from 'node:readline';
import { randomUUID } from 'node:crypto';
import {
  query,
  createSdkMcpServer,
  tool,
} from '@anthropic-ai/claude-agent-sdk';
import { z } from 'zod';

// ───────────────────────────────────────────────────────────────────────────
// I/O helpers
// ───────────────────────────────────────────────────────────────────────────

const stdoutLock = { busy: false, queue: [] };

function send(obj) {
  // Serialize writes so concurrent emitters can't interleave a single line.
  const line = JSON.stringify(obj) + '\n';
  if (stdoutLock.busy) {
    stdoutLock.queue.push(line);
    return;
  }
  stdoutLock.busy = true;
  process.stdout.write(line, () => {
    stdoutLock.busy = false;
    if (stdoutLock.queue.length > 0) {
      const next = stdoutLock.queue.shift();
      stdoutLock.busy = true;
      process.stdout.write(next, () => {
        stdoutLock.busy = false;
      });
    }
  });
}

function logErr(...args) {
  // stderr is for sidecar diagnostics only — never used for protocol.
  process.stderr.write('[bridge] ' + args.map(String).join(' ') + '\n');
}

// ───────────────────────────────────────────────────────────────────────────
// State
// ───────────────────────────────────────────────────────────────────────────

/**
 * threadId -> {
 *   abortController: AbortController,
 *   pendingTools: Map<toolCallId, { resolve, reject }>,
 * }
 */
const activeThreads = new Map();

function getThread(threadId) {
  return activeThreads.get(threadId);
}

function endThread(threadId) {
  const t = activeThreads.get(threadId);
  if (!t) return;
  // Reject any tool calls still waiting on the parent.
  for (const [, pending] of t.pendingTools) {
    pending.reject(new Error('thread ended before tool result arrived'));
  }
  t.pendingTools.clear();
  activeThreads.delete(threadId);
}

// ───────────────────────────────────────────────────────────────────────────
// Tool bridging
// ───────────────────────────────────────────────────────────────────────────

/**
 * Build an MCP tool object that, when called by Claude, sends a tool_call
 * event to the parent and awaits a matching tool_result.
 *
 * @param {string} threadId
 * @param {{name: string, description: string, inputSchema: object}} def
 */
function buildBridgedTool(threadId, def) {
  // The Agent SDK's tool() helper takes a Zod schema. Since the parent already
  // supplies a JSON Schema (from rig-core's ToolDefinition), we accept any
  // shape and rely on the parent (which knows the real schema) to validate.
  // Zod's z.any() satisfies the SDK's type requirement without constraining input.
  const inputZod = z.any();

  return tool(
    def.name,
    def.description ?? '',
    // The SDK expects an object whose values are Zod schemas (a "shape").
    // Wrap everything under a single passthrough field that captures the raw args.
    { args: inputZod },
    async (input) => {
      // input is `{args: <whatever Claude passed>}`. Unwrap it.
      const args = input?.args ?? input ?? {};
      const t = getThread(threadId);
      if (!t) {
        return {
          content: [
            { type: 'text', text: 'error: thread is no longer active' },
          ],
          isError: true,
        };
      }

      const toolCallId = randomUUID();
      const promise = new Promise((resolve, reject) => {
        t.pendingTools.set(toolCallId, { resolve, reject });
      });

      send({
        type: 'tool_call',
        threadId,
        toolCallId,
        name: def.name,
        args,
      });

      try {
        const result = await promise;
        // result: { ok: bool, content?: string|object, error?: string }
        if (result.ok === false) {
          return {
            content: [
              { type: 'text', text: String(result.error ?? 'tool failed') },
            ],
            isError: true,
          };
        }
        const content = result.content;
        const text =
          typeof content === 'string'
            ? content
            : JSON.stringify(content ?? null);
        return { content: [{ type: 'text', text }] };
      } catch (err) {
        return {
          content: [{ type: 'text', text: 'tool bridge error: ' + (err?.message ?? err) }],
          isError: true,
        };
      }
    }
  );
}

// ───────────────────────────────────────────────────────────────────────────
// Commands
// ───────────────────────────────────────────────────────────────────────────

async function handlePing(cmd) {
  send({ type: 'pong', id: cmd.id });
}

async function handleStartQuery(cmd) {
  const { threadId, prompt, systemPrompt, toolDefs = [], maxTurns, cwd, model } = cmd;

  if (!threadId || typeof prompt !== 'string') {
    send({
      type: 'error',
      threadId: threadId ?? null,
      message: 'start_query requires threadId and prompt',
      recoverable: false,
    });
    return;
  }

  if (activeThreads.has(threadId)) {
    send({
      type: 'error',
      threadId,
      message: 'thread already active',
      recoverable: false,
    });
    return;
  }

  const abortController = new AbortController();
  const state = {
    abortController,
    pendingTools: new Map(),
  };
  activeThreads.set(threadId, state);

  // Build in-process MCP server with the parent's tool definitions.
  const bridgedTools = toolDefs.map((def) => buildBridgedTool(threadId, def));
  const mcpServer =
    bridgedTools.length > 0
      ? createSdkMcpServer({
          name: 'wealthfolio-tools',
          version: '0.1.0',
          tools: bridgedTools,
        })
      : null;

  // Built-in Claude Code tools we expose to the model.
  // SAFE for a finance app:
  //   - WebSearch / WebFetch are read-only network reads (look up tickers, news, etc.)
  // EXPLICITLY EXCLUDED for safety:
  //   - Bash, Read, Write, Edit, Glob, Grep (filesystem / shell access)
  //   - Agent (could spawn subagents that transitively access dangerous tools)
  //   - AskUserQuestion (would prompt the host CC terminal, not our chat UI)
  const SAFE_BUILTIN_TOOLS = ['WebSearch', 'WebFetch'];

  // The MCP server registers tools under names prefixed by `mcp__<server>__<toolName>`.
  // We must explicitly allowlist them or the SDK won't expose them to the model.
  const mcpToolNames = bridgedTools.length > 0
    ? toolDefs.map((d) => `mcp__wealthfolio-tools__${d.name}`)
    : [];
  const allowedTools = [...SAFE_BUILTIN_TOOLS, ...mcpToolNames];

  const options = {
    // Whitelist only safe read-only built-in tools (web access). Bash, Edit,
    // Read, Write, Glob, Grep, Agent, AskUserQuestion are dropped.
    tools: SAFE_BUILTIN_TOOLS,
    allowedTools,
    settingSources: [],
    // Pre-approved allowlist model: any tool not on `allowedTools` is denied.
    permissionMode: 'dontAsk',
    abortController,
  };

  if (mcpServer) {
    options.mcpServers = { 'wealthfolio-tools': mcpServer };
  }
  if (systemPrompt) {
    options.systemPrompt = systemPrompt;
  }
  if (typeof maxTurns === 'number') {
    options.maxTurns = maxTurns;
  }
  if (cwd) {
    options.cwd = cwd;
  }
  if (model) {
    options.model = model;
  }

  let sessionId = null;
  let totalTokens = 0;
  let totalCostUsd = 0;
  let ok = false;
  let lastError = null;

  try {
    const stream = query({ prompt, options });

    for await (const message of stream) {
      if (!activeThreads.has(threadId)) break; // cancelled

      switch (message?.type) {
        case 'system': {
          if (message.subtype === 'init') {
            sessionId = message.session_id ?? null;
            send({
              type: 'system',
              threadId,
              sessionId,
              model: message.model ?? null,
              tools: Array.isArray(message.tools) ? message.tools : [],
            });
          }
          break;
        }

        case 'assistant': {
          // Streamed assistant content blocks.
          const blocks = message?.message?.content;
          if (Array.isArray(blocks)) {
            for (const block of blocks) {
              if (block?.type === 'text' && typeof block.text === 'string') {
                send({ type: 'text_delta', threadId, text: block.text });
              } else if (block?.type === 'thinking' && typeof block.thinking === 'string') {
                send({ type: 'reasoning_delta', threadId, text: block.thinking });
              }
              // tool_use blocks are NOT forwarded as text — the SDK invokes
              // the bridged MCP tool directly, which emits its own tool_call event.
            }
          }
          // Per-message usage hints.
          const usage = message?.message?.usage;
          if (usage) {
            send({
              type: 'usage',
              threadId,
              inputTokens: usage.input_tokens ?? 0,
              outputTokens: usage.output_tokens ?? 0,
              estimatedCostUsd: 0, // final cost arrives in the result message
            });
          }
          break;
        }

        case 'rate_limit_event': {
          const info = message.rate_limit_info ?? {};
          send({
            type: 'rate_limit',
            threadId,
            status: info.status ?? 'unknown',
            resetsAt: info.resetsAt ?? null,
          });
          break;
        }

        case 'result': {
          ok = !message.is_error;
          sessionId = message.session_id ?? sessionId;
          totalCostUsd = message.total_cost_usd ?? 0;
          if (message.usage) {
            totalTokens =
              (message.usage.input_tokens ?? 0) +
              (message.usage.output_tokens ?? 0);
          }
          if (message.is_error) {
            lastError = message.error?.message ?? 'query failed';
          }
          break;
        }

        default:
          // Unknown message types are ignored — keeps us forward-compatible.
          break;
      }
    }
  } catch (err) {
    lastError = err?.message ?? String(err);
    logErr('start_query error:', lastError);
  } finally {
    if (lastError) {
      send({
        type: 'error',
        threadId,
        message: lastError,
        recoverable: false,
      });
    }
    send({
      type: 'done',
      threadId,
      sessionId,
      ok,
      totalTokens,
      totalCostUsd,
    });
    endThread(threadId);
  }
}

function handleToolResult(cmd) {
  const { threadId, toolCallId } = cmd;
  const t = getThread(threadId);
  if (!t) {
    send({
      type: 'error',
      threadId,
      message: `tool_result for unknown thread ${threadId}`,
      recoverable: true,
    });
    return;
  }
  const pending = t.pendingTools.get(toolCallId);
  if (!pending) {
    send({
      type: 'error',
      threadId,
      message: `tool_result for unknown toolCallId ${toolCallId}`,
      recoverable: true,
    });
    return;
  }
  t.pendingTools.delete(toolCallId);
  pending.resolve({
    ok: cmd.ok !== false,
    content: cmd.content,
    error: cmd.error,
  });
  send({ type: 'tool_result_ack', threadId, toolCallId });
}

function handleCancel(cmd) {
  const t = getThread(cmd.threadId);
  if (!t) return;
  try {
    t.abortController.abort();
  } catch (err) {
    logErr('abort failed:', err?.message ?? err);
  }
  endThread(cmd.threadId);
}

// ───────────────────────────────────────────────────────────────────────────
// Main loop
// ───────────────────────────────────────────────────────────────────────────

const rl = readline.createInterface({
  input: process.stdin,
  crlfDelay: Infinity,
});

rl.on('line', (line) => {
  const trimmed = line.trim();
  if (!trimmed) return;
  let cmd;
  try {
    cmd = JSON.parse(trimmed);
  } catch (err) {
    send({
      type: 'error',
      threadId: null,
      message: 'invalid json on stdin: ' + (err?.message ?? err),
      recoverable: true,
    });
    return;
  }

  switch (cmd.type) {
    case 'ping':
      handlePing(cmd);
      break;
    case 'start_query':
      handleStartQuery(cmd).catch((err) =>
        send({
          type: 'error',
          threadId: cmd.threadId ?? null,
          message: err?.message ?? String(err),
          recoverable: false,
        })
      );
      break;
    case 'tool_result':
      handleToolResult(cmd);
      break;
    case 'cancel':
      handleCancel(cmd);
      break;
    case 'shutdown':
      logErr('shutdown requested');
      process.exit(0);
      break;
    default:
      send({
        type: 'error',
        threadId: null,
        message: 'unknown command type: ' + cmd.type,
        recoverable: true,
      });
  }
});

rl.on('close', () => {
  logErr('stdin closed, exiting');
  process.exit(0);
});

process.on('uncaughtException', (err) => {
  logErr('uncaughtException:', err?.stack ?? err);
  send({
    type: 'error',
    threadId: null,
    message: 'sidecar uncaughtException: ' + (err?.message ?? err),
    recoverable: false,
  });
});

logErr('ready (node ' + process.version + ')');
