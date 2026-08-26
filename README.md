# Customer Application & Workflow Management System

A workflow tool for managing customer applications as they move from intake to completion. Internal
users create applications against a customer, assign an owner, break the work into items, advance the
application through a controlled workflow, and — once completed — mirror selected data to an external
system.

Built with **Next.js 14 (App Router)** and **Node.js**, with Prisma + SQLite for persistence and
Tailwind CSS for styling.

---

## Table of Contents

1. [Setup Instructions](#setup-instructions)
2. [Architecture](#architecture)
3. [Data Model](#data-model)
4. [Application Design](#application-design)
5. [Authentication and Authorization](#authentication-and-authorization)
6. [Workflow Rules](#workflow-rules)
7. [External Integration](#external-integration)
8. [Search, Filtering and Pagination](#search-filtering-and-pagination)
9. [Edge Cases](#edge-cases)
10. [Assumptions and Trade-offs](#assumptions-and-trade-offs)
11. [What I Would Do Next](#what-i-would-do-next)
12. [Production Considerations](#production-considerations)
13. [AI and Tools Used](#ai-and-tools-used)

---

## Setup Instructions

### Prerequisites

- Node.js 18 or newer
- npm

No database server is needed. SQLite stores everything in a single file.

### 1. Clone the repository

```bash
git clone <repository-url>
cd customer-application-portal
```

### 2. Configure environment variables

```bash
cp .env.example .env
```

`.env` controls the database location and lets you tune the mock external system:

| Variable                   | Default            | Purpose                                                        |
| -------------------------- | ------------------ | -------------------------------------------------------------- |
| `DATABASE_URL`             | `file:./dev.db`    | SQLite file, resolved relative to `prisma/`                    |
| `MOCK_SYNC_FAILURE_RATE`   | `0.4`              | Chance the mock external system fails, so retries are visible  |
| `MOCK_SYNC_MAX_LATENCY_MS` | `600`              | Upper bound of simulated latency                               |
| `EXTERNAL_SYNC_TIMEOUT_MS` | `3000`             | How long we wait before declaring the external system unusable |

### 3. Install dependencies

```bash
npm install
```

### 4. Create and seed the database

```bash
npx prisma migrate dev    # creates dev.db and applies the schema
npx prisma db seed        # loads demo teams, users, customers and applications
```

### 5. Run the application

```bash
npm run dev
```

Open <http://localhost:3000>. You will be redirected to the sign-in page.

### Demo accounts

Sign-in is by email address only — no password (see [Assumptions](#assumptions-and-trade-offs)). The
login screen lists these accounts as one-click buttons.

| Name         | Email                | Role      | Team       |
| ------------ | -------------------- | --------- | ---------- |
| Alice Admin  | `admin@system.com`   | ADMIN     | Operations |
| Bob Manager  | `manager@system.com` | MANAGER   | Operations |
| Charlie Exec | `exec@system.com`    | EXECUTIVE | Operations |
| Dana Exec    | `dana@system.com`    | EXECUTIVE | Compliance |

Signing in as each of these is the quickest way to see the authorization rules take effect: the same
data set looks different to each of them.

### A five-minute tour

1. Sign in as **Alice Admin** — the dashboard lists all 12 seeded applications.
2. Sign in as **Charlie Exec** — the same dashboard now shows only his own work.
3. As **Bob Manager**, open an application, reassign it, and add a work item.
4. Move an application `In Progress → Under Review → Completed`. Watch the activity history grow and
   the external sync panel appear.
5. Find the seeded application whose sync has failed (**Healthcare Data Processing Agreement**) and
   press **Retry synchronisation**. Because the mock fails 40% of the time, you may need a few
   attempts — the attempt counter increases each time.

---

## Architecture

A single Next.js application serves both the UI and the API. For a system this size, splitting the
backend into a separate service would add deployment and network overhead without buying anything.

```
┌──────────────────────────────────────────────────────────────┐
│                    Next.js 14 (App Router)                    │
│                                                               │
│  Browser (React client components)                            │
│    /login  /dashboard  /customers  /applications  /admin      │
│                          │                                    │
│                          │  fetch(), same origin              │
│                          ▼                                    │
│  Route Handlers (Node.js runtime)  ── src/app/api/**          │
│    authenticate → authorize → validate → persist → log        │
│                          │                                    │
│                          ▼                                    │
│  Domain rules  ── src/lib/workflow.ts                         │
│    stages · transitions · permissions · visibility scoping    │
│                          │                                    │
│                          ▼                                    │
│  Prisma Client ──────────────────────────► SQLite (dev.db)    │
│                                                               │
│  Edge middleware ── src/middleware.ts                         │
│    blocks unauthenticated navigation before a page renders     │
└──────────────────────────────────────────────────────────────┘
                          │
                          ▼  HTTP + idempotency key
              /api/mock-external-sync  (stand-in for a third party)
```

### Modules

| Path                       | Responsibility                                                            |
| -------------------------- | ------------------------------------------------------------------------- |
| `src/middleware.ts`        | Redirects unauthenticated page requests; returns 401 JSON for API requests |
| `src/lib/workflow.ts`      | The single source of truth for workflow and permission rules              |
| `src/lib/auth.ts`          | Reads the session cookie and resolves it to a user                        |
| `src/lib/applications.ts`  | Shared query shape and the external-sync procedure                        |
| `src/lib/externalSync.ts`  | HTTP client for the external system; never throws                         |
| `src/lib/useSession.ts`    | Client hook that loads the current user and recovers from a dead session  |
| `src/app/api/**`           | REST endpoints                                                            |
| `src/app/components/ui.tsx`| Badges, pagination, loading and error states shared by all screens        |

The important structural decision is that **all business rules live in `src/lib/workflow.ts`**. Both
the API and the UI import the same functions, so a rule cannot drift between two endpoints, and the
buttons shown on screen always reflect the rules the server will actually enforce.

---

## Data Model

```
┌──────────┐ 1     N ┌──────────────┐
│   Team   ├─────────┤     User     │
└──────────┘         └──────┬───────┘
                            │ 1
              ┌─────────────┼──────────────┐
              │ N           │ N            │ N
    ┌─────────▼────┐  ┌─────▼──────┐ ┌─────▼────────┐
    │ Application  │  │  WorkItem  │ │ ActivityLog  │
    │  (assigned)  │  │ (assigned) │ │   (actor)    │
    └─────┬────────┘  └─────┬──────┘ └──────┬───────┘
          │ 1               │ N             │ N
          │                 └───────────────┘
          │                   both belong to an Application
          │ N
    ┌─────▼──────┐
    │  Customer  │
    └────────────┘
```

### Entities

**Team** — a group users belong to. Exists so a manager's authority can be scoped to a defined set of
people rather than the whole company.

**User** — an internal user with `name`, `email`, a `role` of `ADMIN | MANAGER | EXECUTIVE`, and an
optional team.

**Customer** — the external party: `name`, `email` (unique), `company`, optional `phone`. One customer
can have many applications.

**Application** — the core record. Carries what it is (`title`, `description`), where it is (`stage`),
how urgent it is (`priority`), who owns it (`assignedUserId`), and when it changed (`createdAt`,
`updatedAt`). Three fields exist for non-obvious reasons:

- `version` — an integer bumped on every write, used for optimistic locking.
- `idempotencyKey` — a stable UUID sent to the external system so retries are recognised as duplicates.
- `syncStatus` / `syncAttempts` / `lastSyncError` / `lastSyncedAt` — synchronisation tracked *beside*
  the application rather than inside its lifecycle, so a failing third party cannot block completion.

**WorkItem** — a unit of work on an application: `title`, `status` of `PENDING | IN_PROGRESS | COMPLETED`,
optional assignee, and `completedAt`.

**ActivityLog** — append-only audit record: `action`, human-readable `details`, the acting `userId`
(nullable so system events can be recorded), and `createdAt`. Nothing updates or deletes these rows.

Indexes are declared on the columns used for filtering and joining (`stage`, `priority`,
`assignedUserId`, `customerId`, `teamId`).

### A note on `status` versus `isCompleted`

Work items originally used a boolean. I replaced it with a three-value `status` because the
requirements ask separately for "track progress", "update work item status" and "mark work as
completed" — a boolean cannot express "started but not finished", which is exactly the state a
progress indicator needs.

---

## Application Design

### How the frontend and backend communicate

Screens are client components that call the API with `fetch` over the same origin. Responses are JSON.
There is no GraphQL layer or client-side data-fetching library: at this scale the extra indirection
would cost more than it saves.

Requests are shaped so a single screen needs a single round trip. `GET /api/applications/[id]` returns
the application together with its customer, assignee, work items and full activity history.

### State management

Local React state (`useState` / `useEffect`) with a **re-fetch after every mutation**. Deliberately no
Redux/Zustand: the only shared state is "who am I", which the `useSession` hook handles.

The trade-off is honest: after a mutation we pay a round trip instead of patching a client-side cache.
For a low-traffic internal tool that is a good trade, because it removes any chance of the screen
disagreeing with the database. React Query would be the natural upgrade if the app grew.

### Where business rules live

Every rule is enforced **server-side**, in the route handler, using the session — never using values
supplied by the client. An earlier iteration of this project accepted `currentUserRole` from the
request body; that is trivially forgeable, so it now reads the role from the session user and ignores
the body entirely.

The UI hides controls a user is not allowed to use, but that is purely so the interface is not
misleading. Hiding a button is not a security measure, and the API rejects the action regardless.

The request pipeline for a mutation is always the same:

```
authenticate (session cookie)
  → authorize   (may this user touch this record?)
  → validate    (is the payload well-formed? is the transition legal?)
  → concurrency (does the caller's version still match?)
  → persist     (inside a transaction)
  → audit       (append activity log rows in the same transaction)
```

---

## Authentication and Authorization

### Authentication

Sign-in posts an email address to `POST /api/auth`. If a user with that email exists, the server sets
an **HTTP-only** cookie (`cap_session`) containing the user id, with `SameSite=Lax`, an 8-hour expiry,
and the `Secure` flag in production. `POST /api/auth/logout` clears it.

There is no password. This is a deliberate scope decision for a demo, called out in
[Assumptions](#assumptions-and-trade-offs).

Because the cookie is HTTP-only, client code cannot read it; the browser learns who it is by calling
`GET /api/auth/me`.

### Two layers of protection

1. **Middleware** (Edge runtime) runs before a page renders. Prisma is not available on the Edge, so
   middleware can only check that a cookie is *present* — it cannot confirm the cookie is valid.
2. **Route handlers** call `getCurrentUser()`, which resolves the cookie against the database. This is
   where validity is actually established, and where every authorization decision is made.

That split matters, and it caused a real bug worth documenting. Originally the middleware also
redirected `/login → /dashboard` whenever a cookie existed. If the database was re-seeded, a browser
could hold a cookie pointing at a user id that no longer existed, which produced a deadlock: every
page treated the visitor as signed in, every API call returned 401, the navbar (and therefore the sign
out button) never rendered, and `/login` bounced straight back to the dashboard. The user could not
sign in or out.

The fix has two parts:

- `/login` is always reachable. The middleware no longer redirects away from it.
- The login page verifies the session via `/api/auth/me` on mount. A valid session forwards to the
  dashboard; an invalid one is cleared before the form is shown, so a stale cookie self-heals.

The same principle is applied throughout: `useSession` redirects to `/login` on a 401 rather than
leaving a page silently failing every request.

### Roles

Three roles, matching the brief:

- **Administrator** — runs the system. Full visibility and the only role that can manage users or
  reopen finished work.
- **Manager** — oversees a team. Sees their team's workload plus anything unassigned, so they can
  triage and hand work out.
- **Executive** — does the work. Sees only what is assigned to them.

### Permission matrix

| Action                             | ADMIN | MANAGER          | EXECUTIVE          |
| ---------------------------------- | :---: | :--------------: | :----------------: |
| View applications                  | all   | own team + unassigned | assigned to them |
| Create application                 |  yes  | yes              | yes (unassigned)   |
| Edit title / description           |  yes  | yes              | yes (own)          |
| Edit priority                      |  yes  | yes              | no                 |
| Assign / reassign                  |  yes  | own team only    | no                 |
| Advance stage (working stages)      |  yes  | yes              | own only           |
| Complete an application            |  yes  | yes              | **no**             |
| Reopen a completed application     |  yes  | no               | no                 |
| Manage work items                  |  yes  | yes              | yes (own)          |
| View customers                     |  yes  | yes              | yes                |
| Manage users                       |  yes  | no               | no                 |

Two decisions in that table deserve their reasoning:

**Executives can advance their own work but cannot complete it.** Separation of duties: the person who
did the work should not be the person who signs it off. An executive can push an application as far as
`Under Review` and no further, which is what makes `Under Review` a meaningful stage rather than a
label.

**Managers see unassigned applications.** Someone has to notice new work and hand it out. Restricting a
manager strictly to their team's existing assignments would leave unassigned applications invisible to
everyone except an administrator.

### How visibility is enforced

`applicationVisibilityFilter()` returns a Prisma `where` fragment for the actor, and it is combined with
the user's filters using `AND` on **every** list query:

```ts
const where = { AND: [visibilityFilter, ...userFilters] }
```

Narrowing is therefore not something a client can opt out of by omitting a parameter. Single-record
reads go through `canViewApplication()`, which returns 403 rather than 404 when access is denied.

---

## Workflow Rules

```
      ┌──────────────────────────────────────────┐
      │                                          │
      ▼                                          │
┌──────────┐      ┌──────────────────────┐       │
│   NEW    │─────▶│ WAITING_FOR_INFO     │◀──────┤
└────┬─────┘      └──────────┬───────────┘       │
     │                       │                   │
     │     ┌─────────────────▼─────┐             │
     └────▶│     IN_PROGRESS       │◀────────────┼───┐
           └───────────┬───────────┘             │   │
                       │                         │   │
              ┌────────▼──────────┐              │   │
              │   UNDER_REVIEW    │──────────────┘   │
              └────────┬──────────┘  (send back)     │
                       │                             │
       manager/admin   │                             │
              ┌────────▼──────────┐                  │
              │    COMPLETED      │──────────────────┘
              └───────────────────┘   admin reopen only
```

- **States**: `NEW`, `WAITING_FOR_INFO`, `IN_PROGRESS`, `UNDER_REVIEW`, `COMPLETED`.
- **Legal moves** are declared in one map, `ALLOWED_TRANSITIONS`. Anything absent is rejected, so a
  request to jump `NEW → COMPLETED` fails with an explanation naming the moves that *are* allowed.
- **Backward moves are intentional.** `Under Review → In Progress` is how a reviewer sends work back,
  and `In Progress → Waiting for Information` is how an executive parks an application pending a
  customer response. A strictly forward-only pipeline would not survive contact with real operations.
- **`COMPLETED` is terminal.** It is not listed as having any onward transition. Reopening is handled as
  an explicit administrative override that returns the application to `In Progress` and logs a distinct
  `REOPENED` event, so a reopen can never be mistaken for a normal step.
- **Enforcement** happens in `validateStageTransition()`, called by the API before any write. The UI
  calls `availableTransitions()` to decide which buttons to render, so users are not offered moves that
  would be refused.

---

## External Integration

### When synchronisation happens

When an application transitions into `COMPLETED`. The attempt is made **after** the database transaction
that records the completion has committed — that ordering is the whole point, and is what guarantees a
failing external system cannot roll back or block the completion.

`POST /api/applications/[id]/retry-sync` provides a manual recovery path afterwards.

### How failures are handled

`syncCompletedApplication()` never throws. Every outcome — HTTP error, network error, timeout — comes
back as a value, and the caller records it on the application:

| Field           | Meaning                                             |
| --------------- | --------------------------------------------------- |
| `syncStatus`    | `NOT_REQUIRED` → `PENDING` → `SUCCESS` \| `FAILED`  |
| `syncAttempts`  | Incremented on every attempt, including retries     |
| `lastSyncError` | Why the most recent attempt failed                  |
| `lastSyncedAt`  | When it last succeeded                              |

Each attempt also appends a `SYNC_SUCCEEDED` or `SYNC_FAILED` activity entry, so the history explains
what happened without anyone reading logs.

A failure surfaces in the UI as a panel on the application, with the error text and a retry button. The
copy states plainly that the application is complete regardless.

The four failure modes named in the brief are all covered:

| Failure mode      | How it is handled                                                             |
| ----------------- | ----------------------------------------------------------------------------- |
| Unavailable/error | Non-2xx recorded as `FAILED` with the status code; completion unaffected       |
| Responds slowly   | `AbortController` timeout (`EXTERNAL_SYNC_TIMEOUT_MS`) bounds the wait         |
| Duplicate request | Idempotency key; the external system replies `ALREADY_PROCESSED`              |
| Fails after completion | Retry endpoint plus persisted failure state allow recovery at any time    |

### How duplicates are prevented

Every application carries a unique `idempotencyKey` (a UUID, generated once at creation). It is sent as
the `x-idempotency-key` header on every attempt, **including retries** — the key is deliberately not
regenerated. The external system records keys it has accepted and answers repeats with
`ALREADY_PROCESSED`, which this application treats as success.

Two further guards sit in front of the retry endpoint: it refuses a retry when the application is not
`COMPLETED` (400) and when synchronisation has already succeeded (409). The UI also disables the retry
button while a request is in flight, so an impatient double-click cannot produce two calls.

### The mock external system

`/api/mock-external-sync` stands in for the third party and reproduces the awkward behaviour on
purpose: a configurable failure rate (40% by default), randomised latency, and idempotency-key
tracking. `GET` on the same path returns its current state, which is handy when demonstrating.

Its store is an in-memory `Map`. That is fine for a mock and is exactly why the production notes below
call for durable storage — in development, a hot reload is enough to clear it.

### How I would evolve this for production

The current design is synchronous-with-retry, which suits the scope: no broker to run, and the
behaviour is easy to demonstrate. The honest limitation is that recovery depends on somebody pressing a
button.

For production I would:

1. **Move synchronisation onto a queue** (SQS, BullMQ) so completing an application only enqueues a job.
   The user's request would no longer wait on a third party at all.
2. **Retry automatically with exponential backoff and jitter**, with a bounded attempt count, instead of
   relying on a manual press.
3. **Add a dead-letter queue** plus an alert, so a permanently failing sync is escalated rather than
   sitting unnoticed on a record.
4. **Persist idempotency keys in the database** with a uniqueness constraint, rather than in memory.
5. **Use the transactional outbox pattern** — write the intent to an `outbox` table inside the same
   transaction that completes the application, and let a worker drain it. This closes the remaining gap
   where a crash between commit and enqueue could lose the sync.
6. **Add a reconciliation job** that periodically compares completed applications against the external
   system and repairs drift.
7. **Record metrics** (success rate, latency, queue depth) and alert on sustained failure.

---

## Search, Filtering and Pagination

**Searchable**: application title and description, plus the customer's name, company and email — so
searching "acme" finds a customer's applications even when the word is not in the title. Customers are
searchable by name, email and company.

**Filters**: stage, priority, and "assigned to me". They compose, so `Critical` + `In Progress` +
`Assigned to me` is a valid query, and they combine with the caller's visibility scope.

**Larger result sets** are paginated server-side with `skip`/`take`. Responses carry the metadata the UI
needs:

```json
{ "data": [...], "total": 12, "page": 1, "pageSize": 10, "totalPages": 2 }
```

`pageSize` is clamped to 50 so a client cannot request the entire table. Search input is debounced by
300 ms, and changing any filter resets to page 1 — otherwise a user filtering while on page 3 would land
on an empty screen.

Offset pagination is the right choice at this size. For very large tables I would move to cursor-based
pagination, since `OFFSET` degrades as the offset grows.

---

## Edge Cases

### Concurrent updates

Two users open the same application; both edit; the second save must not silently discard the first.

Handled with **optimistic locking**. Each application has a `version`. A client sends the version it
read, and the write is applied conditionally:

```ts
await tx.application.updateMany({
  where: { id, version: expectedVersion },   // only if nobody else has written
  data: updates,
})
// zero rows matched -> somebody else got there first
```

Zero affected rows means a conflict, which becomes **409** with a message telling the user to reload and
reapply. The detail screen reloads automatically so the winning values are visible immediately. The
update and its activity log rows are written in one transaction, so history can never disagree with
state.

I chose optimistic over pessimistic locking because conflicts here are rare and record locks in a
web UI tend to be abandoned by users who close a tab.

### Unauthorized actions

Enforced server-side on every route, using the session rather than the request body. Denied access
returns 403 with a reason. List endpoints narrow results rather than relying on the UI to hide them, so
an executive cannot reach another team's application by guessing a URL.

### Invalid workflow changes

Rejected by `validateStageTransition()` with 403 and a message naming the legal moves. The UI only
renders buttons for transitions that would actually be accepted, so this is a backstop for direct API
calls rather than the normal path.

### External system failures after completion

The application stays completed. Failure state is persisted, shown on screen, and retryable
indefinitely. Verified by pointing the client at a deliberately slow mock: the completion returned
successfully while `syncStatus` recorded `FAILED` with a timeout reason.

### Duplicate synchronisation

Prevented by the reused idempotency key, plus a 409 guard on retrying an already-successful sync and a
disabled button during flight.

### Smaller ones handled

- Deleting a customer cascades to their applications, work items and activity (`onDelete: Cascade`).
- Duplicate customer/user emails are rejected with 409 rather than a raw constraint error.
- Empty titles and descriptions are rejected after trimming.
- Work items cannot be added to a completed application.
- A stale session cookie self-heals instead of locking the user out.

---

## Assumptions and Trade-offs

### Assumptions

1. **Email-only sign-in is acceptable for a demo.** The brief left the mechanism open and asked for
   documented decisions; spending the budget on workflow correctness and authorization was the better
   use of it. The session mechanism itself is real (HTTP-only cookie, server-side validation), so
   adding password verification means adding a hash check in one place.
2. **A user belongs to at most one team.** Enough to express a manager's scope. Multi-team membership
   would need a join table.
3. **Managers see unassigned work.** Otherwise nobody but an administrator could triage intake.
4. **Executives cannot approve their own work.** Separation of duties, as described above.
5. **Only administrators reopen completed applications.** Reopening is an exception, and treating it as
   one keeps `COMPLETED` meaningful.
6. **Only completed applications synchronise.** That is what the brief specifies; other stages are
   internal.
7. **Customers are shared reference data.** Every role can read and create them; the access-controlled
   material is the applications attached to them.

### Trade-offs

| Decision                        | Why                                                       | What it costs                                                    |
| ------------------------------- | --------------------------------------------------------- | ---------------------------------------------------------------- |
| SQLite                          | Zero setup; reviewers run two commands                    | Single-writer; not suitable for multi-instance deployment        |
| Next.js API routes, no separate backend | One codebase, one deploy, shared types             | Backend is coupled to the Next.js host                           |
| Email-only auth                 | Keeps focus on workflow and authorization                 | Not production-safe on its own                                   |
| Local state + refetch           | Impossible for the screen to disagree with the database    | An extra round trip per mutation; no cross-tab live updates      |
| Optimistic locking              | No lock management; conflicts are rare here               | The losing user must reapply their edit                          |
| Synchronous sync + manual retry | No broker to operate; easy to demonstrate                 | Recovery needs a human; no automatic backoff                     |
| In-memory idempotency store (mock) | Adequate for a stand-in service                        | Cleared on restart — must be durable in production               |
| Offset pagination               | Simple, and correct at this scale                         | Degrades on very large offsets                                   |

---

## What I Would Do Next

Core requirements are complete. With more time, in priority order:

1. **Automated tests.** The highest-value gap. The rules in `src/lib/workflow.ts` are pure functions and
   would unit-test cleanly; I would then add integration tests over the route handlers for the
   authorization matrix, the 409 path and the sync failure path, and a Playwright run for
   `create → assign → complete → retry`. I verified these flows by driving the running API directly
   during development rather than leaving them unchecked, but scripted verification is not a substitute
   for a committed suite.
2. **Editing and deactivating users.** The admin screen creates users and lists them; changing a role or
   disabling an account still requires a database edit. Deactivation should be a soft `isActive` flag,
   because deleting a user would orphan their audit history.
3. **Queue-backed synchronisation** with automatic backoff, as described above.
4. **Live updates** via Server-Sent Events, so a manager watching a queue sees changes without
   refreshing. This would also reduce 409s by showing conflicts sooner.
5. **Notifications** when work is assigned or an application is sent back for rework.
6. **Saved views and CSV export**, the two things operations teams ask for almost immediately.

---

## Production Considerations

**Data.** Move to PostgreSQL with connection pooling; SQLite's single-writer model will not survive
concurrent traffic. Add automated backups and test the restore.

**Authentication.** Add password verification (argon2/bcrypt) or delegate to an identity provider via
OAuth/OIDC. Add rotation and idle timeouts, and consider server-side session records so sessions can be
revoked.

**Authorization.** The rules are already centralised and server-enforced. I would add an automated test
asserting the whole permission matrix, so a future change cannot quietly widen access.

**Validation.** Introduce Zod schemas at the API boundary to replace hand-written field checks and to
derive request types.

**Reliability.** Outbox pattern plus queue for synchronisation; dead-letter queue with alerting;
reconciliation job.

**Security.** Rate limiting on authentication and mutations; CSRF protection once cookies authenticate
state-changing requests from forms; security headers (CSP, HSTS, `X-Frame-Options`); ensure error
responses never leak internals.

**Operations.** Structured logging with request correlation ids; error tracking (Sentry); metrics and
dashboards for sync success rate and workflow throughput; a `/health` endpoint.

**Delivery.** Dockerfile and CI running lint, typecheck, tests and migrations; run
`prisma migrate deploy` (not `migrate dev`) on release.

**Accessibility and UX.** The UI uses semantic tables, labelled inputs, `aria-pressed` on filter
toggles and `role="alert"` on errors. Before shipping I would run an audit with a screen reader and
verify focus management and contrast, which static review cannot confirm.

---

## AI and Tools Used

**Kiro (AI coding assistant)** — used throughout: planning the structure, generating and refactoring
route handlers and React screens, drafting this README, and diagnosing the stale-session lockout
described in [Authentication](#authentication-and-authorization). Every rule it produced was checked by
running the API and confirming the responses; the authorization matrix, the invalid-transition
rejections, the 409 conflict path and the sync timeout behaviour were all exercised against a live
server rather than assumed.

**Other tools**

- **Next.js 14 (App Router)** — UI and API in one project
- **Prisma 5** — schema, migrations, type-safe queries
- **SQLite** — zero-configuration database
- **Tailwind CSS 3** — utility-first styling
- **TypeScript** — `strict` mode; `tsc --noEmit` and `next build` both run clean

---

## Project Structure

```
customer-application-portal/
├── .env.example                     # environment template
├── prisma/
│   ├── schema.prisma                # data model
│   ├── migrations/                  # committed migration history
│   └── seed.ts                      # demo data
├── src/
│   ├── middleware.ts                # route protection
│   ├── lib/
│   │   ├── workflow.ts              # stages, transitions, permissions, visibility
│   │   ├── auth.ts                  # session cookie handling
│   │   ├── applications.ts          # shared query shape + sync procedure
│   │   ├── externalSync.ts          # external system client (never throws)
│   │   ├── useSession.ts            # client session hook
│   │   └── prisma.ts                # Prisma singleton
│   └── app/
│       ├── layout.tsx               # shell + navigation
│       ├── login/                   # sign-in (self-healing session check)
│       ├── dashboard/               # application list, search, filters, pagination
│       ├── applications/
│       │   ├── new/                 # create form
│       │   └── [id]/                # detail: workflow, work items, history, sync
│       ├── customers/               # list + detail with related applications
│       ├── admin/users/             # administrator user management
│       ├── components/              # Navbar, shared UI primitives
│       └── api/
│           ├── auth/                # login, logout, me
│           ├── applications/        # list, create, detail, work-items, retry-sync
│           ├── customers/           # list, create, detail
│           ├── users/  teams/       # directory and provisioning
│           ├── work-items/[id]/     # update, delete
│           └── mock-external-sync/  # stand-in third party
└── README.md
```
