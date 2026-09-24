import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import {
  platformMyWorkSeverityLabel,
  platformMyWorkSourceLabel,
  sortPlatformMyWorkItems,
  type PlatformMyWorkItem,
} from "../src/lib/platform-my-work.ts";
import { readPlatformMyWork } from "../src/lib/platform-my-work-server.ts";

type Row = Record<string, unknown>;
type TableName = "platform_operators" | "platform_follow_up_tasks" | "support_cases" | "platform_attention_occurrences" | "organizations";
type QueryError = { message: string };
type QueryResult = { data: Row[] | null; error: QueryError | null; count?: number | null };
type QueryFilter = { column: string; kind: "eq" | "in"; value: unknown };
type QueryCall = { table: string; filters: QueryFilter[]; limit: number | null };
type FakeQuery = {
  select: (columns: string, options?: unknown) => FakeQuery;
  eq: (column: string, value: unknown) => FakeQuery;
  in: (column: string, values: readonly unknown[]) => FakeQuery;
  order: (...args: unknown[]) => FakeQuery;
  limit: (value: number) => FakeQuery;
  maybeSingle: () => Promise<{ data: Row | null; error: QueryError | null }>;
  then: <TResult1 = QueryResult, TResult2 = never>(
    onfulfilled?: ((value: QueryResult) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ) => Promise<TResult1 | TResult2>;
};

const ROLE_FIXTURES = {
  support: { email: "support@example.com", operatorId: "operator-support", canViewSupport: true },
  billing: { email: "billing@example.com", operatorId: "operator-billing", canViewSupport: false },
  read_only: { email: "readonly@example.com", operatorId: "operator-read-only", canViewSupport: true },
} as const;

function createMyWorkAdmin({
  rows,
  errors = {},
}: {
  rows: Partial<Record<TableName, Row[]>>;
  errors?: Partial<Record<TableName, QueryError>>;
}) {
  const calls: QueryCall[] = [];
  const execute = (table: string, filters: QueryFilter[], limit: number | null): QueryResult => {
    const error = errors[table as TableName];
    if (error) return { data: null, error };
    const tableRows = rows[table as TableName] ?? [];
    const filtered = tableRows.filter((row) => filters.every((filter) => {
      if (filter.kind === "eq") return row[filter.column] === filter.value;
      return Array.isArray(filter.value) && filter.value.includes(row[filter.column]);
    }));
    return { data: limit === null ? filtered : filtered.slice(0, limit), error: null, count: filtered.length };
  };

  const admin = {
    from(table: string) {
      const filters: QueryFilter[] = [];
      let limit: number | null = null;
      const call: QueryCall = { table, filters, limit };
      calls.push(call);
      const query: FakeQuery = {
        select() {
          return query;
        },
        eq(column, value) {
          filters.push({ column, kind: "eq", value });
          return query;
        },
        in(column, values) {
          filters.push({ column, kind: "in", value: [...values] });
          return query;
        },
        order() {
          return query;
        },
        limit(value) {
          limit = value;
          call.limit = value;
          return query;
        },
        async maybeSingle() {
          const result = execute(table, filters, limit);
          return { data: result.data?.[0] ?? null, error: result.error };
        },
        then(onfulfilled, onrejected) {
          return Promise.resolve(execute(table, filters, limit)).then(onfulfilled, onrejected);
        },
      };
      return query;
    },
  };

  return {
    admin: admin as unknown as Parameters<typeof readPlatformMyWork>[0],
    calls,
  };
}

function sharedMyWorkRows(): Partial<Record<TableName, Row[]>> {
  return {
    platform_operators: [
      { id: ROLE_FIXTURES.support.operatorId, email: ROLE_FIXTURES.support.email, is_active: true },
      { id: ROLE_FIXTURES.billing.operatorId, email: ROLE_FIXTURES.billing.email, is_active: true },
      { id: ROLE_FIXTURES.read_only.operatorId, email: ROLE_FIXTURES.read_only.email, is_active: true },
      { id: "operator-other", email: "other@example.com", is_active: true },
    ],
    platform_follow_up_tasks: [
      { id: "follow-up-support", assignee_id: ROLE_FIXTURES.support.operatorId, org_id: "org-support", title: "Support follow-up", reason: "Support handoff", status: "open", next_step: "Call the owner", updated_at: "2026-09-23T00:01:00.000Z", due_at: "2026-09-24T00:00:00.000Z" },
      { id: "follow-up-billing", assignee_id: ROLE_FIXTURES.billing.operatorId, org_id: "org-billing", title: "Billing follow-up", reason: "Renewal review", status: "in_progress", next_step: null, updated_at: "2026-09-23T00:02:00.000Z", due_at: null },
      { id: "follow-up-read-only", assignee_id: ROLE_FIXTURES.read_only.operatorId, org_id: "org-read-only", title: "Read-only follow-up", reason: "Review handoff", status: "open", next_step: null, updated_at: "2026-09-23T00:03:00.000Z", due_at: null },
      { id: "follow-up-other", assignee_id: "operator-other", org_id: "org-other", title: "Other follow-up", reason: "Other operator", status: "open", next_step: null, updated_at: "2026-09-23T00:04:00.000Z", due_at: null },
    ],
    support_cases: [
      { id: "case-support", assigned_to: ROLE_FIXTURES.support.operatorId, org_id: "org-support", subject: "Support case", priority: "urgent", status: "open", first_response_due_at: "2026-09-24T00:00:00.000Z", updated_at: "2026-09-23T00:05:00.000Z" },
      { id: "case-billing", assigned_to: ROLE_FIXTURES.billing.operatorId, org_id: "org-billing", subject: "Billing case", priority: "normal", status: "open", first_response_due_at: "2026-09-24T00:00:00.000Z", updated_at: "2026-09-23T00:06:00.000Z" },
      { id: "case-read-only", assigned_to: ROLE_FIXTURES.read_only.operatorId, org_id: "org-read-only", subject: "Read-only case", priority: "normal", status: "waiting_on_customer", first_response_due_at: "2026-09-24T00:00:00.000Z", updated_at: "2026-09-23T00:07:00.000Z" },
      { id: "case-other", assigned_to: "operator-other", org_id: "org-other", subject: "Other case", priority: "normal", status: "open", first_response_due_at: "2026-09-24T00:00:00.000Z", updated_at: "2026-09-23T00:08:00.000Z" },
    ],
    platform_attention_occurrences: [
      { id: "attention-support", assigned_to: ROLE_FIXTURES.support.operatorId, title: "Support attention", detail: "Support attention detail", organization_id: "org-support", severity: "high", state: "acknowledged", href: "/platform/support?case=case-support", updated_at: "2026-09-23T00:09:00.000Z", snoozed_until: null },
      { id: "attention-billing", assigned_to: ROLE_FIXTURES.billing.operatorId, title: "Billing attention", detail: "Billing attention detail", organization_id: "org-billing", severity: "medium", state: "open", href: "/platform/billing?organization=org-billing", updated_at: "2026-09-23T00:10:00.000Z", snoozed_until: null },
      { id: "attention-read-only", assigned_to: ROLE_FIXTURES.read_only.operatorId, title: "Read-only attention", detail: "Read-only attention detail", organization_id: "org-read-only", severity: "low", state: "snoozed", href: "/platform/attention?occurrence=attention-read-only", updated_at: "2026-09-23T00:11:00.000Z", snoozed_until: "2026-09-24T00:00:00.000Z" },
      { id: "attention-other", assigned_to: "operator-other", title: "Other attention", detail: "Other attention detail", organization_id: "org-other", severity: "critical", state: "open", href: "/platform/attention?occurrence=attention-other", updated_at: "2026-09-23T00:12:00.000Z", snoozed_until: null },
    ],
    organizations: [
      { id: "org-support", name: "Support organization" },
      { id: "org-billing", name: "Billing organization" },
      { id: "org-read-only", name: "Read-only organization" },
      { id: "org-other", name: "Other organization" },
    ],
  };
}

function itemIds(read: Awaited<ReturnType<typeof readPlatformMyWork>>, source: PlatformMyWorkItem["source"]) {
  return read.items.filter((entry) => entry.source === source).map((entry) => entry.id);
}

function itemHref(read: Awaited<ReturnType<typeof readPlatformMyWork>>, id: string) {
  return read.items.find((entry) => entry.id === id)?.href;
}

const item = (overrides: Partial<PlatformMyWorkItem>): PlatformMyWorkItem => ({
  id: "1",
  source: "follow_up",
  title: "Task",
  detail: "Detail",
  organizationId: null,
  organizationName: null,
  status: "open",
  severity: "medium",
  dueAt: null,
  updatedAt: "2026-09-23T00:00:00.000Z",
  href: "/platform/attention",
  ...overrides,
});

test("My work labels and ordering remain deterministic", () => {
  assert.equal(platformMyWorkSourceLabel("follow_up"), "Follow-up");
  assert.equal(platformMyWorkSourceLabel("support_case"), "Support case");
  assert.equal(platformMyWorkSeverityLabel("critical"), "Critical");
  const sorted = sortPlatformMyWorkItems([
    item({ id: "no-due", severity: "medium", dueAt: null }),
    item({ id: "urgent", source: "attention", severity: "critical", dueAt: "2026-09-23T02:00:00.000Z" }),
    item({ id: "soon", severity: "medium", dueAt: "2026-09-23T01:00:00.000Z" }),
  ]);
  assert.deepEqual(sorted.map((entry) => entry.id), ["urgent", "soon", "no-due"]);
});

test("My work reader and Home surface preserve source boundaries", () => {
  const reader = fs.readFileSync(path.resolve(process.cwd(), "src", "lib", "platform-my-work-server.ts"), "utf8");
  const page = fs.readFileSync(path.resolve(process.cwd(), "src", "app", "platform", "(console)", "page.tsx"), "utf8");
  const component = fs.readFileSync(path.resolve(process.cwd(), "src", "app", "platform", "PlatformMyWork.tsx"), "utf8");
  assert.match(reader, /eq\("assignee_id", operatorId\)/);
  assert.match(reader, /eq\("assigned_to", operatorId\)/);
  assert.match(reader, /limit\(51\)/);
  assert.match(reader, /sortPlatformMyWorkItems/);
  assert.match(page, /readPlatformMyWork/);
  assert.match(page, /const canViewSupport = actor\.role !== "billing"/);
  assert.match(page, /<PlatformMyWork work=\{myWork\}/);
  assert.match(component, /Assignment sources unavailable/);
  assert.match(component, /No active assignments/);
  assert.match(component, /<Link href=\{item\.href\}/);
});

test("My work scopes every assigned source to the signed-in support, billing, or read-only operator", async () => {
  const { admin, calls } = createMyWorkAdmin({ rows: sharedMyWorkRows() });
  const support = await readPlatformMyWork(admin, ROLE_FIXTURES.support.email, ROLE_FIXTURES.support.canViewSupport);
  const billing = await readPlatformMyWork(admin, ROLE_FIXTURES.billing.email, ROLE_FIXTURES.billing.canViewSupport);
  const readOnly = await readPlatformMyWork(admin, ROLE_FIXTURES.read_only.email, ROLE_FIXTURES.read_only.canViewSupport);

  assert.deepEqual(itemIds(support, "follow_up"), ["follow-up-support"]);
  assert.deepEqual(itemIds(support, "support_case"), ["case-support"]);
  assert.deepEqual(itemIds(support, "attention"), ["attention-support"]);
  assert.deepEqual(itemIds(billing, "follow_up"), ["follow-up-billing"]);
  assert.deepEqual(itemIds(billing, "support_case"), []);
  assert.deepEqual(itemIds(billing, "attention"), ["attention-billing"]);
  assert.deepEqual(itemIds(readOnly, "follow_up"), ["follow-up-read-only"]);
  assert.deepEqual(itemIds(readOnly, "support_case"), ["case-read-only"]);
  assert.deepEqual(itemIds(readOnly, "attention"), ["attention-read-only"]);

  assert.deepEqual(support.sourceAvailability, { follow_up: true, support_case: true, attention: true });
  assert.deepEqual(billing.sourceAvailability, { follow_up: true, support_case: false, attention: true });
  assert.deepEqual(readOnly.sourceAvailability, { follow_up: true, support_case: true, attention: true });

  const assignedQuery = (table: string, column: string, operatorId: string) => calls.find((call) => call.table === table && call.filters.some((filter) => filter.column === column && filter.kind === "eq" && filter.value === operatorId));
  assert.ok(assignedQuery("platform_follow_up_tasks", "assignee_id", ROLE_FIXTURES.support.operatorId));
  assert.ok(assignedQuery("platform_follow_up_tasks", "assignee_id", ROLE_FIXTURES.billing.operatorId));
  assert.ok(assignedQuery("platform_follow_up_tasks", "assignee_id", ROLE_FIXTURES.read_only.operatorId));
  assert.ok(assignedQuery("support_cases", "assigned_to", ROLE_FIXTURES.support.operatorId));
  assert.ok(assignedQuery("support_cases", "assigned_to", ROLE_FIXTURES.read_only.operatorId));
  assert.equal(assignedQuery("support_cases", "assigned_to", ROLE_FIXTURES.billing.operatorId), undefined);
  assert.ok(assignedQuery("platform_attention_occurrences", "assigned_to", ROLE_FIXTURES.support.operatorId));
  assert.ok(assignedQuery("platform_attention_occurrences", "assigned_to", ROLE_FIXTURES.billing.operatorId));
  assert.ok(assignedQuery("platform_attention_occurrences", "assigned_to", ROLE_FIXTURES.read_only.operatorId));

  assert.equal(itemHref(support, "follow-up-support"), "/platform/organizations/org-support");
  assert.equal(itemHref(support, "case-support"), "/platform/organizations/org-support");
  assert.equal(itemHref(support, "attention-support"), "/platform/support?case=case-support");
  assert.equal(itemHref(billing, "attention-billing"), "/platform/billing?organization=org-billing");
  assert.equal(itemHref(readOnly, "attention-read-only"), "/platform/attention?occurrence=attention-read-only");
});

test("My work keeps an empty queue distinct from unavailable assignment sources", async () => {
  const emptyAdmin = createMyWorkAdmin({
    rows: {
      platform_operators: [{ id: ROLE_FIXTURES.support.operatorId, email: ROLE_FIXTURES.support.email, is_active: true }],
      platform_follow_up_tasks: [],
      support_cases: [],
      platform_attention_occurrences: [],
    },
  });
  const empty = await readPlatformMyWork(emptyAdmin.admin, ROLE_FIXTURES.support.email, true);
  assert.deepEqual(empty.items, []);
  assert.deepEqual(empty.sourceAvailability, { follow_up: true, support_case: true, attention: true });

  const unavailableAdmin = createMyWorkAdmin({
    rows: {
      platform_operators: [{ id: ROLE_FIXTURES.support.operatorId, email: ROLE_FIXTURES.support.email, is_active: true }],
      platform_follow_up_tasks: [],
      support_cases: [],
      platform_attention_occurrences: [],
    },
    errors: {
      platform_follow_up_tasks: { message: "follow-up schema unavailable" },
      support_cases: { message: "support schema unavailable" },
      platform_attention_occurrences: { message: "attention schema unavailable" },
    },
  });
  const unavailable = await readPlatformMyWork(unavailableAdmin.admin, ROLE_FIXTURES.support.email, true);
  assert.deepEqual(unavailable.items, []);
  assert.deepEqual(unavailable.sourceAvailability, { follow_up: false, support_case: false, attention: false });
  assert.notDeepEqual(unavailable.sourceAvailability, empty.sourceAvailability);

  const billingEmptyAdmin = createMyWorkAdmin({
    rows: {
      platform_operators: [{ id: ROLE_FIXTURES.billing.operatorId, email: ROLE_FIXTURES.billing.email, is_active: true }],
      platform_follow_up_tasks: [],
      support_cases: [],
      platform_attention_occurrences: [],
    },
  });
  const billingUnavailable = await readPlatformMyWork(billingEmptyAdmin.admin, ROLE_FIXTURES.billing.email, false);
  assert.deepEqual(billingUnavailable.items, []);
  assert.deepEqual(billingUnavailable.sourceAvailability, { follow_up: true, support_case: false, attention: true });
});
