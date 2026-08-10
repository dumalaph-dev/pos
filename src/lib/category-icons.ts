import type { AdminIconName } from "@/components/admin/AdminIcon";

/** Resolve stored catalog icon labels to a consistent admin icon. */
export function categoryIconName(icon: string | null | undefined, label = ""): AdminIconName {
  const iconValue = (icon ?? "").trim().toLowerCase();
  const labelValue = label.trim().toLowerCase();

  if (iconValue.includes("lechon") || iconValue.includes("pig") || labelValue.includes("lechon")) return "pig";
  if (iconValue.includes("drink") || iconValue.includes("beverage") || labelValue.includes("drink") || labelValue.includes("coffee") || labelValue.includes("beverage")) return "drink";
  if (iconValue.includes("rice") || iconValue.includes("side") || labelValue.includes("rice") || labelValue.includes("side")) return "rice";
  if (iconValue.includes("sauce") || iconValue.includes("extra") || labelValue.includes("sauce") || labelValue.includes("extra") || labelValue.includes("add-on")) return "sauce";
  if (iconValue.includes("package") || iconValue.includes("combo") || labelValue.includes("package") || labelValue.includes("combo") || labelValue.includes("pastr") || labelValue.includes("bakery")) return "package";
  if (iconValue.includes("plus") || labelValue.includes("add-on")) return "plus";
  if (iconValue.includes("grid") || iconValue.includes("all") || iconValue.includes("▦") || iconValue.includes("◈") || labelValue.startsWith("all ")) return "dashboard";
  if (iconValue.includes("more") || iconValue.includes("other") || iconValue.includes("⋯") || labelValue === "others" || labelValue === "uncategorized") return "more";
  if (iconValue.includes("tag")) return "tag";
  return "box";
}
