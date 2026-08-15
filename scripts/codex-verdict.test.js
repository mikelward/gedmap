import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import {
  verdictFor,
  PENDING,
  matchesBot,
  readReactions,
  sweep,
  sharedHeads,
  CODEX_BOT,
  CONTEXT,
} from "./codex-verdict.mjs";

describe("verdictFor", () => {
  it("is pending until Codex has reacted", () => {
    // The case auto-merge would otherwise race: CI green, Codex silent.
    expect(verdictFor({ approved: false })).toEqual({
      state: "pending",
      description: PENDING,
    });
  });

  it("is success once it has", () => {
    expect(verdictFor({ approved: true }).state).toBe("success");
  });

  it("refuses a head shared with another open PR, reaction or not", () => {
    // A status belongs to the commit and the reaction to the PR, so one
    // status cannot describe both.
    expect(verdictFor({ approved: true, sharedHead: true })).toEqual({
      state: "failure",
      description: "Head shared with another open PR — verdict is ambiguous",
    });
  });

  it("holds when someone has reacted 👎, even with the verdict in", () => {
    // The cheap way to stop an auto-merge from a phone.
    expect(verdictFor({ approved: true, held: "👎" })).toEqual({
      state: "failure",
      description: "On hold: 👎 on the pull request",
    });
  });

  it("holds on 👀 too", () => {
    expect(verdictFor({ approved: true, held: "👀" }).state).toBe("failure");
  });

  it("skips drafts", () => {
    expect(verdictFor({ isDraft: true, approved: true })).toBeNull();
  });
});

describe("readReactions", () => {
  const HEAD = "2026-08-14T12:00:00Z";
  const CODEX = `${CODEX_BOT}[bot]`;
  // Reactions default to after the head, so each test states only the thing
  // it is about; the staleness cases pass their own timestamp.
  const react = (login, content, createdAt = "2026-08-14T12:05:00Z") =>
    ({ content, createdAt, user: { login } });
  const OWNER = "repo-owner";
  const read = (nodes) => readReactions(nodes, { since: HEAD, owner: OWNER });

  it("ignores a 👍 older than the commit it would approve", () => {
    // Codex revokes on push, but asynchronously — so between a push and its
    // noticing, the PR carries a new head and the previous head's reaction.
    // Reading those together approves a commit nobody reviewed.
    const stale = readReactions([react(CODEX, "THUMBS_UP", "2026-08-14T18:00:00Z")], { since: "2026-08-14T19:00:00Z" });
    expect(stale.approved).toBe(false);
  });

  it("takes a 👍 newer than the commit", () => {
    const fresh = readReactions([react(CODEX, "THUMBS_UP", "2026-08-14T19:30:00Z")], { since: "2026-08-14T19:00:00Z" });
    expect(fresh.approved).toBe(true);
  });

  it("holds on the owner's 👎 from before the head — a new commit is not an answer", () => {
    expect(
      readReactions([react(OWNER, "THUMBS_DOWN", "2026-08-14T18:00:00Z")], {
        since: "2026-08-14T19:00:00Z", owner: OWNER,
      }).held,
    ).toBe("👎");
  });

  it("ignores a hold from anyone but the owner", () => {
    // Public repo: an unrestricted hold outlives every head, so a passer-by
    // could block a PR for as long as they left the reaction there.
    expect(read([react("passer-by", "THUMBS_DOWN")]).held).toBeNull();
    expect(read([react("passer-by", "EYES")]).held).toBeNull();
  });

  it("takes Codex's 👍 as the verdict", () => {
    expect(read([react(CODEX, "THUMBS_UP")])).toEqual({
      approved: true,
      held: null,
    });
  });

  it("ignores anyone else's 👍", () => {
    // The reaction is only a verdict because Codex revokes it on push.
    expect(read([react("someone-else", "THUMBS_UP")]).approved).toBe(false);
  });

  it("takes the owner's 👎 as a hold", () => {
    expect(read([react(OWNER, "THUMBS_DOWN")]).held).toBe("👎");
  });

  it("holds on Codex's own 👀, which means it is still reading", () => {
    // It needs no exemption: it clears its 👀 when it reacts 👍, so the two
    // are never both present on a finished verdict. A 👀 that is still there
    // means it is still reading.
    expect(read([react(CODEX, "EYES")]).held).toBe("👀");
  });

  it("holds a 👍 that has picked up a 👀 since — a re-read in progress", () => {
    expect(
      read([react(CODEX, "THUMBS_UP"), react(CODEX, "EYES")]),
    ).toEqual({ approved: true, held: "👀" });
  });

  it("prefers 👎 over 👀 when both are present", () => {
    expect(
      read([react(OWNER, "EYES"), react(OWNER, "THUMBS_DOWN")]).held,
    ).toBe("👎");
  });

  it("ignores a reaction it has no rule for", () => {
    expect(read([react(OWNER, "HOORAY")])).toEqual({
      approved: false,
      held: null,
    });
  });
});

describe("matchesBot", () => {
  it("matches with or without the [bot] suffix", () => {
    expect(matchesBot(`${CODEX_BOT}[bot]`)).toBe(true);
    expect(matchesBot(CODEX_BOT)).toBe(true);
  });

  it("rejects anyone else, and a missing login", () => {
    // The reaction is only a verdict because Codex revokes it on push;
    // a human's 👍 carries no such guarantee.
    expect(matchesBot("someone-else")).toBe(false);
    expect(matchesBot(undefined)).toBe(false);
  });
});

describe("sharedHeads", () => {
  it("names only the SHAs carried by more than one PR", () => {
    expect([...sharedHeads([{ headRefOid: "a" }, { headRefOid: "a" }, { headRefOid: "b" }])]).toEqual(["a"]);
  });

  it("is empty when every head is distinct", () => {
    expect(sharedHeads([{ headRefOid: "a" }, { headRefOid: "b" }]).size).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Sweep, driven by a fake fetch. Every request it makes is recorded, so these
// assert what it asked for as well as what it concluded.

const page = (nodes, hasNextPage = false, endCursor = null) => ({
  nodes,
  pageInfo: { hasNextPage, endCursor },
});

const GATED_AT = "2026-08-14T12:00:00Z";
const AFTER = "2026-08-14T12:05:00Z";
const BEFORE = "2026-08-14T11:00:00Z";
const OWNER = "o";

// The marker: the earliest `codex` status on the head, saying when it was
// first gated. A reaction has to be newer than this to count as approval.
const gate = (created_at = GATED_AT, state = "pending") =>
  ({ context: CONTEXT, state, description: PENDING, created_at });

const prNode = (over = {}) => ({
  number: 1,
  isDraft: false,
  headRefOid: "abc1234",
  reactions: page([]),
  ...over,
});

const thumbs = (login = `${CODEX_BOT}[bot]`, createdAt = AFTER) => ({
  content: "THUMBS_UP",
  createdAt,
  user: { login },
});
const hold = (content = "THUMBS_DOWN", login = OWNER) => ({
  content,
  createdAt: AFTER,
  user: { login },
});

// `statuses` maps a SHA to its `codex` entries, newest first, as GitHub
// returns them. A GET on the statuses path reads them; a POST writes one.
function fakeFetch({ graphqlResponses = [], statuses = {}, failStatusWrite = false } = {}) {
  const calls = [];
  const queue = [...graphqlResponses];
  const impl = async (url, opts = {}) => {
    const path = url.replace("https://api.github.com", "");
    const method = opts.method ?? "GET";
    calls.push({ path, method, body: opts.body ? JSON.parse(opts.body) : null });

    if (path === "/graphql") {
      const data = queue.shift();
      if (!data) throw new Error("unexpected extra graphql call");
      return { ok: true, status: 200, json: async () => (data.errors ? data : { data }) };
    }
    if (path.includes("/statuses/")) {
      if (method === "GET") {
        const sha = path.split("/statuses/")[1].split("?")[0];
        const page = Number(new URLSearchParams(path.split("?")[1] ?? "").get("page") ?? 1);
        const all = statuses[sha] ?? [];
        return { ok: true, status: 200, json: async () => all.slice((page - 1) * 100, page * 100) };
      }
      if (failStatusWrite) return { ok: false, status: 422, json: async () => ({}) };
      return { ok: true, status: 201, json: async () => ({}) };
    }
    throw new Error(`unexpected path ${path}`);
  };
  return { impl, calls };
}

const repoPRs = (nodes, hasNextPage = false, endCursor = null) => ({
  repository: { pullRequests: page(nodes, hasNextPage, endCursor) },
});

const run = (fake) => sweep({ owner: OWNER, name: "r", token: "t", fetchImpl: fake.impl, log: () => {} });

describe("sweep", () => {
  it("publishes pending for a PR Codex has not reacted to", async () => {
    // No `codex` status yet: this sweep is what first gates the head, and
    // writing that marker is what a later sweep judges a reaction against.
    const fake = fakeFetch({ graphqlResponses: [repoPRs([prNode()])] });
    expect(await run(fake)).toEqual([
      { number: 1, state: "pending", description: PENDING },
    ]);
    const write = fake.calls.find((c) => c.method === "POST" && c.path.includes("/statuses/"));
    expect(write.body).toMatchObject({ context: CONTEXT, state: "pending" });
    expect(write.path).toContain("abc1234");
  });

  it("publishes success once Codex has reacted", async () => {
    const fake = fakeFetch({ statuses: { abc1234: [gate()] }, graphqlResponses: [repoPRs([prNode({ reactions: page([thumbs()]) })])] });
    expect((await run(fake))[0].state).toBe("success");
  });

  it("ignores a thumbs-up from anyone else", async () => {
    const fake = fakeFetch({
      graphqlResponses: [repoPRs([prNode({ reactions: page([thumbs("someone-else")]) })])],
    });
    expect((await run(fake))[0].state).toBe("pending");
  });

  it("does not rewrite an identical status", async () => {
    const fake = fakeFetch({
      graphqlResponses: [repoPRs([prNode()])],
      statuses: { abc1234: [gate()] },
    });
    expect(await run(fake)).toEqual([]);
    // The GET shares this path, so only a POST counts as a rewrite.
    expect(fake.calls.some((c) => c.method === "POST" && c.path.includes("/statuses/"))).toBe(false);
  });

  it("rewrites when the state has moved on", async () => {
    const fake = fakeFetch({
      graphqlResponses: [repoPRs([prNode({ reactions: page([thumbs()]) })])],
      statuses: { abc1234: [{ ...gate(), description: "old" }] },
    });
    expect((await run(fake))[0].state).toBe("success");
  });

  it("skips drafts without touching the status API", async () => {
    const fake = fakeFetch({ statuses: { abc1234: [gate()] }, graphqlResponses: [repoPRs([prNode({ isDraft: true })])] });
    expect(await run(fake)).toEqual([]);
    expect(fake.calls.filter((c) => c.path !== "/graphql")).toEqual([]);
  });

  it("follows reactor pages before declaring pending", async () => {
    // Codex's reaction past the first page would otherwise stick the status
    // on pending forever, refetching the same truncated page each sweep.
    const fake = fakeFetch({
      statuses: { abc1234: [gate()] },
      graphqlResponses: [
        repoPRs([prNode({ reactions: page([thumbs("someone-else")], true, "cursor9") })]),
        { repository: { pullRequest: { reactions: page([thumbs()]) } } },
      ],
    });
    expect((await run(fake))[0].state).toBe("success");
  });

  it("stays pending on a 👍 that predates the head being gated", async () => {
    // The push-vs-revoke race, end to end: new head, previous head's 👍.
    const fake = fakeFetch({
      statuses: { abc1234: [gate()] },
      graphqlResponses: [repoPRs([prNode({ reactions: page([thumbs(undefined, BEFORE)]) })])],
    });
    // The head is already marked pending, so a correct sweep writes nothing;
    // what would show here is the 👍 flipping it to success.
    expect(await run(fake)).toEqual([]);
    expect(fake.calls.some((c) => c.method === "POST" && c.path.includes("/statuses/"))).toBe(false);
  });

  it("stays pending on a head that has never been gated", async () => {
    // No marker means nothing to date the reaction against, and an
    // unexpected result must not be readable as approval.
    const fake = fakeFetch({
      graphqlResponses: [
        repoPRs([prNode({ reactions: page([thumbs()]) })]),
      ],
    });
    expect((await run(fake))[0].state).toBe("pending");
  });

  it("pages past a head's other statuses to find the gate marker", async () => {
    // The endpoint returns every context, so a full page of Vercel statuses
    // can hide the marker. Losing it is not a harmless truncation: the sweep
    // would write a replacement, and the existing 👍 would be older than it
    // and rejected by every later sweep.
    const filler = Array.from({ length: 100 }, () => ({ context: "vercel", state: "success", created_at: AFTER }));
    const fake = fakeFetch({
      statuses: { abc1234: [...filler, gate()] },
      graphqlResponses: [repoPRs([prNode({ reactions: page([thumbs()]) })])],
    });
    expect((await run(fake))[0].state).toBe("success");
  });

  it("withholds approval while someone is holding the PR", async () => {
    const fake = fakeFetch({
      graphqlResponses: [repoPRs([prNode({ reactions: page([thumbs(), hold()]) })])],
    });
    expect((await run(fake))[0]).toEqual({
      number: 1,
      state: "failure",
      description: "On hold: 👎 on the pull request",
    });
  });

  it("finds a hold on a later reaction page rather than approving over it", async () => {
    // Why the page walk has no short-circuit on the thumbs-up: stopping at
    // the verdict would merge past a hold nobody got to see.
    const fake = fakeFetch({
      graphqlResponses: [
        repoPRs([prNode({ reactions: page([thumbs()], true, "cursor9") })]),
        { repository: { pullRequest: { reactions: page([hold()]) } } },
      ],
    });
    expect((await run(fake))[0].state).toBe("failure");
  });

  it("refuses two open PRs sharing a head, and asks nothing further", async () => {
    const fake = fakeFetch({
      graphqlResponses: [
        repoPRs([prNode({ number: 1, reactions: page([thumbs()]) }), prNode({ number: 2 })]),
      ],
    });
    const out = await run(fake);
    expect(out.map((w) => w.state)).toEqual(["failure", "failure"]);
    // The set settled it, so no reaction lookup was needed.
    expect(fake.calls.filter((c) => c.path === "/graphql")).toHaveLength(1);
  });

  it("still judges PRs whose heads are distinct", async () => {
    const fake = fakeFetch({
      // bbb has no marker yet, so its first gating is this sweep.
      statuses: { aaa: [gate()] },
      graphqlResponses: [
        repoPRs([
          prNode({ number: 1, headRefOid: "aaa", reactions: page([thumbs()]) }),
          prNode({ number: 2, headRefOid: "bbb" }),
        ]),
      ],
    });
    expect((await run(fake)).map((w) => w.state)).toEqual(["success", "pending"]);
  });

  it("follows pull-request pages", async () => {
    const fake = fakeFetch({
      graphqlResponses: [
        repoPRs([prNode({ number: 1 })], true, "prCursor"),
        repoPRs([prNode({ number: 2, headRefOid: "def5678" })]),
      ],
    });
    expect((await run(fake)).map((w) => w.number)).toEqual([1, 2]);
  });

  it("surfaces a GraphQL error instead of publishing anything", async () => {
    const fake = fakeFetch({ statuses: { abc1234: [gate()] }, graphqlResponses: [{ errors: [{ message: "bad query" }] }] });
    await expect(run(fake)).rejects.toThrow(/bad query/);
    expect(fake.calls.some((c) => c.path.includes("/statuses/"))).toBe(false);
  });

  it("surfaces a failed status write with its path and code, not its body", async () => {
    const fake = fakeFetch({ graphqlResponses: [repoPRs([prNode()])], failStatusWrite: true });
    await expect(run(fake)).rejects.toThrow(/POST \/repos\/o\/r\/statuses\/abc1234 failed: 422/);
  });
});

// ---------------------------------------------------------------------------
// Both workflows hold `statuses: write`, and the safety of each is largely the
// *absence* of something — a checkout, a branch-selectable trigger — which
// nothing else would notice going missing.

describe("codex-verdict-reset workflow", () => {
  const yml = readFileSync(".github/workflows/codex-verdict-reset.yml", "utf8");

  it("never checks out the repository", () => {
    expect(yml).not.toMatch(/actions\/checkout/);
  });

  it("runs no code from the repository", () => {
    expect(yml).not.toMatch(/\bnode\s+scripts\//);
    expect(yml).not.toMatch(/\bnpm\b/);
  });

  it("takes only the head SHA from the event", () => {
    expect(yml).toMatch(/github\.event\.pull_request\.head\.sha/);
    // A PR-controlled ref must never choose what code runs.
    expect(yml).not.toMatch(/github\.event\.pull_request\.head\.ref/);
  });

  it("runs the default branch's definition, not the PR's copy of it", () => {
    // On `pull_request` the PR supplies this file, so it could rewrite the
    // request and use the write token to approve itself.
    expect(yml).toMatch(/^on:\n {2}pull_request_target:/m);
    expect(yml).not.toMatch(/^on:\n {2}pull_request:/m);
  });

  it("asks for statuses:write and nothing else", () => {
    const perms = yml.slice(yml.indexOf("permissions:"), yml.indexOf("jobs:"));
    expect(perms).toMatch(/statuses:\s*write/);
    expect(perms).not.toMatch(/contents:\s*write/);
    expect(perms).not.toMatch(/pull-requests:\s*write/);
  });

  it("writes the same pending description the sweep does", () => {
    // Load-bearing, and silent if it breaks. `publish` skips the write when
    // state and description both match what is already on the head, and that
    // skip is what holds the gate marker still. If these two strings drift,
    // every sweep rewrites the status, the marker advances each time, and no
    // reaction can ever be newer than it — the gate stalls on every open PR
    // at once, with nothing going red to say so.
    expect(yml).toContain(`"description":"${PENDING}"`);
  });

  it("says approve rather than review", () => {
    // A head Codex has reviewed and left findings on sits at pending too, so
    // "waiting to review" names the one thing that has already happened.
    expect(PENDING).toMatch(/approve/);
  });

  it("fails the step when the API call fails", () => {
    // Without this the job goes green while the gate was never reset.
    expect(yml).toMatch(/--fail-with-body/);
  });
});

describe("codex-verdict workflow", () => {
  const yml = readFileSync(".github/workflows/codex-verdict.yml", "utf8");

  it("has no branch-selectable trigger", () => {
    // `workflow_dispatch` takes a ref and GitHub runs the workflow file from
    // it, so a branch could supply its own steps and keep the write token.
    // Scoped to the trigger block: the comment above it names what it removed.
    const on = yml.slice(yml.indexOf("\non:"), yml.indexOf("permissions:"));
    expect(on).not.toMatch(/workflow_dispatch/);
    expect(on).toMatch(/schedule:/);
  });

  it("sweeps every five minutes", () => {
    // Not cosmetic: the interval is the bound on how long a hold can sit
    // unnoticed on a head that already has `codex: success`, and it is dead
    // time on every merge. Raising it is a real trade, so make it explicit.
    expect(yml).toMatch(/cron:\s*'\*\/5 \* \* \* \*'/);
  });

  it("still checks out the default branch", () => {
    expect(yml).toMatch(/ref:\s*\$\{\{\s*github\.event\.repository\.default_branch\s*\}\}/);
  });

  it("asks for no write scope beyond statuses", () => {
    const perms = yml.slice(yml.indexOf("permissions:"), yml.indexOf("concurrency:"));
    expect(perms).toMatch(/statuses:\s*write/);
    expect(perms).not.toMatch(/contents:\s*write/);
    expect(perms).not.toMatch(/actions:\s*write/);
  });
});
