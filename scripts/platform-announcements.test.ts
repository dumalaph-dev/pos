import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import {
  platformAnnouncementAudienceMatches,
  platformAnnouncementIsLive,
  type PlatformAnnouncementTenantContext,
} from "../src/lib/platform-announcements.ts";

const AS_OF = Date.parse("2026-09-23T04:00:00.000Z");

const PREMIUM_ACTIVE: PlatformAnnouncementTenantContext = {
  plan: "premium",
  accountStatus: "active",
};

test("all-merchant announcements are visible to every tenant audience", () => {
  assert.equal(platformAnnouncementAudienceMatches("all", null, PREMIUM_ACTIVE), true);
  assert.equal(platformAnnouncementAudienceMatches("all", "ignored", { plan: "starter", accountStatus: "suspended" }), true);
});

test("plan targeting isolates matching plans without using account status", () => {
  assert.equal(platformAnnouncementAudienceMatches("plan", "premium", PREMIUM_ACTIVE), true);
  assert.equal(platformAnnouncementAudienceMatches("plan", " PREMIUM ", { plan: "premium", accountStatus: "suspended" }), true);
  assert.equal(platformAnnouncementAudienceMatches("plan", "premium", { plan: "starter", accountStatus: "active" }), false);
  assert.equal(platformAnnouncementAudienceMatches("plan", "starter", PREMIUM_ACTIVE), false);
  assert.equal(platformAnnouncementAudienceMatches("plan", null, PREMIUM_ACTIVE), false);
});

test("account-status targeting isolates matching account states without using plan", () => {
  assert.equal(platformAnnouncementAudienceMatches("account_status", "active", PREMIUM_ACTIVE), true);
  assert.equal(platformAnnouncementAudienceMatches("account_status", "active", { plan: "starter", accountStatus: "active" }), true);
  assert.equal(platformAnnouncementAudienceMatches("account_status", "suspended", PREMIUM_ACTIVE), false);
  assert.equal(platformAnnouncementAudienceMatches("account_status", "active", { plan: "premium", accountStatus: "suspended" }), false);
});

test("delivery is limited to published rows inside the active time window", () => {
  const live = {
    status: "published" as const,
    startsAt: "2026-09-23T03:00:00.000Z",
    expiresAt: "2026-09-23T05:00:00.000Z",
  };

  assert.equal(platformAnnouncementIsLive(live, AS_OF), true);
  assert.equal(platformAnnouncementIsLive({ ...live, status: "draft" }, AS_OF), false);
  assert.equal(platformAnnouncementIsLive({ ...live, status: "scheduled" }, AS_OF), false);
  assert.equal(platformAnnouncementIsLive({ ...live, startsAt: "2026-09-23T05:00:00.000Z" }, AS_OF), false);
  assert.equal(platformAnnouncementIsLive({ ...live, expiresAt: "2026-09-23T04:00:00.000Z" }, AS_OF), false);
  assert.equal(platformAnnouncementIsLive({ ...live, expiresAt: null }, AS_OF), true);
});

test("tenant delivery keeps the platform tables private and exposes an audience-free RPC", () => {
  const originalMigration = fs.readFileSync(path.resolve(process.cwd(), "supabase", "migrations", "0085_platform_announcements.sql"), "utf8");
  const migration = fs.readFileSync(path.resolve(process.cwd(), "supabase", "migrations", "0090_platform_announcement_delivery.sql"), "utf8");
  assert.match(originalMigration, /revoke all on table public\.platform_announcements,\s*public\.platform_announcement_audit_logs\s+from anon, authenticated, public/i);
  assert.match(originalMigration, /grant all on table public\.platform_announcements,\s*public\.platform_announcement_audit_logs\s+to service_role/i);
  assert.doesNotMatch(migration, /platform_announcement_audit_logs/i);
  assert.match(migration, /create or replace function public\.platform_announcements_for_current_tenant\(\)/i);
  assert.match(migration, /p\.id\s*=\s*auth\.uid\(\)/i);
  assert.match(migration, /a\.status\s*=\s*'published'/i);
  assert.match(migration, /a\.expires_at\s+is\s+null\s+or\s+a\.expires_at\s*>\s*now\(\)/i);
  assert.match(migration, /a\.audience\s*=\s*'all'/i);
  assert.match(migration, /a\.audience\s*=\s*'plan'/i);
  assert.match(migration, /a\.audience\s*=\s*'account_status'/i);
  assert.match(migration, /revoke execute on function public\.platform_announcements_for_current_tenant\(\)\s+from public, anon, authenticated/i);
  assert.match(migration, /grant execute on function public\.platform_announcements_for_current_tenant\(\)\s+to authenticated/i);
  assert.doesNotMatch(migration, /p_(org|audience|plan|account_status)/i);

  const reader = fs.readFileSync(path.resolve(process.cwd(), "src", "lib", "platform-announcements-server.ts"), "utf8");
  assert.match(reader, /readTenantPlatformAnnouncements[\s\S]*?supabase\.rpc\("platform_announcements_for_current_tenant"\)/i);
});
