import styles from "./PosLoadingScreen.module.css";

type PosLoadingScreenProps = {
  variant?: "route" | "catalog";
};

const COPY = {
  route: {
    title: "Opening your register",
    detail: "Connecting to your POS workspace and branch settings.",
    status: "Connecting to the register",
    progressLabel: "Opening the POS workspace",
  },
  catalog: {
    title: "Preparing your catalog",
    detail: "Loading your menu, terminal settings, and current stock.",
    status: "Syncing menu and inventory",
    progressLabel: "Loading the POS catalog",
  },
} as const;

export default function PosLoadingScreen({ variant = "catalog" }: PosLoadingScreenProps) {
  const copy = COPY[variant];

  return (
    <main className={styles.loading} aria-busy="true" aria-label="Loading POS">
      <section className={styles.card} aria-live="polite">
        <div className={styles.headingRow}>
          <div className={styles.mark} aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M5 8.5h14v10H5z" />
              <path d="M8 8.5V5.25h8V8.5M8.5 12h7M8.5 15h4" />
            </svg>
          </div>
          <div className={styles.copy}>
            <p className={styles.brand}>Dumala POS <span aria-hidden="true">·</span> Register</p>
            <h1>{copy.title}</h1>
            <p className={styles.detail}>{copy.detail}</p>
          </div>
        </div>

        <div className={styles.progress} role="progressbar" aria-label={copy.progressLabel}>
          <span />
        </div>

        <p className={styles.status}>
          <span className={styles.statusDot} aria-hidden="true" />
          <span>{copy.status}</span>
          <span className={styles.statusDots} aria-hidden="true">…</span>
        </p>
        <p className={styles.hint}>The register is working normally. The first load may take a few seconds.</p>
      </section>
    </main>
  );
}
