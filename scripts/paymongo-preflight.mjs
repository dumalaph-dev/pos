import fs from "node:fs";
import path from "node:path";

const env = {
  ...readEnvFile(".env.local"),
  ...process.env,
};
const publicKey = value("NEXT_PUBLIC_PAYMONGO_PUBLIC_KEY");
const secretKey = value("PAYMONGO_SECRET_KEY");
const webhookSecret = value("PAYMONGO_WEBHOOK_SECRET");
const expectedMode = value("PAYMONGO_EXPECTED_MODE") || "test";
const apiBaseUrl = (value("PAYMONGO_API_BASE_URL") || "https://api.paymongo.com").replace(/\/+$/, "");
const siteUrl = value("NEXT_PUBLIC_SITE_URL");
const expectedWebhookUrl = siteUrl.replace(/\/+$/, "") + "/api/paymongo/webhook";
const supabaseUrl = (value("NEXT_PUBLIC_SUPABASE_URL") || "").replace(/\/+$/, "");
const supabaseServiceRoleKey = value("SUPABASE_SERVICE_ROLE_KEY");
const requiredEvents = [
  "payment.paid",
  "payment.failed",
  "payment_intent.succeeded",
  "subscription.activated",
  "subscription.past_due",
  "subscription.unpaid",
  "subscription.updated",
  "subscription.invoice.paid",
  "subscription.invoice.payment_failed",
];
const issues = [];

console.log("PayMongo checkout preflight");
console.log("Safe mode: key values, webhook secrets, and API response bodies are never printed.");
console.log("- public key: " + keySummary(publicKey, "pk"));
console.log("- secret key: " + keySummary(secretKey, "sk"));
console.log("- webhook secret: " + (webhookSecret ? "present" : "missing"));
console.log("- subscription flag: " + (value("PAYMONGO_SUBSCRIPTIONS_ENABLED") === "true" ? "enabled" : "disabled"));
console.log("- public site URL: " + (siteUrl ? "configured" : "missing"));
console.log("- Supabase project URL: " + (supabaseUrl ? "configured" : "missing"));
console.log("- Supabase admin key: " + (supabaseServiceRoleKey ? "present" : "missing"));

const publicMode = keyMode(publicKey, "pk");
const secretMode = keyMode(secretKey, "sk");
if (!publicKey) issues.push("Set NEXT_PUBLIC_PAYMONGO_PUBLIC_KEY to the PayMongo " + expectedMode + "-mode public key.");
if (!secretKey) issues.push("Set PAYMONGO_SECRET_KEY to the PayMongo " + expectedMode + "-mode secret key.");
if (publicKey && !publicMode) issues.push("Use a recognized PayMongo public key prefix: pk_test_ or pk_live_.");
if (secretKey && !secretMode) issues.push("Use a recognized PayMongo secret key prefix: sk_test_ or sk_live_.");
if (publicMode && secretMode && publicMode !== secretMode) issues.push("Use public and secret keys from the same PayMongo mode.");
if (publicMode && publicMode !== expectedMode) issues.push("Use " + expectedMode + "-mode PayMongo keys for this test preflight.");
if (secretMode && secretMode !== expectedMode) issues.push("Use " + expectedMode + "-mode PayMongo keys for this test preflight.");
if (!webhookSecret) issues.push("Set PAYMONGO_WEBHOOK_SECRET to the signing secret from the PayMongo test webhook endpoint.");
if (value("PAYMONGO_SUBSCRIPTIONS_ENABLED") !== "true") issues.push("Set PAYMONGO_SUBSCRIPTIONS_ENABLED=true only after PayMongo Subscriptions access is enabled for this account.");
if (!siteUrl) issues.push("Set NEXT_PUBLIC_SITE_URL to the public HTTPS origin that PayMongo can reach; the webhook URL is <origin>/api/paymongo/webhook.");
if (siteUrl) {
  try {
    const parsedSiteUrl = new URL(siteUrl);
    if (parsedSiteUrl.protocol !== "https:" || parsedSiteUrl.pathname !== "/" || parsedSiteUrl.search || parsedSiteUrl.hash) {
      issues.push("Set NEXT_PUBLIC_SITE_URL to the public HTTPS origin only, without a path, query, or hash.");
    }
  } catch {
    issues.push("Set NEXT_PUBLIC_SITE_URL to a valid public HTTPS origin.");
  }
}
if (!supabaseUrl) issues.push("Set NEXT_PUBLIC_SUPABASE_URL to the Supabase project used by this app.");
if (!supabaseServiceRoleKey) issues.push("Set SUPABASE_SERVICE_ROLE_KEY to the server-only key from the same Supabase project as NEXT_PUBLIC_SUPABASE_URL.");

if (supabaseUrl && supabaseServiceRoleKey) {
  const supabase = await getSupabase("/rest/v1/organizations?select=id&limit=1");
  if (supabase.error) {
    issues.push("The Supabase admin API could not be reached: " + supabase.error + ".");
  } else {
    console.log("- Supabase admin API: HTTP " + supabase.status);
    if (!supabase.ok) issues.push(supabaseAction(supabase.status, "organizations"));
  }

  if (supabase.ok) {
    const policies = await getSupabase("/rest/v1/platform_policies?select=policy_key,status&policy_key=in.(billing,support)");
    if (policies.error) {
      issues.push("The platform policy check could not be completed: " + policies.error + ".");
    } else if (!policies.ok) {
      issues.push(supabaseAction(policies.status, "platform_policies"));
    } else {
      const rows = Array.isArray(policies.payload?.data) ? policies.payload.data : [];
      const statuses = new Map(rows.map((row) => [row?.policy_key, row?.status]));
      const unpublished = ["billing", "support"].filter((policyKey) => statuses.get(policyKey) !== "published");
      console.log("- platform policies: " + (unpublished.length === 0 ? "billing and support published" : unpublished.join(" and ") + " not published"));
      if (unpublished.length > 0) issues.push("Publish the " + unpublished.join(" and ") + " polic" + (unpublished.length === 1 ? "y" : "ies") + " from /platform/policies before checkout.");
    }

    const catalog = await getSupabase("/rest/v1/platform_billing_variants?select=id&is_active=eq.true&limit=1");
    if (catalog.error) {
      issues.push("The billing catalog check could not be completed: " + catalog.error + ".");
    } else if (!catalog.ok) {
      issues.push(supabaseAction(catalog.status, "platform_billing_variants"));
    } else if (!Array.isArray(catalog.payload?.data) || catalog.payload.data.length === 0) {
      issues.push("Activate at least one billing variant from /platform/plans before checkout.");
    } else {
      console.log("- active billing variant: present");
    }
  }
}

if (issues.length === 0) {
  const plans = await getPayMongo("/v1/subscriptions/plans?limit=1", secretKey);
  if (plans.error) {
    issues.push("The PayMongo plan API could not be reached: " + plans.error + ".");
  } else {
    console.log("- subscription plan API: HTTP " + plans.status);
    if (!plans.ok) issues.push(planApiAction(plans.status));
  }

  const webhooks = await getPayMongo("/v1/webhooks", secretKey);
  if (webhooks.error) {
    issues.push("The PayMongo webhook API could not be reached: " + webhooks.error + ".");
  } else {
    const endpoints = Array.isArray(webhooks.payload?.data) ? webhooks.payload.data : [];
    const testEndpoints = endpoints.filter((endpoint) => endpoint?.attributes?.livemode === false);
    console.log("- test webhook endpoints: " + testEndpoints.length);
    if (testEndpoints.length === 0) {
      issues.push("Create an enabled PayMongo test-mode webhook endpoint for /api/paymongo/webhook, then save its signing secret as PAYMONGO_WEBHOOK_SECRET.");
    } else {
      const endpoint = testEndpoints.find((item) => !["disabled", "inactive"].includes(String(item?.attributes?.status ?? "").toLowerCase())) ?? testEndpoints[0];
      const endpointId = typeof endpoint?.id === "string" ? endpoint.id : "unknown endpoint";
      const endpointStatus = typeof endpoint?.attributes?.status === "string" ? endpoint.attributes.status : "unknown status";
      const endpointUrl = typeof endpoint?.attributes?.url === "string" ? endpoint.attributes.url.replace(/\/+$/, "") : "";
      const events = webhookEvents(endpoint?.attributes?.events);
      console.log("  - " + endpointId + ": " + endpointStatus + ", " + events.length + " configured event(s)");
      if (endpointUrl && endpointUrl !== expectedWebhookUrl) {
        issues.push("Point the PayMongo test webhook endpoint " + endpointId + " to " + expectedWebhookUrl + ".");
      }
      if (["disabled", "inactive"].includes(endpointStatus.toLowerCase())) {
        issues.push("Enable the PayMongo test webhook endpoint " + endpointId + ".");
      }
      const missingEvents = requiredEvents.filter((eventName) => !events.includes(eventName));
      if (missingEvents.length > 0) {
        issues.push("Add these events to the PayMongo test webhook endpoint: " + missingEvents.join(", ") + ".");
      }
    }
  }
}

if (issues.length > 0) {
  console.log("");
  console.log("Remaining actions:");
  for (const issue of issues) console.log("- " + issue);
  process.exitCode = 1;
} else {
  console.log("");
  console.log("Preflight passed: checkout configuration and PayMongo test-mode access are ready.");
}

function value(key) {
  const candidate = env[key];
  return typeof candidate === "string" ? candidate.trim() : "";
}

function readEnvFile(filename) {
  const filePath = path.resolve(process.cwd(), filename);
  if (!fs.existsSync(filePath)) return {};

  const values = {};
  const contents = fs.readFileSync(filePath, "utf8");
  for (const rawLine of contents.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const assignment = line.startsWith("export ") ? line.slice(7) : line;
    const separator = assignment.indexOf("=");
    if (separator <= 0) continue;

    const key = assignment.slice(0, separator).trim();
    let candidate = assignment.slice(separator + 1).trim();
    if ((candidate.startsWith("\"") && candidate.endsWith("\"")) || (candidate.startsWith("'") && candidate.endsWith("'"))) {
      candidate = candidate.slice(1, -1);
    }
    values[key] = candidate;
  }
  return values;
}

function keyMode(key, prefix) {
  if (key.startsWith(prefix + "_test_")) return "test";
  if (key.startsWith(prefix + "_live_")) return "live";
  return null;
}

function keySummary(key, prefix) {
  if (!key) return "missing";
  return "present (" + (keyMode(key, prefix) || "unrecognized prefix or mode") + ")";
}

function webhookEvents(candidate) {
  if (!Array.isArray(candidate)) return [];
  return candidate
    .map((event) => {
      if (typeof event === "string") return event;
      if (event && typeof event === "object") {
        if (typeof event.name === "string") return event.name;
        if (typeof event.type === "string") return event.type;
      }
      return null;
    })
    .filter((eventName) => typeof eventName === "string");
}

async function getPayMongo(endpoint, key) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10000);
  try {
    const response = await fetch(apiBaseUrl + endpoint, {
      headers: {
        Accept: "application/json",
        Authorization: "Basic " + Buffer.from(key + ":", "utf8").toString("base64"),
      },
      signal: controller.signal,
    });
    const body = await response.text();
    let payload = null;
    if (body) {
      try {
        payload = JSON.parse(body);
      } catch {
        payload = null;
      }
    }
    return { ok: response.ok, status: response.status, payload };
  } catch (error) {
    return { ok: false, status: 0, payload: null, error: error instanceof Error ? error.message : "unknown network error" };
  } finally {
    clearTimeout(timeoutId);
  }
}

async function getSupabase(endpoint) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10000);
  try {
    const response = await fetch(supabaseUrl + endpoint, {
      headers: {
        Accept: "application/json",
        apikey: supabaseServiceRoleKey,
        Authorization: "Bearer " + supabaseServiceRoleKey,
      },
      signal: controller.signal,
    });
    const body = await response.text();
    let payload = null;
    if (body) {
      try {
        payload = JSON.parse(body);
      } catch {
        payload = null;
      }
    }
    return { ok: response.ok, status: response.status, payload };
  } catch (error) {
    return { ok: false, status: 0, payload: null, error: error instanceof Error ? error.message : "unknown network error" };
  } finally {
    clearTimeout(timeoutId);
  }
}

function planApiAction(status) {
  if (status === 401 || status === 403) return "PayMongo rejected the secret key or Subscriptions is not enabled for this account; verify the test secret key and request/enable Subscriptions access.";
  if (status === 404 || status === 405) return "PayMongo did not expose the Subscriptions plan API for this account; request/enable Subscriptions access before checkout.";
  return "The PayMongo subscription plan API returned HTTP " + status + "; resolve that account or API error before checkout.";
}

function supabaseAction(status, resource) {
  if (status === 401 || status === 403) return "The Supabase admin key was rejected for " + resource + "; replace SUPABASE_SERVICE_ROLE_KEY with the server-only key from the same project as NEXT_PUBLIC_SUPABASE_URL.";
  if (status === 404) return "The Supabase " + resource + " table is unavailable; apply the required billing/platform migrations to the project configured in NEXT_PUBLIC_SUPABASE_URL.";
  return "The Supabase " + resource + " check returned HTTP " + status + "; resolve that database or project configuration error before checkout.";
}
