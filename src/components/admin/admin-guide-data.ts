export const GUIDE_TOPIC_IDS = [
  "dashboard",
  "inventory",
  "reports",
  "shifts",
  "products",
  "employees",
  "calendar",
] as const;

export type GuideTopic = (typeof GUIDE_TOPIC_IDS)[number];
