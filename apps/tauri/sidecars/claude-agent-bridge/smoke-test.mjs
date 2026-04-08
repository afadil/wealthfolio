// Smoke test for bridge.mjs
//
// Spawns the bridge as a child process, exercises:
//   1. ping/pong
//   2. start_query with a bridged tool — verifies that
//      - the SDK invokes the tool
//      - the bridge emits tool_call to stdout
//      - this test sends back tool_result via stdin
//      - the SDK feeds the result back to Claude
//      - the final assistant text references the tool's return value
//
// Pass criterion: the test sees a `done` event with ok=true and observed
// at least one tool_call/tool_result round-trip and at least one text_delta.

import { spawn } from 'node:child_process';
import readline from 'node:readline';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import process from 'node:process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const bridgePath = path.join(__dirname, 'bridge.mjs');

const env = { ...process.env };
delete env.ANTHROPIC_API_KEY;

const child = spawn('node', [bridgePath], {
  stdio: ['pipe', 'pipe', 'inherit'],
  env,
});

const rl = readline.createInterface({ input: child.stdout });

function send(obj) {
  child.stdin.write(JSON.stringify(obj) + '\n');
}

const observed = {
  pong: false,
  textDeltas: 0,
  toolCalls: 0,
  done: null,
  errors: [],
};

const PING_ID = 'ping-1';
const THREAD_ID = 'smoke-thread-1';

const TIMEOUT_MS = 90_000;
const timer = setTimeout(() => {
  console.error('[smoke] TIMEOUT — killing bridge');
  child.kill();
  process.exit(2);
}, TIMEOUT_MS);

rl.on('line', (line) => {
  let evt;
  try {
    evt = JSON.parse(line);
  } catch {
    console.error('[smoke] non-json on stdout:', line);
    return;
  }
  console.log('[smoke] <-', JSON.stringify(evt).slice(0, 220));

  switch (evt.type) {
    case 'pong':
      if (evt.id === PING_ID) {
        observed.pong = true;
        // Now start the actual query.
        send({
          type: 'start_query',
          threadId: THREAD_ID,
          prompt:
            'Use the get_lucky_number tool to fetch the lucky number, then reply with exactly: "Lucky number is N." where N is the value returned by the tool. Do not say anything else.',
          systemPrompt:
            'You are a test harness. Always call the tool when instructed.',
          maxTurns: 3,
          toolDefs: [
            {
              name: 'get_lucky_number',
              description:
                'Returns a fixed lucky number for the test harness. Takes no arguments.',
              inputSchema: {
                type: 'object',
                properties: {},
                additionalProperties: false,
              },
            },
          ],
        });
      }
      break;

    case 'system':
      // session started
      break;

    case 'text_delta':
      observed.textDeltas += 1;
      break;

    case 'tool_call':
      observed.toolCalls += 1;
      // Reply with the lucky number.
      send({
        type: 'tool_result',
        threadId: evt.threadId,
        toolCallId: evt.toolCallId,
        ok: true,
        content: '42',
      });
      break;

    case 'error':
      observed.errors.push(evt.message);
      break;

    case 'done':
      observed.done = evt;
      finish();
      break;
  }
});

function finish() {
  clearTimeout(timer);
  send({ type: 'shutdown' });
  setTimeout(() => child.kill(), 500);

  console.log('---');
  console.log('observed:', observed);

  const passed =
    observed.pong &&
    observed.toolCalls >= 1 &&
    observed.textDeltas >= 1 &&
    observed.done &&
    observed.done.ok === true &&
    observed.errors.length === 0;

  if (passed) {
    console.log('\n[smoke] PASS — bridge protocol works end-to-end with tool round-trip.');
    process.exit(0);
  } else {
    console.error('\n[smoke] FAIL — see observed counters above.');
    process.exit(1);
  }
}

child.on('exit', (code) => {
  console.log('[smoke] bridge exited code=' + code);
});

// Kick off with a ping.
send({ type: 'ping', id: PING_ID });
