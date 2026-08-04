export default function AdminLoading() {
  return (
    <main className="admin-route-loading min-h-screen bg-bg p-4 text-ink sm:p-6 lg:p-8" aria-busy="true" aria-label="Loading admin workspace">
      <div className="admin-route-loading__progress" aria-hidden="true"><span /></div>
      <div className="mx-auto max-w-[1280px] animate-pulse">
        <div className="mb-5 flex items-center gap-2 text-xs font-extrabold uppercase tracking-[0.14em] text-ink-muted"><span className="admin-route-loading__spinner" aria-hidden="true" /> Loading workspace</div>
        <div className="h-16 rounded-card border border-line bg-surface" />
        <div className="mt-8 h-24 max-w-xl rounded-card bg-surface/80" />
        <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {["a", "b", "c", "d"].map((key) => <div key={key} className="h-36 rounded-card border border-line bg-surface" />)}
        </div>
        <div className="mt-6 grid gap-4 xl:grid-cols-[1.45fr_0.85fr]">
          <div className="h-80 rounded-card border border-line bg-surface" />
          <div className="h-80 rounded-card border border-line bg-surface" />
        </div>
      </div>
    </main>
  );
}
