import { getPublicMenuStoreForHostname } from "@/lib/online-ordering-server";

export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  context: { params: Promise<{ storeSlug: string }> },
) {
  const { storeSlug } = await context.params;
  const menu = await getPublicMenuStoreForHostname(storeSlug, request.headers.get("host"));
  if (!menu) return Response.json({ ok: false, message: "Menu not found." }, { status: 404 });
  return Response.json({
    ok: true,
    updatedAt: new Date().toISOString(),
    products: menu.products.map((product) => ({
      id: product.id,
      isAvailable: product.isAvailable,
      availabilityReason: product.availabilityReason,
      availableQty: product.availableQty,
    })),
    categories: menu.categories.map((category) => ({ id: category.id, isAvailable: category.isAvailable })),
  }, { headers: { "cache-control": "no-store" } });
}
