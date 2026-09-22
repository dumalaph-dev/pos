"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { AdminIcon } from "./AdminIcon";
import { AdminLink as Link } from "./AdminLink";
import { CashierTabletCard } from "./CashierTabletCard";
import {
  CATEGORY_FILTERS,
  GLOSSARY,
  GUIDE_FAQS,
  QUICK_LINKS,
  ROLE_LABELS,
  ROLE_OPTIONS,
  ROLE_PLAYBOOKS,
  TOPIC_TO_FAQ,
  WORKFLOWS,
  type GuideCategory,
  type GuideFaq,
  type GuideRole,
  type GuideTopic,
} from "./admin-guide-data";
import type { StaffLoginLink } from "@/lib/admin/staff-links";
import styles from "./AdminGuide.module.css";

export type { GuideRole };

const DEFAULT_ROLE: GuideRole = "admin";

function roleForProfile(role: GuideRole | null | undefined): GuideRole {
  return role === "cashier" || role === "manager" || role === "team" ? role : DEFAULT_ROLE;
}

function faqMatches(faq: GuideFaq, query: string) {
  if (!query) return true;
  const haystack = [faq.question, faq.answer, faq.category, ...faq.steps ?? [], ...faq.tags].join(" ").toLowerCase();
  return haystack.includes(query);
}

export function AdminGuide({
  currentRole,
  organizationName,
  initialTopic,
  staffLinks = [],
  staffLinksLegacyOnly = false,
  canSeeStaffLinks = false,
}: {
  currentRole?: GuideRole | null;
  organizationName?: string;
  initialTopic?: GuideTopic;
  staffLinks?: StaffLoginLink[];
  staffLinksLegacyOnly?: boolean;
  canSeeStaffLinks?: boolean;
}) {
  const [activeRole, setActiveRole] = useState<GuideRole>(roleForProfile(currentRole));
  const [activeCategory, setActiveCategory] = useState<"All" | GuideCategory>("All");
  const [query, setQuery] = useState("");
  const [openFaqId, setOpenFaqId] = useState<string | null>(initialTopic ? TOPIC_TO_FAQ[initialTopic] : null);
  const searchRef = useRef<HTMLInputElement>(null);
  const workflow = WORKFLOWS[activeRole];
  const playbook = ROLE_PLAYBOOKS[activeRole];
  const normalizedQuery = query.trim().toLowerCase();

  const visibleFaqs = useMemo(() => {
    return GUIDE_FAQS
      .filter((faq) => activeCategory === "All" || faq.category === activeCategory)
      .filter((faq) => faqMatches(faq, normalizedQuery))
      .sort((first, second) => {
        const firstRecommended = first.audiences.includes(activeRole) ? 0 : 1;
        const secondRecommended = second.audiences.includes(activeRole) ? 0 : 1;
        return firstRecommended - secondRecommended;
      });
  }, [activeCategory, activeRole, normalizedQuery]);

  const roleFaqCount = useMemo(
    () => GUIDE_FAQS.filter((faq) => faq.audiences.includes(activeRole)).length,
    [activeRole],
  );

  useEffect(() => {
    function focusSearch(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        searchRef.current?.focus();
      }
    }

    document.addEventListener("keydown", focusSearch);
    return () => document.removeEventListener("keydown", focusSearch);
  }, []);

  useEffect(() => {
    if (!initialTopic) return;
    const faqId = TOPIC_TO_FAQ[initialTopic];
    const frame = window.requestAnimationFrame(() => {
      const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      document.getElementById(`guide-faq-${faqId}`)?.scrollIntoView({ block: "center", behavior: reduceMotion ? "auto" : "smooth" });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [initialTopic]);

  function selectRole(role: GuideRole) {
    setActiveRole(role);
    setOpenFaqId(null);
  }

  return (
    <div className={styles.workspace}>
      <section className={styles.hero} aria-labelledby="guide-title">
        <div className={styles.heroCopy}>
          <p className={styles.eyebrow}>Help &amp; Guide</p>
          <h1 id="guide-title">Run your store with confidence.</h1>
          <p className={styles.heroLead}>
            Practical answers for every shift, count, report, and team task{organizationName ? ` at ${organizationName}` : ""}.
          </p>
          <div className={styles.heroMeta}>
            <span><AdminIcon name="check" size={14} /> Built for the backoffice</span>
            <span><AdminIcon name="help" size={14} /> {GUIDE_FAQS.length} answers</span>
            <span><AdminIcon name="employees" size={14} /> 4 roles</span>
          </div>
        </div>

        <div className={styles.searchCard}>
          <label className={styles.searchLabel} htmlFor="guide-search">Search the guide</label>
          <div className={styles.searchField}>
            <AdminIcon name="search" size={18} />
            <input
              ref={searchRef}
              id="guide-search"
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Try “cashier tablet” or “Z-reading”"
              autoComplete="off"
            />
            <kbd>⌘ K</kbd>
          </div>
          <p>Search by question, workspace, or task. Use the role guide below for the routine that fits your day.</p>
        </div>
      </section>

      <section id="role-guide" className={styles.roleSection} aria-labelledby="role-guide-title">
        <div className={styles.sectionHeading}>
          <div>
            <p className={styles.sectionEyebrow}>Choose a starting point</p>
            <h2 id="role-guide-title">What are you here to do?</h2>
          </div>
          <p>Switch roles to see the daily rhythm, the first-day checklist, and the FAQs that fit.</p>
        </div>

        <div className={styles.roleSwitcher} role="group" aria-label="Choose your role">
          {ROLE_OPTIONS.map((option) => (
            <button
              key={option.id}
              type="button"
              className={`${styles.roleButton} ${activeRole === option.id ? styles.roleButtonActive : ""}`}
              aria-pressed={activeRole === option.id}
              onClick={() => selectRole(option.id)}
            >
              <span className={styles.roleButtonLabel}>{option.label}</span>
              <span className={styles.roleButtonDetail}>{option.detail}</span>
            </button>
          ))}
        </div>

        <div className={styles.workflowCard}>
          <div className={styles.workflowIntro}>
            <span className={styles.iconTile}><AdminIcon name={workflow.icon} size={23} /></span>
            <div>
              <p className={styles.cardEyebrow}>{workflow.eyebrow}</p>
              <h3>{workflow.title}</h3>
              <p>{workflow.description}</p>
            </div>
          </div>
          <ol className={styles.workflowSteps}>
            {workflow.steps.map((step, index) => (
              <li key={step}>
                <span>{index + 1}</span>
                <p>{step}</p>
              </li>
            ))}
          </ol>
          <Link href={workflow.href} className={styles.workflowLink}>{workflow.linkLabel}<AdminIcon name="arrow" size={15} /></Link>
        </div>

        <div className={styles.playbookGrid}>
          <article className={styles.playbookCard}>
            <p className={styles.cardEyebrow}>First day</p>
            <h3>Getting started as {ROLE_LABELS[activeRole].toLowerCase()}</h3>
            <ol className={styles.playbookChecklist}>
              {playbook.firstDay.map((item) => <li key={item}>{item}</li>)}
            </ol>
          </article>

          <article className={styles.playbookCard}>
            <p className={styles.cardEyebrow}>Permissions</p>
            <h3>What this role can and cannot do</h3>
            <div className={styles.permissionBlock}>
              <p className={styles.permissionLabel}><AdminIcon name="check" size={13} /> Can do without asking</p>
              <ul>{playbook.canDo.map((item) => <li key={item}>{item}</li>)}</ul>
            </div>
            <div className={styles.permissionBlock}>
              <p className={`${styles.permissionLabel} ${styles.permissionLabelLocked}`}><AdminIcon name="lock" size={13} /> Needs an organization admin</p>
              <ul>{playbook.askAdmin.map((item) => <li key={item}>{item}</li>)}</ul>
            </div>
          </article>

          <article className={`${styles.playbookCard} ${styles.playbookCardWarn}`}>
            <p className={styles.cardEyebrow}>Most common mistake</p>
            <h3>Watch out for this one</h3>
            <p className={styles.playbookWatch}>{playbook.watchOut}</p>
            <p className={styles.playbookMeta}>{roleFaqCount} of the {GUIDE_FAQS.length} answers below are written for this role.</p>
          </article>
        </div>
      </section>

      {canSeeStaffLinks && (
        <section id="cashier-device" className={styles.deviceSection} aria-labelledby="cashier-device-title">
          <div className={styles.sectionHeading}>
            <div>
              <p className={styles.sectionEyebrow}>Set up a counter</p>
              <h2 id="cashier-device-title">Get a cashier onto a tablet</h2>
            </div>
            <p>Share one link, install the app, sign in. Three steps, once per device.</p>
          </div>
          <CashierTabletCard links={staffLinks} legacyOnly={staffLinksLegacyOnly} />
        </section>
      )}

      <div className={styles.contentGrid}>
        <section id="guide-faqs" className={styles.faqSection} aria-labelledby="faq-title">
          <div className={styles.sectionHeading}>
            <div>
              <p className={styles.sectionEyebrow}>Answers on demand</p>
              <h2 id="faq-title">Frequently asked questions</h2>
            </div>
            <p aria-live="polite">{visibleFaqs.length} result{visibleFaqs.length === 1 ? "" : "s"}</p>
          </div>

          <div className={styles.categoryScroller} aria-label="Filter guide topics" role="group">
            {CATEGORY_FILTERS.map((category) => (
              <button
                key={category}
                type="button"
                className={`${styles.categoryButton} ${activeCategory === category ? styles.categoryButtonActive : ""}`}
                aria-pressed={activeCategory === category}
                onClick={() => setActiveCategory(category)}
              >
                {category}
              </button>
            ))}
          </div>

          <div className={styles.faqList}>
            {visibleFaqs.length === 0 ? (
              <div className={styles.emptyState}>
                <span className={styles.emptyIcon}><AdminIcon name="search" size={20} /></span>
                <h3>No guide answer yet</h3>
                <p>Try a broader search, or clear the category filter to browse every FAQ.</p>
                <button type="button" onClick={() => { setQuery(""); setActiveCategory("All"); }} className={styles.textButton}>Show all answers</button>
              </div>
            ) : visibleFaqs.map((faq) => {
              const isOpen = openFaqId === faq.id;
              const isRecommended = faq.audiences.includes(activeRole);
              const panelId = `guide-answer-${faq.id}`;
              return (
                <article key={faq.id} id={`guide-faq-${faq.id}`} className={`${styles.faqItem} ${isOpen ? styles.faqItemOpen : ""}`}>
                  <button
                    type="button"
                    className={styles.faqTrigger}
                    aria-expanded={isOpen}
                    aria-controls={panelId}
                    onClick={() => setOpenFaqId(isOpen ? null : faq.id)}
                  >
                    <span className={styles.faqTriggerCopy}>
                      <span className={styles.faqMeta}>
                        <span>{faq.category}</span>
                        {isRecommended && <span className={styles.recommendedBadge}>For {ROLE_LABELS[activeRole]}</span>}
                      </span>
                      <strong>{faq.question}</strong>
                    </span>
                    <span className={styles.faqChevron}><AdminIcon name="chevron" size={17} /></span>
                  </button>
                  {isOpen && (
                    <div id={panelId} className={styles.faqAnswer} role="region">
                      <p>{faq.answer}</p>
                      {faq.steps && (
                        <ol>
                          {faq.steps.map((step) => <li key={step}>{step}</li>)}
                        </ol>
                      )}
                      <div className={styles.faqFooter}>
                        <span className={styles.audienceNote}>Useful for {faq.audiences.map((audience) => ROLE_LABELS[audience]).join(" · ")}</span>
                        {faq.href && faq.linkLabel && <Link href={faq.href} className={styles.faqLink}>{faq.linkLabel}<AdminIcon name="arrow" size={14} /></Link>}
                      </div>
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        </section>

        <aside className={styles.aside} aria-label="Guide shortcuts">
          <section className={styles.quickLinksCard} aria-labelledby="quick-links-title">
            <div className={styles.cardHeading}>
              <div>
                <p className={styles.cardEyebrow}>Jump straight in</p>
                <h2 id="quick-links-title">Quick links</h2>
              </div>
              <span className={styles.cardHeadingIcon}><AdminIcon name="arrow" size={16} /></span>
            </div>
            <div className={styles.quickLinkList}>
              {QUICK_LINKS.map((item) => (
                <Link key={item.href} href={item.href} className={styles.quickLink}>
                  <span className={styles.quickLinkIcon}><AdminIcon name={item.icon} size={17} /></span>
                  <span><strong>{item.label}</strong><small>{item.detail}</small></span>
                  <AdminIcon name="arrow" size={14} />
                </Link>
              ))}
            </div>
          </section>

          <section className={styles.noteCard} aria-labelledby="ledger-note-title">
            <span className={styles.noteIcon}><AdminIcon name="check" size={18} /></span>
            <div>
              <p className={styles.cardEyebrow}>A good habit</p>
              <h2 id="ledger-note-title">Leave a useful trail.</h2>
              <p>Record the reason whenever a movement is waste or an adjustment. Future-you will know what changed and why.</p>
              <Link href="/admin/inventory?movement=receive#stock-movement" className={styles.noteLink}>Open the ledger <AdminIcon name="arrow" size={14} /></Link>
            </div>
          </section>

          <section className={styles.coverageCard} aria-labelledby="coverage-title">
            <p className={styles.cardEyebrow}>Guide coverage</p>
            <h2 id="coverage-title">One place to get unstuck.</h2>
            <div className={styles.coverageStats}>
              <span><strong>{GUIDE_FAQS.length}</strong><small>answers</small></span>
              <span><strong>{ROLE_OPTIONS.length}</strong><small>roles</small></span>
              <span><strong>{CATEGORY_FILTERS.length - 1}</strong><small>topics</small></span>
            </div>
            <p>Start with a question, then use the link in the answer to continue the task in Dumala POS.</p>
          </section>
        </aside>
      </div>

      <section id="guide-glossary" className={styles.glossarySection} aria-labelledby="glossary-title">
        <div className={styles.sectionHeading}>
          <div>
            <p className={styles.sectionEyebrow}>Plain language</p>
            <h2 id="glossary-title">What the words on screen mean</h2>
          </div>
          <p>The terms that have a specific meaning in Dumala POS.</p>
        </div>
        <dl className={styles.glossaryGrid}>
          {GLOSSARY.map((entry) => (
            <div key={entry.term} className={styles.glossaryItem}>
              <dt>{entry.term}</dt>
              <dd>{entry.definition}</dd>
            </div>
          ))}
        </dl>
      </section>
    </div>
  );
}
