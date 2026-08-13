"use client";

import type { MouseEvent, ReactNode } from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  beginAdminInteraction,
  completeAdminInteractionNextFrame,
  type AdminPerformanceSurface,
} from "@/lib/admin/performance";

export type UrlLocalDialogControllerProps<T> = {
  children: ReactNode;
  records: T[];
  initialId: string | null;
  queryKey: string;
  triggerSelector: string;
  readTriggerId: (trigger: HTMLElement) => string | null;
  getRecordId: (record: T) => string;
  renderDialog: (record: T, close: () => void) => ReactNode;
  className?: string;
  performanceSurface?: AdminPerformanceSurface;
};

export function UrlLocalDialogController<T>({
  children,
  records,
  initialId,
  queryKey,
  triggerSelector,
  readTriggerId,
  getRecordId,
  renderDialog,
  className,
  performanceSurface,
}: UrlLocalDialogControllerProps<T>) {
  const [openId, setOpenId] = useState(initialId);
  const [openedFromList, setOpenedFromList] = useState(false);
  const recordById = useMemo(() => new Map(records.map((record) => [getRecordId(record), record])), [getRecordId, records]);

  useEffect(() => {
    function handlePopState() {
      const nextId = new URL(window.location.href).searchParams.get(queryKey);
      const nextRecord = nextId ? recordById.get(nextId) : undefined;
      setOpenId(nextRecord ? nextId : null);
      setOpenedFromList(false);
    }

    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, [queryKey, recordById, performanceSurface]);

  const openRecord = useCallback((recordId: string) => {
    if (!recordById.has(recordId)) return;

    const interaction = performanceSurface ? beginAdminInteraction(performanceSurface, "open") : null;
    const url = new URL(window.location.href);
    url.searchParams.set(queryKey, recordId);
    window.history.pushState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
    setOpenedFromList(true);
    setOpenId(recordId);
    completeAdminInteractionNextFrame(interaction, {
      record_cached: true,
      request_started: false,
      route_changed: false,
    });
  }, [performanceSurface, queryKey, recordById]);

  const closeRecord = useCallback(() => {
    if (!openId) return;

    const interaction = performanceSurface ? beginAdminInteraction(performanceSurface, "close") : null;
    const url = new URL(window.location.href);
    const openedRecordIsCurrent = url.searchParams.get(queryKey) === openId;
    if (openedFromList && openedRecordIsCurrent) {
      setOpenedFromList(false);
      setOpenId(null);
      window.history.back();
      completeAdminInteractionNextFrame(interaction, {
        record_cached: true,
        request_started: false,
        route_changed: false,
      });
      return;
    }

    url.searchParams.delete(queryKey);
    window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
    setOpenedFromList(false);
    setOpenId(null);
    completeAdminInteractionNextFrame(interaction, {
      record_cached: true,
      request_started: false,
      route_changed: false,
    });
  }, [openId, openedFromList, performanceSurface, queryKey]);

  const handleClick = useCallback((event: MouseEvent<HTMLDivElement>) => {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    if (!(event.target instanceof Element)) return;

    const trigger = event.target.closest<HTMLElement>(triggerSelector);
    if (!trigger || !event.currentTarget.contains(trigger)) return;
    const recordId = readTriggerId(trigger);
    if (!recordId || !recordById.has(recordId)) return;
    event.preventDefault();
    openRecord(recordId);
  }, [openRecord, readTriggerId, recordById, triggerSelector]);

  const record = openId ? recordById.get(openId) : null;

  return (
    <div className={className} onClickCapture={handleClick}>
      {children}
      {record ? renderDialog(record, closeRecord) : null}
    </div>
  );
}
