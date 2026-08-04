export default function ProductsLoading() {
  return (
    <main className="admin-route-loading min-h-screen bg-bg p-4 text-ink sm:p-6 lg:p-8" aria-busy="true" aria-label="Loading products">
      <div className="admin-route-loading__progress" aria-hidden="true"><span /></div>
      <div className="mx-auto max-w-[1680px] animate-pulse">
        <div className="h-14 rounded-card border border-line bg-surface" />
        <div className="mt-6 h-24 max-w-2xl rounded-card bg-surface" />
        <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          {['a', 'b', 'c', 'd', 'e'].map((key) => <div key={key} className="h-32 rounded-card border border-line bg-surface" />)}
        </div>
        <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
          <div className="h-[520px] rounded-card border border-line bg-surface" />
          <div className="h-[520px] rounded-card border border-line bg-surface" />
        </div>
      </div>
    </main>
  );
}
