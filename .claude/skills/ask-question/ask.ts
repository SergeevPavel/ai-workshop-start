#!/usr/bin/env node
// Asks a question in the Slack channel of an Air cloud automation run, where nobody reads the chat,
// and waits for the answer in the thread. Credentials come from the environment: SLACK_BOT_TOKEN and
// SLACK_CHANNEL_ID. The bot needs chat:write, the channel's history scope and reactions:write, and to be
// in the channel.
//
//   node .claude/skills/ask-question/ask.ts "<question>" [--timeout 540]   post, then wait for a reply
//   node .claude/skills/ask-question/ask.ts --thread <ts> [--timeout 540]   keep waiting on that thread
//   node .claude/skills/ask-question/ask.ts --thread <ts> --say "<text>"    post in the thread, no wait
//   node .claude/skills/ask-question/ask.ts --thread <ts> --done            mark the question ✅: the answers were enough
//   node .claude/skills/ask-question/ask.ts --thread <ts> --unanswered      mark the question 💤: the run stops without an answer
//
// Replies go to stdout, one line each, `<name>: <text>`; the thread's ts goes to stderr as `thread=<ts>`.
// Exit 0: answered. Exit 2: no answer within --timeout; rerun with --thread to keep waiting. Exit 1: cannot ask.
// Killed while waiting (SIGINT, SIGTERM, SIGHUP), it marks the question 💤 before it exits.
import { parseArgs } from 'node:util';

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    thread: { type: 'string' },
    say: { type: 'string' },
    done: { type: 'boolean', default: false },
    unanswered: { type: 'boolean', default: false },
    timeout: { type: 'string', default: '540' },
  },
});

const usage =
  'Usage: node .claude/skills/ask-question/ask.ts "<question>" [--timeout <seconds>]\n' +
  '       node .claude/skills/ask-question/ask.ts --thread <ts> [--timeout <seconds>] [--say "<text>"] [--done | --unanswered]';
const [question] = positionals;
if (positionals.length > 1 || (!question && !values.thread) || (question && values.thread)) {
  console.error(`Expected a question, or --thread <ts>\n\n${usage}`);
  process.exit(1);
}
if ((values.done || values.unanswered) && (!values.thread || (values.done && values.unanswered))) {
  console.error(`--done and --unanswered need --thread <ts>, and exclude each other\n\n${usage}`);
  process.exit(1);
}
const timeout = Number(values.timeout);
if (!(timeout >= 0)) throw new Error(`Not a timeout: ${values.timeout}; expected seconds, e.g. 540`);

const token = process.env.SLACK_BOT_TOKEN;
const channel = process.env.SLACK_CHANNEL_ID;
if (!token || !channel) {
  console.error('SLACK_BOT_TOKEN and SLACK_CHANNEL_ID are not set: not an Air cloud automation run, or its credentials are missing. Ask in the chat instead.');
  process.exit(1);
}

type Reply = { ok: boolean; error?: string } & Record<string, any>;
const slack = async (method: string, params: Record<string, string>, post = false): Promise<Reply> => {
  const url = `https://slack.com/api/${method}`;
  const authorization = { Authorization: `Bearer ${token}` };
  const response = post
    ? await fetch(url, { method: 'POST', headers: { ...authorization, 'Content-Type': 'application/json; charset=utf-8' }, body: JSON.stringify(params) })
    : await fetch(`${url}?${new URLSearchParams(params)}`, { headers: authorization });
  return response.json() as Promise<Reply>;
};
const fail = (what: string, error: string | undefined): never => {
  const hints: Record<string, string> = {
    invalid_auth: 'Slack rejected SLACK_BOT_TOKEN. It is revoked or wrong; ask in the chat or comment on the issue instead.',
    not_in_channel: 'The bot is not in the channel and could not join it. Invite it there: /invite @<bot>.',
    missing_scope: 'The token lacks a scope: chat:write to post, channels:history (groups:history for a private channel) to read replies, reactions:write to mark the question.',
    channel_not_found: `No channel ${channel} for this token's workspace.`,
  };
  console.error(`${what}: ${error}${error && hints[error] ? `\n${hints[error]}` : ''}`);
  process.exit(1);
};

const auth = await slack('auth.test', {}, true);
if (!auth.ok) fail('auth.test', auth.error);
const me = auth.user_id as string;

let thread = values.thread;
if (question) {
  let posted = await slack('chat.postMessage', { channel, text: `${question}\n_Reply in this thread._` }, true);
  if (!posted.ok && posted.error === 'not_in_channel' && (await slack('conversations.join', { channel }, true)).ok) {
    posted = await slack('chat.postMessage', { channel, text: `${question}\n_Reply in this thread._` }, true);
  }
  if (!posted.ok) fail('chat.postMessage', posted.error);
  thread = posted.ts as string;
}
console.error(`thread=${thread}`);
// A reaction on the question tells the channel whether the thread still needs a reply.
const mark = (reaction: 'white_check_mark' | 'zzz') => slack('reactions.add', { channel, timestamp: thread!, name: reaction }, true);
if (values.say) {
  const said = await slack('chat.postMessage', { channel, thread_ts: thread!, text: values.say }, true);
  if (!said.ok) fail('chat.postMessage', said.error);
}
if (values.done || values.unanswered) {
  const marked = await mark(values.done ? 'white_check_mark' : 'zzz');
  if (!marked.ok && marked.error !== 'already_reacted') fail('reactions.add', marked.error);
}
if (values.say || values.done || values.unanswered) process.exit(0);

for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP'] as const) {
  process.once(signal, async () => {
    const marked = await mark('zzz');
    if (!marked.ok && marked.error !== 'already_reacted') console.error(`reactions.add: ${marked.error}`);
    process.exit(2);
  });
}
const names = new Map<string, string>();
const name = async (user: string) => {
  if (!names.has(user)) {
    const info = await slack('users.info', { user }, false);
    names.set(user, info.ok ? info.user.profile?.display_name || info.user.real_name || user : user);
  }
  return names.get(user)!;
};
const deadline = Date.now() + timeout * 1000;
for (;;) {
  const replies = await slack('conversations.replies', { channel, ts: thread!, limit: '200' }, false);
  if (!replies.ok) fail('conversations.replies', replies.error);
  // The question itself and the bot's own follow-ups are not answers.
  const answers = (replies.messages as any[]).filter((m) => m.ts !== thread && !m.bot_id && m.user !== me);
  if (answers.length > 0) {
    for (const m of answers) console.log(`${await name(m.user)}: ${m.text}`);
    process.exit(0);
  }
  if (Date.now() >= deadline) {
    console.error(`No reply after ${timeout} s. Keep waiting: node .claude/skills/ask-question/ask.ts --thread ${thread}`);
    process.exit(2);
  }
  await new Promise((resolve) => setTimeout(resolve, Math.min(15_000, Math.max(0, deadline - Date.now()))));
}
