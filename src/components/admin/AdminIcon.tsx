export type AdminIconName =
  | "dashboard"
  | "sales"
  | "pos"
  | "orders"
  | "inventory"
  | "customers"
  | "suppliers"
  | "expenses"
  | "reports"
  | "employees"
  | "promotions"
  | "tag"
  | "star"
  | "settings"
  | "search"
  | "bell"
  | "help"
  | "calendar"
  | "chevron"
  | "arrow"
  | "bag"
  | "wallet"
  | "box"
  | "drink"
  | "rice"
  | "sauce"
  | "package"
  | "chart"
  | "eye"
  | "pig"
  | "check"
  | "alert"
  | "filter"
  | "columns"
  | "plus"
  | "upload"
  | "download"
  | "edit"
  | "more"
  | "close"
  | "refresh"
  | "history"
  | "branches"
  | "lock";

export function AdminIcon({ name, size = 18 }: { name: AdminIconName; size?: number }) {
  const common = {
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.7,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
  };

  switch (name) {
    case "dashboard":
      return <svg {...common}><rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" /><rect x="3" y="14" width="7" height="7" rx="1.5" /><rect x="14" y="14" width="7" height="7" rx="1.5" /></svg>;
    case "sales":
      return <svg {...common}><path d="M5 8.5h14l-1 11H6l-1-11Z" /><path d="M8 8.5V7a4 4 0 0 1 8 0v1.5" /><path d="M9 12h.01M15 12h.01" /></svg>;
    case "pos":
      return <svg {...common}><rect x="4" y="4" width="16" height="13" rx="2" /><path d="M7 20h10M8 8h8M8 12h2M12 12h2M16 12h.01M8 15h8" /></svg>;
    case "orders":
      return <svg {...common}><path d="M6 3h12v18H6z" /><path d="M9 7h6M9 11h6M9 15h4" /><path d="m9 19 1.2 1.2L13 17.5" /></svg>;
    case "inventory":
      return <svg {...common}><path d="m4 7 8-4 8 4-8 4-8-4Z" /><path d="M4 7v10l8 4 8-4V7M12 11v10" /></svg>;
    case "customers":
      return <svg {...common}><circle cx="9" cy="8" r="3" /><path d="M3.5 19a5.5 5.5 0 0 1 11 0M17 8a2.5 2.5 0 0 1 0 5M16 15.5a4.5 4.5 0 0 1 4.5 3.5" /></svg>;
    case "suppliers":
      return <svg {...common}><path d="M3 7h11v10H3zM14 10h3l4 4v3h-7z" /><circle cx="7" cy="19" r="1.7" /><circle cx="17" cy="19" r="1.7" /></svg>;
    case "expenses":
      return <svg {...common}><rect x="4" y="3" width="16" height="18" rx="2" /><path d="M8 7h8M8 11h8M8 15h3M15 15h1" /></svg>;
    case "reports":
      return <svg {...common}><path d="M4 20V10M10 20V4M16 20v-7M22 20H2" /></svg>;
    case "employees":
      return <svg {...common}><circle cx="9" cy="8" r="3" /><path d="M3.5 20a5.5 5.5 0 0 1 11 0M17 5v6M14 8h6" /></svg>;
    case "promotions":
      return <svg {...common}><path d="M20 13 13 20l-9-9V4h7l9 9Z" /><circle cx="8" cy="8" r="1" /><path d="m13 7 4 4" /></svg>;
    case "tag":
      return <svg {...common}><path d="M20 13 13 20l-9-9V4h7l9 9Z" /><circle cx="8" cy="8" r="1.2" /></svg>;
    case "star":
      return <svg {...common}><path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2-5.6-2.9-5.6 2.9 1.1-6.2L3 9.6l6.2-.9L12 3Z" /></svg>;
    case "settings":
      return <svg {...common}><path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6 7 7M17 17l1.4 1.4M18.4 5.6 17 7M7 17l-1.4 1.4" /><circle cx="12" cy="12" r="4" /></svg>;
    case "search":
      return <svg {...common}><circle cx="10.8" cy="10.8" r="6.8" /><path d="m16 16 4.5 4.5" /></svg>;
    case "bell":
      return <svg {...common}><path d="M18 9a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4" /></svg>;
    case "help":
      return <svg {...common}><circle cx="12" cy="12" r="9" /><path d="M9.8 9a2.4 2.4 0 1 1 4.2 1.6c-1.2 1.1-2 1.5-2 3M12 17h.01" /></svg>;
    case "calendar":
      return <svg {...common}><rect x="3" y="4.5" width="18" height="16" rx="2" /><path d="M7 3v3M17 3v3M3 9h18M8 13h.01M12 13h.01M16 13h.01M8 17h.01M12 17h.01" /></svg>;
    case "chevron":
      return <svg {...common}><path d="m8 10 4 4 4-4" /></svg>;
    case "arrow":
      return <svg {...common}><path d="M5 12h14M13 6l6 6-6 6" /></svg>;
    case "bag":
      return <svg {...common}><path d="M5 8h14l-1 12H6L5 8Z" /><path d="M9 8V6a3 3 0 0 1 6 0v2" /></svg>;
    case "wallet":
      return <svg {...common}><path d="M4 6.5A2.5 2.5 0 0 1 6.5 4H19v16H6.5A2.5 2.5 0 0 1 4 17.5v-11Z" /><path d="M4 8h15M16 13h3" /><circle cx="16" cy="13" r=".6" fill="currentColor" stroke="none" /></svg>;
    case "box":
      return <svg {...common}><path d="m4 7 8-4 8 4v10l-8 4-8-4V7Z" /><path d="m4 7 8 4 8-4M12 11v10" /></svg>;
    case "drink":
      return <svg {...common}><path d="M8 5h8l-1 15H9L8 5Z" /><path d="M9 9h6M10 2h4M10 2v3" /></svg>;
    case "rice":
      return <svg {...common}><path d="M5 11h14c-.4 5.2-3 8-7 8s-6.6-2.8-7-8Z" /><path d="M8 8c.6-1.8 1.9-3 4-3s3.4 1.2 4 3M4 11h16" /></svg>;
    case "sauce":
      return <svg {...common}><path d="M10 4h4v3h-4zM9 7h6l1 13H8L9 7Z" /><path d="M9 12h6" /></svg>;
    case "package":
      return <svg {...common}><path d="m4 8 8-4 8 4-8 4-8-4Z" /><path d="M4 8v8l8 4 8-4V8M12 12v8" /></svg>;
    case "chart":
      return <svg {...common}><path d="M4 19V5M4 19h17" /><path d="m7 15 4-4 3 2 5-6" /><path d="M16 7h3v3" /></svg>;
    case "eye":
      return <svg {...common}><path d="M2.5 12s3.4-5 9.5-5 9.5 5 9.5 5-3.4 5-9.5 5-9.5-5-9.5-5Z" /><circle cx="12" cy="12" r="2.2" /></svg>;
    case "pig":
      return <svg {...common}><path d="M5 13c0-4 3-7 8-7 2 0 4 .7 5.3 2.1 1.4 0 2.7.6 3.7 1.9l-1.5 1.4.3 2.6-2 .2c-.8 2.2-2.8 3.8-5.8 3.8H9l-2 2H5l1-3.2c-.7-1-1-2.3-1-3.8Z" /><circle cx="17" cy="10" r=".7" /><path d="M19 14h2M8 12h.01" /></svg>;
    case "check":
      return <svg {...common}><circle cx="12" cy="12" r="9" /><path d="m8 12 2.5 2.5L16.5 9" /></svg>;
    case "alert":
      return <svg {...common}><path d="m12 3 9 17H3L12 3Z" /><path d="M12 9v4M12 17h.01" /></svg>;
    case "filter":
      return <svg {...common}><path d="M4 5h16M7 12h10M10 19h4" /></svg>;
    case "columns":
      return <svg {...common}><rect x="4" y="4" width="6" height="16" rx="1" /><rect x="14" y="4" width="6" height="16" rx="1" /></svg>;
    case "plus":
      return <svg {...common}><path d="M12 5v14M5 12h14" /></svg>;
    case "upload":
      return <svg {...common}><path d="M12 16V4M8 8l4-4 4 4M5 20h14" /></svg>;
    case "download":
      return <svg {...common}><path d="M12 4v12M8 12l4 4 4-4M5 20h14" /></svg>;
    case "edit":
      return <svg {...common}><path d="m14 5 5 5M4 20l3.5-1 10-10a2.1 2.1 0 0 0-3-3l-10 10L4 20Z" /></svg>;
    case "more":
      return <svg {...common}><circle cx="5" cy="12" r="1" fill="currentColor" stroke="none" /><circle cx="12" cy="12" r="1" fill="currentColor" stroke="none" /><circle cx="19" cy="12" r="1" fill="currentColor" stroke="none" /></svg>;
    case "close":
      return <svg {...common}><path d="m7 7 10 10M17 7 7 17" /></svg>;
    case "refresh":
      return <svg {...common}><path d="M20 7v5h-5M4 17v-5h5" /><path d="M6.2 9A7 7 0 0 1 18.6 7M17.8 15A7 7 0 0 1 5.4 17" /></svg>;
    case "history":
      return <svg {...common}><path d="M3 12a9 9 0 1 0 3-6.7" /><path d="M3 4v5h5M12 7v5l3 2" /></svg>;
    case "branches":
      return <svg {...common}><path d="M4 21V5l8-3 8 3v16" /><path d="M8 21v-5h8v5M8 8h.01M12 8h.01M16 8h.01M8 12h.01M12 12h.01M16 12h.01" /></svg>;
    case "lock":
      return <svg {...common}><rect x="5" y="10" width="14" height="11" rx="2" /><path d="M8 10V7a4 4 0 0 1 8 0v3M12 14v3" /></svg>;
  }
}
