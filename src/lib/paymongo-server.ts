export type PayMongoResource = {
  data?: {
    id?: unknown;
    type?: unknown;
    attributes?: unknown;
  };
};

export type PayMongoResourceAttributes = Record<string, unknown>;

export class PayMongoApiError extends Error {
  readonly status: number;
  readonly providerMessage: string;

  constructor(status: number, providerMessage: string) {
    super(`PayMongo request failed with status ${status}.`);
    this.name = "PayMongoApiError";
    this.status = status;
    this.providerMessage = providerMessage;
  }
}

type PayMongoRequestOptions = {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  body?: unknown;
  idempotencyKey?: string;
};

type PlanInput = {
  existingPlanId: string | null;
  variantId: string;
  label: string;
  amountCentavos: number;
  intervalUnit: "month" | "year";
  intervalCount: number;
};

type CustomerInput = {
  existingCustomerId: string | null;
  firstName: string;
  lastName: string;
  email: string;
  idempotencyKey: string;
};

type HostedCheckoutInput = {
  amountCentavos: number;
  itemName: string;
  description: string;
  successUrl: string;
  cancelUrl: string;
  referenceNumber: string;
  email: string | null;
  metadata: Record<string, string>;
  idempotencyKey: string;
};

export function payMongoPublicKey() {
  return process.env.NEXT_PUBLIC_PAYMONGO_PUBLIC_KEY?.trim() || null;
}

export function payMongoSecretKeyConfigured() {
  return Boolean(process.env.PAYMONGO_SECRET_KEY?.trim());
}

export async function payMongoRequest<T extends PayMongoResource = PayMongoResource>(path: string, options: PayMongoRequestOptions = {}) {
  const secretKey = process.env.PAYMONGO_SECRET_KEY?.trim();
  if (!secretKey) throw new Error("PAYMONGO_SECRET_KEY is not configured.");

  const baseUrl = (process.env.PAYMONGO_API_BASE_URL?.trim() || "https://api.paymongo.com").replace(/\/$/, "");
  const headers = new Headers({
    Accept: "application/json",
    Authorization: `Basic ${Buffer.from(`${secretKey}:`).toString("base64")}`,
  });
  if (options.body !== undefined) headers.set("Content-Type", "application/json");
  if (options.idempotencyKey) headers.set("Idempotency-Key", options.idempotencyKey);

  const response = await fetch(`${baseUrl}${path.startsWith("/") ? path : `/${path}`}`, {
    method: options.method ?? "GET",
    headers,
    ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
    cache: "no-store",
  });
  const rawBody = await response.text();
  const payload = parseJson(rawBody);

  if (!response.ok) {
    throw new PayMongoApiError(response.status, readProviderError(payload) || `HTTP ${response.status}`);
  }

  return payload as T;
}

export async function ensurePayMongoPlan(input: PlanInput) {
  const expected = {
    amount: input.amountCentavos,
    currency: "PHP",
    interval: input.intervalUnit,
    intervalCount: input.intervalCount,
  };

  if (input.existingPlanId) {
    try {
      const existing = await getPayMongoPlan(input.existingPlanId);
      if (isMatchingPlan(existing.attributes, expected)) {
        return { id: input.existingPlanId, created: false };
      }
    } catch (error) {
      if (!(error instanceof PayMongoApiError) || error.status !== 404) throw error;
    }
  }

  const response = await createScheduledPlan(input);
  const id = resourceId(response);
  if (!id) throw new Error("PayMongo did not return a plan id.");
  return { id, created: true };
}

async function createScheduledPlan(input: PlanInput) {
  const idempotencyKey = `pos-plan-${input.variantId}-${input.amountCentavos}-${input.intervalUnit}-${input.intervalCount}`;
  const subscriptionPlanBody = planBody(input, input.intervalUnit);

  try {
    return await payMongoRequest("/v1/subscriptions/plans", {
      method: "POST",
      idempotencyKey,
      body: subscriptionPlanBody,
    });
  } catch (error) {
    if (!(error instanceof PayMongoApiError) || (error.status !== 404 && error.status !== 405)) throw error;

    return payMongoRequest("/v1/plans", {
      method: "POST",
      idempotencyKey,
      body: planBody(input, input.intervalUnit),
    });
  }
}

function planBody(input: PlanInput, interval: "month" | "year" | "monthly" | "yearly") {
  return {
    data: {
      attributes: {
        type: "scheduled",
        name: input.label,
        description: `Dumala POS ${input.label}`,
        amount: input.amountCentavos,
        currency: "PHP",
        interval,
        interval_count: input.intervalCount,
        metadata: {
          pos_variant_id: input.variantId,
          pos_amount_centavos: String(input.amountCentavos),
        },
      },
    },
  };
}

export async function createPayMongoCustomer(input: CustomerInput) {
  if (input.existingCustomerId) return { id: input.existingCustomerId, created: false };

  const response = await payMongoRequest(
    "/v1/customers",
    {
      method: "POST",
      idempotencyKey: input.idempotencyKey,
      body: {
        data: {
          attributes: {
            first_name: input.firstName,
            last_name: input.lastName,
            email: input.email,
          },
        },
      },
    },
  );
  const id = resourceId(response);
  if (!id) throw new Error("PayMongo did not return a customer id.");
  return { id, created: true };
}

export async function createPayMongoQrPhCheckoutSession(input: HostedCheckoutInput) {
  const response = await payMongoRequest(
    "/v2/checkout_sessions",
    {
      method: "POST",
      idempotencyKey: input.idempotencyKey,
      body: {
        data: {
          attributes: {
            line_items: [
              {
                name: input.itemName,
                amount: input.amountCentavos,
                currency: "PHP",
                quantity: 1,
              },
            ],
            payment_method_types: ["qrph"],
            description: input.description,
            success_url: input.successUrl,
            cancel_url: input.cancelUrl,
            reference_number: input.referenceNumber,
            send_email_receipt: Boolean(input.email),
            show_description: true,
            show_line_items: true,
            metadata: input.metadata,
            ...(input.email ? { billing: { email: input.email } } : {}),
          },
        },
      },
    },
  );
  const id = resourceId(response);
  const checkoutUrl = readPayMongoString(resourceAttributes(response), "checkout_url");
  if (!id || !checkoutUrl) throw new Error("PayMongo did not return a QR Ph checkout URL.");
  return { id, checkoutUrl, response, attributes: resourceAttributes(response) };
}

export async function getPayMongoCheckoutSession(checkoutSessionId: string) {
  const response = await payMongoRequest(`/v1/checkout_sessions/${encodeURIComponent(checkoutSessionId)}`);
  return { response, attributes: resourceAttributes(response) };
}

export async function createPayMongoSubscription(planId: string, customerId: string, idempotencyKey: string) {
  const response = await payMongoRequest(
    "/v1/subscriptions",
    {
      method: "POST",
      idempotencyKey,
      body: {
        data: {
          attributes: {
            plan_id: planId,
            customer_id: customerId,
          },
        },
      },
    },
  );
  const id = resourceId(response);
  if (!id) throw new Error("PayMongo did not return a subscription id.");
  return { id, response };
}

export async function getPayMongoSubscription(subscriptionId: string) {
  const response = await payMongoRequest(`/v1/subscriptions/${encodeURIComponent(subscriptionId)}`);
  return { response, attributes: resourceAttributes(response) };
}

export async function getPayMongoPaymentIntent(paymentIntentId: string) {
  const response = await payMongoRequest(`/v1/payment_intents/${encodeURIComponent(paymentIntentId)}`);
  return { response, attributes: resourceAttributes(response) };
}

export async function getPayMongoPlan(planId: string) {
  try {
    const response = await payMongoRequest(`/v1/subscriptions/plans/${encodeURIComponent(planId)}`);
    return { response, attributes: resourceAttributes(response) };
  } catch (error) {
    if (!(error instanceof PayMongoApiError) || (error.status !== 404 && error.status !== 405)) throw error;
    const response = await payMongoRequest(`/v1/plans/${encodeURIComponent(planId)}`);
    return { response, attributes: resourceAttributes(response) };
  }
}

export function resourceId(resource: PayMongoResource) {
  return typeof resource.data?.id === "string" ? resource.data.id : null;
}

export function resourceAttributes(resource: PayMongoResource): PayMongoResourceAttributes {
  return isRecord(resource.data?.attributes) ? resource.data.attributes : {};
}

export function readPayMongoString(attributes: PayMongoResourceAttributes, key: string) {
  return typeof attributes[key] === "string" ? attributes[key] : null;
}

export function readPayMongoNumber(attributes: PayMongoResourceAttributes, key: string) {
  const value = Number(attributes[key]);
  return Number.isFinite(value) ? value : null;
}

export function readNestedResourceId(value: unknown) {
  if (typeof value === "string") return value;
  if (!isRecord(value)) return null;
  return typeof value.id === "string" ? value.id : null;
}

function isMatchingPlan(attributes: PayMongoResourceAttributes, expected: { amount: number; currency: string; interval: string; intervalCount: number }) {
  const amount = readPayMongoNumber(attributes, "amount");
  const currency = readPayMongoString(attributes, "currency")?.toUpperCase();
  const interval = readPayMongoString(attributes, "interval");
  const intervalCount = readPayMongoNumber(attributes, "interval_count");
  const intervalMatches = expected.interval === "month"
    ? interval === "month" || interval === "monthly"
    : expected.interval === "year"
      ? interval === "year" || interval === "yearly"
      : interval === expected.interval;
  return amount === expected.amount && currency === expected.currency && intervalMatches && intervalCount === expected.intervalCount;
}

function parseJson(value: string) {
  if (!value) return {};
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return { raw: value };
  }
}

function readProviderError(payload: unknown) {
  if (!isRecord(payload) || !Array.isArray(payload.errors)) return "";
  const first = payload.errors[0];
  if (!isRecord(first)) return "";
  if (typeof first.detail === "string") return first.detail;
  if (typeof first.code === "string") return first.code;
  return "";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
