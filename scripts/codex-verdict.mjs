// Publishes Codex's review verdict as a commit status, so branch protection
// can gate on something it can actually see.
//
// Codex posts no check run of its own, and its clean pass is only a 👍
// reaction on the PR body — which emits no webhook. So the verdict is both
// invisible to protection rules and undeliverable by event: it has to be
// polled and translated. Without that, auto-merge fires on green CI *before*
// Codex has looked, and a merged-too-early PR is indistinguishable from a
// correctly merged one.
//
// The reaction is the whole verdict, and that is why this file is small.
// Codex's own description of itself: "If Codex has suggestions, it will
// comment; otherwise it will react with 👍." The reaction is therefore present
// only when it has nothing to say — findings in a review body, in a thread, or
// in a top-level comment all mean no reaction, and none of them needs separate
// detection here. Codex also revokes the reaction when a new commit lands, so
// a reaction that is present belongs to the head being looked at, and nothing
// here has to compare SHAs to establish that.
//
// An earlier version parsed review bodies for finding badges, timestamped them
// against the head, and ranked findings against passes. All of it re-derived
// what the reaction already says, and two of its bugs pointed the same way:
// approving without a verdict.
//
// Human review threads are deliberately not modelled: GitHub's "require
// conversation resolution" setting does that natively, and better.
//
// Reactions run the other way too. Approval is Codex's 👍 *and* no 👀 and no
// 👎 from the repository owner — so a hold costs two seconds from a phone,
// which is the point: without it auto-merge can land a PR before someone who
// wanted a look gets one, and there is no other signal that cheap.
//
// Only the owner, because this repo is public: anyone can react, and a hold
// deliberately outlives head changes, so an unrestricted one lets a passer-by
// block a PR for as long as they feel like it. Codex's own 👀 counts too —
// it means "still reading", it clears when it reacts 👍, and it is not a
// passer-by.
//
// A hold takes effect within a sweep, NOT immediately, and the difference is
// the whole point of saying so. Reactions emit no webhook, so nothing can
// notice one as it lands; if `success` is already published and another
// required check goes green before the next sweep, auto-merge takes the PR
// with the hold sitting there unread. The interval bounds that and cannot
// close it. **To stop a merge right now, convert the PR to a draft** — GitHub
// disables auto-merge on drafts the moment you do it, and `verdictFor` returns
// null for a draft so nothing here fights you. The reaction is for "don't
// merge this yet", which is the ordinary case; the draft is for "stop".

export const CODEX_BOT = "chatgpt-codex-connector";
export const CONTEXT = "codex";

const stripBot = (login) => String(login ?? "").replace(/\[bot\]$/, "");
export const matchesBot = (login, botLogin = CODEX_BOT) =>
  stripBot(login) === stripBot(botLogin);

/**
 * Decide the commit status for one pull request.
 * Returns null for a draft — nothing to gate until it is ready for review.
 */
export function verdictFor({ isDraft, approved, sharedHead, held }) {
  if (isDraft) return null;

  // A status belongs to the commit; the reaction belongs to the PR. Two open
  // PRs on one head cannot both be described by one status, so approve
  // neither — blocking asks a human to look, where the alternative is a merge
  // justified by another PR's review.
  if (sharedHead) {
    return {
      state: "failure",
      description: "Head shared with another open PR — verdict is ambiguous",
    };
  }

  // Someone asked for a look. Blocking rather than pending, so it reads as a
  // deliberate hold rather than something still on its way.
  if (held) {
    return { state: "failure", description: `On hold: ${held} on the pull request` };
  }

  return approved
    ? { state: "success", description: "Codex reviewed this head, no findings" }
    : { state: "pending", description: "Waiting for Codex to review this head" };
}

const PAGE = `pageInfo { hasNextPage endCursor }`;

const OPEN_PRS = `
query($owner:String!, $name:String!, $after:String) {
  repository(owner:$owner, name:$name) {
    pullRequests(states:OPEN, first:50, after:$after) {
      ${PAGE}
      nodes {
        number
        isDraft
        headRefOid
        reactions(first:100) { ${PAGE} nodes { content createdAt user { login } } }
      }
    }
  }
}`;

const MORE_REACTIONS = `
query($owner:String!, $name:String!, $number:Int!, $after:String!) {
  repository(owner:$owner, name:$name) {
    pullRequest(number:$number) {
      reactions(first:100, after:$after) { ${PAGE} nodes { content createdAt user { login } } }
    }
  }
}`;

/** Thin GitHub client, so the sweep can be driven by a fake `fetch` in tests. */
export function createApi({ token, fetchImpl = fetch }) {
  async function rest(path, { method = "GET", body } = {}) {
    const res = await fetchImpl(`https://api.github.com${path}`, {
      method,
      headers: {
        authorization: `Bearer ${token}`,
        accept: "application/vnd.github+json",
        "content-type": "application/json",
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    // Name the failed call and its status; never the token or the raw body.
    if (!res.ok) throw new Error(`${method} ${path} failed: ${res.status}`);
    return res.status === 204 ? null : res.json();
  }

  async function graphql(query, variables) {
    const out = await rest("/graphql", { method: "POST", body: { query, variables } });
    if (out.errors?.length) throw new Error(`graphql: ${out.errors[0].message}`);
    return out.data;
  }

  return { rest, graphql };
}

/**
 * What the PR-body reactions say: Codex's verdict, and any hold on it.
 *
 * `since` is when this head was first gated — the timestamp of the earliest
 * `codex` status on it, written by the reset workflow on the push or by this
 * sweep's own first look. Codex revokes its 👍 when a new commit lands, but
 * *asynchronously* — it has to notice the push first — so for a few seconds
 * or minutes the PR carries a new head and the previous head's reaction, and
 * reading those together approves a commit nobody reviewed.
 *
 * The marker is GitHub's own record of when this SHA became something we
 * gated, which is why it is used instead of the commit's `committedDate`: a
 * commit date is set by whoever makes the commit (`--date`, or a prebuilt
 * commit) and so cannot be evidence about anything. No marker means the head
 * has not been gated yet, and the answer to that is `pending` — this sweep
 * writes the marker, and a later one can approve against it.
 *
 * Holds come only from the repository owner, plus Codex's own 👀. On a public
 * repo any account can react, and a hold deliberately survives head changes,
 * so an unrestricted hold lets a passer-by block a PR indefinitely. Codex's
 * 👀 is included because it means "still reading" — it clears that when it
 * reacts 👍 — and it is not a passer-by.
 *
 * Holds are deliberately NOT filtered by time: a 👎 left on an earlier head is
 * still someone saying don't merge this, and a new commit is not an answer to
 * it. That errs toward blocking, which is the safe direction here.
 */
export function readReactions(nodes, { since, owner } = {}) {
  let approved = false;
  let held = null;
  for (const r of nodes ?? []) {
    const login = r.user?.login;
    const codex = matchesBot(login);
    // A missing marker or reaction time both mean "cannot show this reaction
    // is about this head", and the answer to that is `pending` rather than a
    // merge — an unexpected result must not be what opens the gate.
    const fresh = Boolean(since) && (r.createdAt ?? "") > since;
    // The 👍 must be Codex's: it is only a verdict because Codex revokes it
    // on push, and nobody else's does that.
    if (r.content === "THUMBS_UP" && fresh && codex) approved = true;
    const mayHold = Boolean(owner) && login === owner;
    if (r.content === "THUMBS_DOWN" && mayHold) held = "👎";
    if (r.content === "EYES" && (mayHold || codex) && held === null) held = "👀";
  }
  return { approved, held };
}

/**
 * Read every page of PR-body reactions.
 *
 * No short-circuit on finding the thumbs-up: a hold can be on a later page,
 * and stopping early would approve over it. Missing the thumbs-up entirely
 * leaves the status `pending` — safe, but it never clears on its own, and
 * every later sweep refetches the same truncated page.
 */
export async function reactionState(api, base, { owner, name, number, since }) {
  let page = base;
  let approved = false;
  let held = null;
  for (;;) {
    const seen = readReactions(page.nodes, { since, owner });
    approved = approved || seen.approved;
    held = held ?? seen.held;
    if (!page.pageInfo.hasNextPage) return { approved, held };
    const data = await api.graphql(MORE_REACTIONS, {
      owner, name, number, after: page.pageInfo.endCursor,
    });
    page = data.repository.pullRequest.reactions;
  }
}

/** Head SHAs carried by more than one open PR. */
export function sharedHeads(prs) {
  const seen = new Map();
  for (const pr of prs) seen.set(pr.headRefOid, (seen.get(pr.headRefOid) ?? 0) + 1);
  return new Set([...seen].filter(([, n]) => n > 1).map(([oid]) => oid));
}

/**
 * Every `codex` status on a head, newest first, as GitHub returns them.
 *
 * The newest is what this sweep compares against so it does not rewrite an
 * identical status; the oldest is the marker saying when this head was first
 * gated.
 *
 * Paged to the end, because the endpoint returns *every* context — Vercel's
 * among them — so a page can be full of statuses that are not ours while the
 * marker sits behind it. Missing the marker is not a harmless truncation: the
 * sweep would write a new one, and an existing 👍 older than that replacement
 * would be rejected by every later sweep. The cap is a backstop against an
 * endless loop, not an expected limit.
 */
export async function codexStatuses(api, { owner, name, sha }) {
  const found = [];
  for (let page = 1; page <= 10; page += 1) {
    const batch = await api.rest(`/repos/${owner}/${name}/statuses/${sha}?per_page=100&page=${page}`);
    found.push(...(batch ?? []).filter((s) => s.context === CONTEXT));
    if (!batch || batch.length < 100) break;
  }
  return found;
}

/** Write the status unless an identical one is already on the head. */
export async function publish(api, { owner, name, pr, verdict, current, log }) {
  // Every write shows up in the PR's check list, and a five-minute cadence
  // would otherwise bury it. It also keeps the marker still: rewriting the
  // same status would move the head's earliest-gated timestamp forward.
  if (current?.state === verdict.state && current?.description === verdict.description) {
    log(`#${pr.number}: ${verdict.state} (unchanged)`);
    return false;
  }
  await api.rest(`/repos/${owner}/${name}/statuses/${pr.headRefOid}`, {
    method: "POST",
    body: { context: CONTEXT, state: verdict.state, description: verdict.description },
  });
  log(`#${pr.number}: ${verdict.state} — ${verdict.description}`);
  return true;
}

export async function sweep({ owner, name, token, fetchImpl = fetch, log = console.log }) {
  const api = createApi({ token, fetchImpl });
  const written = [];
  const open = [];
  let after = null;

  // Collect every open PR before judging any: whether a head is shared is a
  // fact about the set, not about one PR.
  for (;;) {
    const data = await api.graphql(OPEN_PRS, { owner, name, after });
    const { nodes, pageInfo } = data.repository.pullRequests;
    open.push(...nodes);
    if (!pageInfo.hasNextPage) break;
    after = pageInfo.endCursor;
  }

  const shared = sharedHeads(open);

  for (const node of open) {
    if (node.isDraft) {
      log(`#${node.number}: draft, skipped`);
      continue;
    }
    const sharedHead = shared.has(node.headRefOid);
    // Read the head's own gate history first: its earliest entry is what a
    // reaction has to be newer than, so this has to happen before the
    // reactions are judged rather than at write time.
    const mine = await codexStatuses(api, { owner, name, sha: node.headRefOid });
    const since = mine.at(-1)?.created_at;
    // Don't read reactions when the shared head has already decided.
    const { approved, held } = sharedHead
      ? { approved: false, held: null }
      : await reactionState(api, node.reactions, {
        owner, name, number: node.number, since,
      });
    const verdict = verdictFor({ isDraft: false, approved, sharedHead, held });

    if (await publish(api, { owner, name, pr: node, verdict, current: mine[0], log })) {
      written.push({ number: node.number, ...verdict });
    }
  }

  return written;
}

async function main() {
  const token = process.env.GITHUB_TOKEN;
  const slug = process.env.GITHUB_REPOSITORY;
  if (!token || !slug) throw new Error("GITHUB_TOKEN and GITHUB_REPOSITORY are required");
  const [owner, name] = slug.split("/");
  await sweep({ owner, name, token });
}

// Only run the sweep when invoked as a script, so the tests can import the
// pieces without making a single network call.
if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    console.error(err.message);
    process.exit(1);
  });
}
