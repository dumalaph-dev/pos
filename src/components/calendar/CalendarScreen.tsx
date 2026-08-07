"use client";

import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { AdminIcon } from "@/components/admin/AdminIcon";
import { AdminLink as Link } from "@/components/admin/AdminLink";
import { SignOutButton } from "@/components/SignOutButton";
import styles from "./CalendarScreen.module.css";

type EventCategory = "holiday" | "order" | "delivery" | "promotion" | "other";

type CalendarEvent = {
  id: string;
  title: string;
  date: string;
  time: string | null;
  allDay: boolean;
  category: EventCategory;
  notes: string;
};

type EventDraft = {
  title: string;
  date: string;
  time: string;
  allDay: boolean;
  category: EventCategory;
  notes: string;
};

type PanelName = "search" | "notifications" | "help" | "profile" | "filters" | "view";

const EVENTS_STORAGE_KEY = "dumala.calendar.events.v2";
const FILTER_STORAGE_KEY = "dumala.calendar.filters.v1";

const CATEGORY_OPTIONS: Array<{
  id: EventCategory;
  label: string;
  icon: "calendar" | "bag" | "suppliers" | "star" | "tag";
}> = [
  { id: "holiday", label: "Holiday / Closed", icon: "calendar" },
  { id: "order", label: "Scheduled Order", icon: "bag" },
  { id: "delivery", label: "Supplier / Delivery", icon: "suppliers" },
  { id: "promotion", label: "Promotion", icon: "star" },
  { id: "other", label: "Event / Others", icon: "tag" },
];

const DEFAULT_FILTERS: Record<EventCategory, boolean> = {
  holiday: true,
  order: true,
  delivery: true,
  promotion: true,
  other: true,
};

function pad(value: number) {
  return String(value).padStart(2, "0");
}

function toDateKey(date: Date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function parseDateKey(key: string) {
  const [year, month, day] = key.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function monthTitle(date: Date) {
  return new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric" }).format(date);
}

function dateLabel(key: string, options: Intl.DateTimeFormatOptions) {
  return new Intl.DateTimeFormat("en-US", options).format(parseDateKey(key));
}

function shortDateLabel(key: string) {
  return dateLabel(key, { month: "short", day: "numeric" });
}

function timeLabel(time: string | null) {
  if (!time) return "All day";
  const [rawHours, rawMinutes] = time.split(":").map(Number);
  const hours = rawHours % 12 || 12;
  return `${hours}:${pad(rawMinutes)} ${rawHours >= 12 ? "PM" : "AM"}`;
}

function monthCells(viewMonth: Date) {
  const firstDay = new Date(viewMonth.getFullYear(), viewMonth.getMonth(), 1);
  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(viewMonth.getFullYear(), viewMonth.getMonth(), 1 - firstDay.getDay() + index);
    return {
      key: toDateKey(date),
      date,
      day: date.getDate(),
      inMonth: date.getMonth() === viewMonth.getMonth(),
    };
  });
}

function shiftMonth(date: Date, amount: number) {
  return new Date(date.getFullYear(), date.getMonth() + amount, 1);
}

function categoryById(id: EventCategory) {
  return CATEGORY_OPTIONS.find((category) => category.id === id) ?? CATEGORY_OPTIONS[0];
}

function categoryClass(id: EventCategory) {
  return styles[`category${id.charAt(0).toUpperCase()}${id.slice(1)}` as keyof typeof styles];
}

function createEventId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  return `event-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function createDraft(date: string): EventDraft {
  return { title: "", date, time: "09:00", allDay: false, category: "other", notes: "" };
}

function isEventCategory(value: unknown): value is EventCategory {
  return typeof value === "string" && CATEGORY_OPTIONS.some((category) => category.id === value);
}

function isDateKey(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = parseDateKey(value);
  return Number.isFinite(date.getTime()) && toDateKey(date) === value;
}

function isTimeValue(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{2}:\d{2}$/.test(value)) return false;
  const [hours, minutes] = value.split(":").map(Number);
  return hours >= 0 && hours <= 23 && minutes >= 0 && minutes <= 59;
}

function parseStoredEvent(value: unknown): CalendarEvent | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Partial<CalendarEvent>;
  const id = typeof candidate.id === "string" ? candidate.id.trim() : "";
  const title = typeof candidate.title === "string" ? candidate.title.trim() : "";
  const notes = typeof candidate.notes === "string" ? candidate.notes : "";
  const time = candidate.time === null || candidate.time === undefined ? null : candidate.time;

  if (!id || !title || !isDateKey(candidate.date) || !isEventCategory(candidate.category) || typeof candidate.allDay !== "boolean") return null;
  if (time !== null && !isTimeValue(time)) return null;

  return { id, title, date: candidate.date, time: candidate.allDay ? null : time, allDay: candidate.allDay, category: candidate.category, notes };
}

function readStoredEvents(storageKey: string) {
  try {
    const raw = window.localStorage.getItem(storageKey);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    const seenIds = new Set<string>();
    return parsed
      .map(parseStoredEvent)
      .filter((event): event is CalendarEvent => {
        if (!event || seenIds.has(event.id)) return false;
        seenIds.add(event.id);
        return true;
      });
  } catch {
    return [];
  }
}

function readStoredFilters(storageKey: string) {
  try {
    const raw = window.localStorage.getItem(storageKey);
    if (!raw) return DEFAULT_FILTERS;
    const value = JSON.parse(raw) as unknown;
    const parsed = value && typeof value === "object" ? value as Partial<Record<EventCategory, boolean>> : {};
    return CATEGORY_OPTIONS.reduce<Record<EventCategory, boolean>>((filters, category) => {
      filters[category.id] = parsed[category.id] !== false;
      return filters;
    }, { ...DEFAULT_FILTERS });
  } catch {
    return DEFAULT_FILTERS;
  }
}

function persistCalendarState(eventsStorageKey: string, filterStorageKey: string, events: CalendarEvent[], filters: Record<EventCategory, boolean>) {
  try {
    window.localStorage.setItem(eventsStorageKey, JSON.stringify(events));
    window.localStorage.setItem(filterStorageKey, JSON.stringify(filters));
  } catch {
    // Private browsing modes and full storage quotas should not break the calendar.
  }
}

export function CalendarScreen({ userName = "Admin", userRole = "Admin", storageScope = "local" }: { userName?: string; userRole?: string; storageScope?: string }) {
  const storageSuffix = encodeURIComponent(storageScope.trim() || "local");
  const eventsStorageKey = `${EVENTS_STORAGE_KEY}.${storageSuffix}`;
  const filterStorageKey = `${FILTER_STORAGE_KEY}.${storageSuffix}`;
  const storageIdentity = `${eventsStorageKey}|${filterStorageKey}`;
  const [viewMonth, setViewMonth] = useState(() => {
    const today = new Date();
    return new Date(today.getFullYear(), today.getMonth(), 1);
  });
  const [selectedDate, setSelectedDate] = useState(() => toDateKey(new Date()));
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [filters, setFilters] = useState<Record<EventCategory, boolean>>(DEFAULT_FILTERS);
  const [hydrated, setHydrated] = useState(false);
  const [openPanel, setOpenPanel] = useState<PanelName | null>(null);
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [categoryManagerOpen, setCategoryManagerOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<EventDraft>(() => createDraft(toDateKey(new Date())));
  const [formError, setFormError] = useState("");
  const [toast, setToast] = useState("");
  const modalTriggerRef = useRef<HTMLElement | null>(null);
  const hydratedStorageRef = useRef<string | null>(null);
  const todayKey = useMemo(() => toDateKey(new Date()), []);
  const cells = useMemo(() => monthCells(viewMonth), [viewMonth]);

  useEffect(() => {
    const hydrate = window.setTimeout(() => {
      setEvents(readStoredEvents(eventsStorageKey));
      setFilters(readStoredFilters(filterStorageKey));
      hydratedStorageRef.current = storageIdentity;
      setHydrated(true);
    }, 0);
    return () => window.clearTimeout(hydrate);
  }, [eventsStorageKey, filterStorageKey, storageIdentity]);

  useEffect(() => {
    if (!hydrated || hydratedStorageRef.current !== storageIdentity) return;
    persistCalendarState(eventsStorageKey, filterStorageKey, events, filters);
  }, [events, eventsStorageKey, filterStorageKey, filters, hydrated, storageIdentity]);

  useEffect(() => {
    if (!toast) return;
    const timeout = window.setTimeout(() => setToast(""), 2600);
    return () => window.clearTimeout(timeout);
  }, [toast]);

  useEffect(() => {
    if (!dialogOpen && !categoryManagerOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [categoryManagerOpen, dialogOpen]);

  useEffect(() => {
    if (dialogOpen || categoryManagerOpen) return;
    const trigger = modalTriggerRef.current;
    modalTriggerRef.current = null;
    if (trigger?.isConnected) {
      trigger.focus();
      return;
    }
    document.querySelector<HTMLElement>("[data-calendar-primary-action]")?.focus();
  }, [categoryManagerOpen, dialogOpen]);

  useEffect(() => {
    if (!openPanel) return;
    function closeOnOutsideClick(event: PointerEvent) {
      const target = event.target;
      if (!(target instanceof Element)) return;
      if (target.closest("[data-calendar-popover], [data-calendar-trigger]")) return;
      setOpenPanel(null);
    }
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setOpenPanel(null);
    }
    document.addEventListener("pointerdown", closeOnOutsideClick);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsideClick);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [openPanel]);

  useEffect(() => {
    if (!dialogOpen && !categoryManagerOpen) return;
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setDialogOpen(false);
        setCategoryManagerOpen(false);
      }
    }
    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  }, [categoryManagerOpen, dialogOpen]);

  const filteredEvents = useMemo(() => {
    const query = search.trim().toLowerCase();
    return events.filter((event) => {
      if (!filters[event.category]) return false;
      if (!query) return true;
      return `${event.title} ${event.notes}`.toLowerCase().includes(query);
    });
  }, [events, filters, search]);

  const eventsByDate = useMemo(() => {
    const byDate = new Map<string, CalendarEvent[]>();
    for (const event of filteredEvents) {
      const existing = byDate.get(event.date) ?? [];
      existing.push(event);
      byDate.set(event.date, existing);
    }
    return byDate;
  }, [filteredEvents]);

  const upcomingEvents = useMemo(() => {
    const selectedTime = parseDateKey(selectedDate).getTime();
    return filteredEvents
      .filter((event) => event.date.startsWith(`${viewMonth.getFullYear()}-${pad(viewMonth.getMonth() + 1)}`))
      .sort((a, b) => {
        const dateDistance = Math.abs(parseDateKey(a.date).getTime() - selectedTime) - Math.abs(parseDateKey(b.date).getTime() - selectedTime);
        if (dateDistance !== 0) return dateDistance;
        return (a.time ?? "00:00").localeCompare(b.time ?? "00:00");
      })
      .slice(0, 4);
  }, [filteredEvents, selectedDate, viewMonth]);

  const profileInitial = userName.trim().charAt(0).toUpperCase() || "A";

  function rememberFocus() {
    const activeElement = document.activeElement;
    modalTriggerRef.current = activeElement instanceof HTMLElement ? activeElement : null;
  }

  function setPanel(panel: PanelName) {
    setOpenPanel((current) => current === panel ? null : panel);
  }

  function goToToday() {
    const today = new Date();
    setViewMonth(new Date(today.getFullYear(), today.getMonth(), 1));
    setSelectedDate(toDateKey(today));
    setOpenPanel(null);
  }

  function selectDate(dateKey: string) {
    const date = parseDateKey(dateKey);
    setSelectedDate(dateKey);
    if (date.getMonth() !== viewMonth.getMonth() || date.getFullYear() !== viewMonth.getFullYear()) {
      setViewMonth(new Date(date.getFullYear(), date.getMonth(), 1));
    }
  }

  function openCreateEvent(date = selectedDate) {
    rememberFocus();
    setEditingId(null);
    setDraft(createDraft(date));
    setFormError("");
    setDialogOpen(true);
    setOpenPanel(null);
  }

  function openEditEvent(event: CalendarEvent) {
    rememberFocus();
    setEditingId(event.id);
    setSelectedDate(event.date);
    setViewMonth(new Date(parseDateKey(event.date).getFullYear(), parseDateKey(event.date).getMonth(), 1));
    setDraft({ title: event.title, date: event.date, time: event.time ?? "09:00", allDay: event.allDay, category: event.category, notes: event.notes });
    setFormError("");
    setDialogOpen(true);
    setOpenPanel(null);
  }

  function saveEvent(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const title = draft.title.trim();
    if (!title) {
      setFormError("Add a title so the event is easy to find.");
      return;
    }
    if (!isDateKey(draft.date)) {
      setFormError("Choose a date for this event.");
      return;
    }
    if (!draft.allDay && !isTimeValue(draft.time)) {
      setFormError("Choose a valid time for this event.");
      return;
    }

    const nextEvent: CalendarEvent = {
      id: editingId ?? createEventId(),
      title,
      date: draft.date,
      time: draft.allDay ? null : draft.time || "09:00",
      allDay: draft.allDay,
      category: draft.category,
      notes: draft.notes.trim(),
    };

    setEvents((current) => editingId ? current.map((item) => item.id === editingId ? nextEvent : item) : [...current, nextEvent]);
    selectDate(nextEvent.date);
    setDialogOpen(false);
    setToast(editingId ? "Event updated" : "Event added to your calendar");
  }

  function deleteEvent() {
    if (!editingId) return;
    setEvents((current) => current.filter((event) => event.id !== editingId));
    setDialogOpen(false);
    setToast("Event deleted");
  }

  function toggleFilter(category: EventCategory) {
    setFilters((current) => ({ ...current, [category]: !current[category] }));
  }

  return (
    <div className={`${styles.page} ${styles.pageInner}`}>
      <header className={styles.pageHeader}>
        <div>
          <h1>Calendar</h1>
          <p>View and manage important dates, events, and schedules.</p>
        </div>

        <div className={styles.utilityArea} role="group" aria-label="Calendar utilities">
          <button type="button" className={styles.utilityButton} data-calendar-trigger aria-label="Search calendar" aria-expanded={openPanel === "search"} onClick={() => setPanel("search")}>
            <AdminIcon name="search" size={22} />
          </button>
          <button type="button" className={`${styles.utilityButton} ${styles.utilityAlert}`} data-calendar-trigger aria-label="Calendar notifications" aria-expanded={openPanel === "notifications"} onClick={() => setPanel("notifications")}>
            <AdminIcon name="bell" size={22} />
            {events.length > 0 && <span className={styles.utilityBadge}>1</span>}
          </button>
          <button type="button" className={styles.utilityButton} data-calendar-trigger aria-label="Calendar help" aria-expanded={openPanel === "help"} onClick={() => setPanel("help")}>
            <AdminIcon name="help" size={21} />
          </button>
          <button type="button" className={styles.profileButton} data-calendar-trigger aria-label={`Account menu for ${userName}`} aria-expanded={openPanel === "profile"} onClick={() => setPanel("profile")}>
            <span className={styles.profileAvatar} aria-hidden="true">{profileInitial}</span>
            <span className={styles.profileCopy}><strong>{userName}</strong><small>{userRole}</small></span>
            <span className={`${styles.iconChevron} ${openPanel === "profile" ? styles.iconChevronOpen : ""}`} aria-hidden="true">⌄</span>
          </button>

          {openPanel === "search" && (
            <div className={`${styles.utilityPopover} ${styles.searchPopover}`} data-calendar-popover>
              <label className={styles.searchField}>
                <span className={styles.srOnly}>Search event titles and notes</span>
                <AdminIcon name="search" size={16} />
                <input autoFocus value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search events" />
              </label>
              <p>{search ? `${filteredEvents.length} matching event${filteredEvents.length === 1 ? "" : "s"}` : "Search by title or note."}</p>
            </div>
          )}

          {openPanel === "notifications" && (
            <div className={styles.utilityPopover} data-calendar-popover>
              <p className={styles.popoverEyebrow}>Notifications</p>
              <strong className={styles.popoverTitle}>{events.length ? "Your calendar is up to date" : "No reminders yet"}</strong>
              <p className={styles.popoverCopy}>{events.length ? `${events.length} event${events.length === 1 ? "" : "s"} are saved on this device.` : "Add an event to start building your schedule."}</p>
              <button type="button" className={styles.popoverAction} onClick={() => openCreateEvent()}>Add an event <AdminIcon name="arrow" size={14} /></button>
            </div>
          )}

          {openPanel === "help" && (
            <div className={styles.utilityPopover} data-calendar-popover>
              <p className={styles.popoverEyebrow}>Calendar help</p>
              <strong className={styles.popoverTitle}>Plan the work ahead.</strong>
              <p className={styles.popoverCopy}>Use Add Event or Quick Add Event to save an event. Select any event on the grid to edit or remove it.</p>
            </div>
          )}

          {openPanel === "profile" && (
            <div className={`${styles.utilityPopover} ${styles.profilePopover}`} data-calendar-popover>
              <div className={styles.profilePopoverHeader}><span className={styles.profileAvatar}>{profileInitial}</span><span><strong>{userName}</strong><small>{userRole}</small></span></div>
              <Link href="/admin" className={styles.profileMenuLink}>Back to dashboard</Link>
              <Link href="/admin/settings" className={styles.profileMenuLink}>Settings</Link>
              <SignOutButton variant="menu" className={styles.profileSignOut} />
            </div>
          )}
        </div>
      </header>

      <div className={styles.workspace}>
        <section className={styles.calendarCard} aria-label={`${monthTitle(viewMonth)} calendar`}>
          <div className={styles.calendarToolbar}>
            <div className={styles.monthControls}>
              <button type="button" className={`${styles.squareButton} ${styles.previousButton}`} aria-label="Previous month" onClick={() => setViewMonth((current) => shiftMonth(current, -1))}><AdminIcon name="arrow" size={19} /></button>
              <button type="button" className={styles.todayButton} onClick={goToToday}>Today</button>
              <button type="button" className={`${styles.squareButton} ${styles.nextButton}`} aria-label="Next month" onClick={() => setViewMonth((current) => shiftMonth(current, 1))}><AdminIcon name="arrow" size={19} /></button>
              <div className={styles.monthTitleWrap}>
                <h2>{monthTitle(viewMonth)}</h2>
                <span className={styles.monthTitleChevron}><AdminIcon name="chevron" size={16} /></span>
              </div>
            </div>

            <div className={styles.toolbarActions}>
              <div className={styles.toolbarPopoverAnchor}>
                <button type="button" className={styles.toolbarButton} data-calendar-trigger aria-expanded={openPanel === "filters"} onClick={() => setPanel("filters")}><AdminIcon name="filter" size={17} /> Filters {search || Object.values(filters).some((value) => !value) ? <span className={styles.filterCount}>{search ? "1" : Object.values(filters).filter((value) => !value).length}</span> : null}</button>
                {openPanel === "filters" && (
                  <div className={`${styles.popover} ${styles.filterPopover}`} data-calendar-popover>
                    <div className={styles.popoverHeader}><div><p className={styles.popoverEyebrow}>Filter by</p><strong className={styles.popoverTitle}>Event categories</strong></div><button type="button" className={styles.textButton} onClick={() => setFilters({ ...DEFAULT_FILTERS })}>Reset</button></div>
                    <div className={styles.filterList}>
                      {CATEGORY_OPTIONS.map((category) => (
                        <label key={category.id} className={styles.filterRow}>
                          <input type="checkbox" checked={filters[category.id]} onChange={() => toggleFilter(category.id)} />
                          <span className={`${styles.categoryDot} ${categoryClass(category.id)}`} aria-hidden="true" />
                          <span>{category.label}</span>
                        </label>
                      ))}
                    </div>
                    <button type="button" className={styles.manageButton} onClick={() => { rememberFocus(); setCategoryManagerOpen(true); setOpenPanel(null); }}>Manage categories <AdminIcon name="arrow" size={13} /></button>
                  </div>
                )}
              </div>

              <div className={styles.toolbarPopoverAnchor}>
                <button type="button" className={styles.toolbarButton} data-calendar-trigger aria-expanded={openPanel === "view"} onClick={() => setPanel("view")}><AdminIcon name="calendar" size={17} /> Month <AdminIcon name="chevron" size={15} /></button>
                {openPanel === "view" && (
                  <div className={`${styles.popover} ${styles.viewPopover}`} data-calendar-popover>
                    <p className={styles.popoverEyebrow}>Calendar view</p>
                    <button type="button" className={`${styles.viewOption} ${styles.viewOptionActive}`} onClick={() => setOpenPanel(null)}><span>Month</span><AdminIcon name="check" size={15} /></button>
                    <button type="button" className={styles.viewOption} disabled><span>Week</span><small>Coming soon</small></button>
                  </div>
                )}
              </div>

              <button type="button" className={styles.addEventButton} data-calendar-primary-action onClick={() => openCreateEvent()}><AdminIcon name="plus" size={18} /> Add Event</button>
            </div>
          </div>

          <div className={styles.calendarViewport} role="grid" aria-label={`${monthTitle(viewMonth)} calendar grid`}>
            <div className={styles.weekdayRow} role="row">
              {['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'].map((weekday) => <div key={weekday} role="columnheader">{weekday}</div>)}
            </div>
            <div className={styles.calendarCells} role="rowgroup">
              {cells.map((cell) => {
                const cellEvents = cell.inMonth ? (eventsByDate.get(cell.key) ?? []) : [];
                const isSelected = cell.key === selectedDate;
                const isToday = cell.key === todayKey;
                return (
                  <div key={cell.key} className={`${styles.calendarCell} ${cell.inMonth ? "" : styles.calendarCellOutside} ${isSelected ? styles.calendarCellSelected : ""}`} role="gridcell" aria-selected={isSelected} onClick={() => selectDate(cell.key)}>
                    <button type="button" className={`${styles.dayButton} ${isSelected ? styles.dayButtonSelected : ""} ${isToday ? styles.dayButtonToday : ""}`} onClick={(event) => { event.stopPropagation(); selectDate(cell.key); }} aria-label={dateLabel(cell.key, { weekday: "long", month: "long", day: "numeric", year: "numeric" })}>
                      {cell.day}
                    </button>
                    <div className={styles.eventStack}>
                      {cellEvents.map((event) => (
                        <button key={event.id} type="button" className={`${styles.eventCard} ${categoryClass(event.category)}`} onClick={(clickEvent) => { clickEvent.stopPropagation(); openEditEvent(event); }} title={`${event.title}, ${dateLabel(event.date, { month: "long", day: "numeric" })}, ${timeLabel(event.time)}`}>
                          <span className={styles.eventCardTitle}><AdminIcon name={categoryById(event.category).icon} size={12} /> <span>{event.title}</span></span>
                          <span className={styles.eventCardTime}>{timeLabel(event.time)}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className={styles.legend} aria-label="Calendar event legend">
            {CATEGORY_OPTIONS.map((category) => <span key={category.id}><i className={`${styles.legendDot} ${categoryClass(category.id)}`} aria-hidden="true" />{category.label}</span>)}
          </div>
        </section>

        <aside className={styles.sidebar}>
          <section className={styles.sideCard} aria-labelledby="mini-calendar-heading">
            <div className={styles.sideCardHeader}><h2 id="mini-calendar-heading">Mini Calendar</h2></div>
            <div className={styles.miniCalendarHeader}><button type="button" aria-label="Previous month" onClick={() => setViewMonth((current) => shiftMonth(current, -1))}>‹</button><strong>{monthTitle(viewMonth)}</strong><button type="button" aria-label="Next month" onClick={() => setViewMonth((current) => shiftMonth(current, 1))}>›</button></div>
            <div className={styles.miniWeekdays}>{['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((weekday, index) => <span key={`${weekday}-${index}`}>{weekday}</span>)}</div>
            <div className={styles.miniGrid}>
              {cells.map((cell) => <button key={`mini-${cell.key}`} type="button" className={`${styles.miniDay} ${cell.inMonth ? "" : styles.miniDayOutside} ${cell.key === selectedDate ? styles.miniDaySelected : ""}`} onClick={() => selectDate(cell.key)} aria-label={dateLabel(cell.key, { month: "long", day: "numeric", year: "numeric" })}>{cell.day}</button>)}
            </div>
          </section>

          <section className={styles.sideCard} aria-labelledby="categories-heading">
            <div className={styles.sideCardHeader}><h2 id="categories-heading">Event Categories</h2><button type="button" className={styles.managePill} onClick={() => { rememberFocus(); setCategoryManagerOpen(true); setOpenPanel(null); }}>Manage</button></div>
            <div className={styles.categoryList}>
              {CATEGORY_OPTIONS.map((category) => <label key={category.id} className={styles.categoryRow}><span className={`${styles.categoryDot} ${categoryClass(category.id)}`} /><span>{category.label}</span><input type="checkbox" checked={filters[category.id]} onChange={() => toggleFilter(category.id)} aria-label={`Show ${category.label}`} /></label>)}
            </div>
          </section>

          <section className={styles.sideCard} aria-labelledby="upcoming-heading">
            <div className={styles.sideCardHeader}><h2 id="upcoming-heading">Upcoming Events</h2><button type="button" className={styles.viewAllButton} onClick={goToToday}>View all</button></div>
            <div className={styles.upcomingList}>
              {upcomingEvents.length === 0 ? <p className={styles.emptyMessage}>No events match the active filters.</p> : upcomingEvents.map((event) => <button key={`upcoming-${event.id}`} type="button" className={`${styles.upcomingItem} ${categoryClass(event.category)}`} onClick={() => openEditEvent(event)}><span className={styles.upcomingIcon}><AdminIcon name={categoryById(event.category).icon} size={15} /></span><span className={styles.upcomingCopy}><strong>{event.title}</strong><small>{event.date === todayKey ? "Today" : shortDateLabel(event.date)} · {timeLabel(event.time)}</small></span></button>)}
            </div>
          </section>

          <section className={`${styles.sideCard} ${styles.quickAddCard}`} aria-labelledby="quick-add-heading">
            <div><h2 id="quick-add-heading">Quick Add Event</h2><p>Create a new event in seconds.</p><button type="button" className={styles.quickAddButton} onClick={() => openCreateEvent()}><AdminIcon name="plus" size={16} /> Add Event</button></div>
            <div className={styles.quickIllustration} aria-hidden="true"><span className={styles.illustrationTop} /><span className={styles.illustrationBody}><i /><i /><i /><i /><i /><i /></span><span className={styles.illustrationLeaf}>⌁</span></div>
          </section>
        </aside>
      </div>

      {dialogOpen && (
        <div className={styles.modalBackdrop} role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setDialogOpen(false); }}>
          <section className={styles.modal} role="dialog" aria-modal="true" aria-labelledby="event-dialog-heading" onMouseDown={(event) => event.stopPropagation()}>
            <div className={styles.modalHeader}><div><p className={styles.popoverEyebrow}>{editingId ? "Edit schedule" : "New schedule"}</p><h2 id="event-dialog-heading">{editingId ? "Edit event" : "Add event"}</h2></div><button type="button" className={styles.closeButton} aria-label="Close event form" onClick={() => setDialogOpen(false)}>×</button></div>
            <form onSubmit={saveEvent}>
              <div className={styles.formGrid}>
                <label className={`${styles.formField} ${styles.formFieldWide}`}><span>Event title</span><input autoFocus value={draft.title} onChange={(event) => setDraft((current) => ({ ...current, title: event.target.value }))} maxLength={80} /></label>
                <label className={styles.formField}><span>Date</span><input type="date" value={draft.date} onChange={(event) => setDraft((current) => ({ ...current, date: event.target.value }))} required /></label>
                <label className={styles.formField}><span>Category</span><select value={draft.category} onChange={(event) => setDraft((current) => ({ ...current, category: event.target.value as EventCategory }))}>{CATEGORY_OPTIONS.map((category) => <option key={category.id} value={category.id}>{category.label}</option>)}</select></label>
                <label className={styles.checkField}><input type="checkbox" checked={draft.allDay} onChange={(event) => setDraft((current) => ({ ...current, allDay: event.target.checked }))} /><span><strong>All-day event</strong><small>Hide the time from the calendar card</small></span></label>
                {!draft.allDay && <label className={styles.formField}><span>Time</span><input type="time" value={draft.time} onChange={(event) => setDraft((current) => ({ ...current, time: event.target.value }))} /></label>}
                <label className={`${styles.formField} ${styles.formFieldWide}`}><span>Notes <em>Optional</em></span><textarea value={draft.notes} onChange={(event) => setDraft((current) => ({ ...current, notes: event.target.value }))} rows={3} maxLength={240} /></label>
              </div>
              {formError && <p className={styles.formError} role="alert">{formError}</p>}
              <div className={styles.modalActions}><button type="button" className={styles.cancelButton} onClick={() => setDialogOpen(false)}>Cancel</button>{editingId && <button type="button" className={styles.deleteButton} onClick={deleteEvent}>Delete</button>}<button type="submit" className={styles.saveButton}>{editingId ? "Save changes" : "Add Event"}</button></div>
            </form>
          </section>
        </div>
      )}

      {categoryManagerOpen && (
        <div className={styles.modalBackdrop} role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setCategoryManagerOpen(false); }}>
          <section className={`${styles.modal} ${styles.categoryModal}`} role="dialog" aria-modal="true" aria-labelledby="category-dialog-heading" onMouseDown={(event) => event.stopPropagation()}>
            <div className={styles.modalHeader}><div><p className={styles.popoverEyebrow}>Calendar settings</p><h2 id="category-dialog-heading">Manage categories</h2></div><button type="button" className={styles.closeButton} aria-label="Close category manager" onClick={() => setCategoryManagerOpen(false)}>×</button></div>
            <p className={styles.modalIntro}>Choose which event types remain visible on the calendar and in the upcoming list.</p>
            <div className={styles.managerList}>{CATEGORY_OPTIONS.map((category) => <label key={`manager-${category.id}`} className={styles.managerRow}><span className={`${styles.categoryDot} ${categoryClass(category.id)}`} /><span><strong>{category.label}</strong><small>{events.filter((event) => event.category === category.id).length} saved event{events.filter((event) => event.category === category.id).length === 1 ? "" : "s"}</small></span><input type="checkbox" checked={filters[category.id]} onChange={() => toggleFilter(category.id)} /></label>)}</div>
            <div className={styles.modalActions}><button type="button" className={styles.saveButton} onClick={() => setCategoryManagerOpen(false)}>Done</button></div>
          </section>
        </div>
      )}

      {toast && <div className={styles.toast} role="status">{toast}</div>}
    </div>
  );
}

export default CalendarScreen;
