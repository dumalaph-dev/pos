export default function EmployeesLoading() {
  return (
    <main className="admin-page min-h-screen bg-bg p-4 text-ink sm:p-6 lg:p-8" aria-busy="true" aria-label="Loading employees">
      <div className="mx-auto max-w-[1680px] animate-pulse">
        <div className="flex min-h-[74px] justify-end gap-2">
          <div className="h-10 w-28 rounded-btn bg-surface" />
          <div className="h-10 w-36 rounded-btn bg-surface" />
        </div>
        <div className="h-28 max-w-xl rounded-card bg-surface" />
        <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          {['a', 'b', 'c', 'd', 'e'].map((key) => <div key={key} className="h-28 rounded-card border border-line bg-surface" />)}
        </div>
        <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1fr)_278px]">
          <div className="h-[460px] rounded-card border border-line bg-surface" />
          <div className="h-[460px] rounded-card border border-line bg-surface" />
        </div>
      </div>
    </main>
  );
}
