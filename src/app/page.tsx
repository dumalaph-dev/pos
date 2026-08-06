import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Dumala POS | Run your business with less stress",
  description: "A simple POS workspace for owners, branches, teams, and busy counters.",
};

type FeatureIconName = "bag" | "chart" | "people" | "bolt";

const featureCards: Array<{
  icon: FeatureIconName;
  title: string;
  description: string;
}> = [
  {
    icon: "bag",
    title: "Sell with speed",
    description: "Keep checkout clear and quick for every customer, even during the rush.",
  },
  {
    icon: "chart",
    title: "See what is happening",
    description: "Follow sales, orders, products, and stock from one calm workspace.",
  },
  {
    icon: "people",
    title: "Manage with ease",
    description: "Give managers and cashiers the right access for the branch they work in.",
  },
  {
    icon: "bolt",
    title: "Keep moving",
    description: "Stay ready for busy shifts with a POS designed to work through interruptions.",
  },
];

function ArrowIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 20 20" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M3 10h13M11 4l6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-[#dfe7dc] text-[#16392b]">
      <svg aria-hidden="true" viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2.4">
        <path d="m3.2 8.3 3 3 6.6-6.7" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </span>
  );
}

function PlayIcon() {
  return (
    <span className="grid h-11 w-11 place-items-center rounded-full border border-[#173a2b] bg-[#fbf7ef] text-[#173a2b] transition group-hover:bg-[#173a2b] group-hover:text-[#fbf7ef]">
      <svg aria-hidden="true" viewBox="0 0 16 16" className="ml-0.5 h-4 w-4" fill="currentColor">
        <path d="M4.25 2.85a.75.75 0 0 1 1.14-.64l6.28 4.15a.75.75 0 0 1 0 1.28l-6.28 4.15a.75.75 0 0 1-1.14-.64V2.85Z" />
      </svg>
    </span>
  );
}

function FeatureIcon({ name }: { name: FeatureIconName }) {
  const paths: Record<FeatureIconName, React.ReactNode> = {
    bag: <><path d="M4.2 6.2h7.6l.7 7.3H3.5l.7-7.3Z" /><path d="M5.7 6.1V4.9a2.3 2.3 0 0 1 4.6 0v1.2" /></>,
    chart: <><path d="M3.5 13.5V8.9M8 13.5V5.7m4.5 7.8V2.5" /><path d="M2.5 13.5h11" /></>,
    people: <><circle cx="6" cy="5.2" r="2.1" /><circle cx="11.4" cy="6.4" r="1.6" /><path d="M2.7 13.5c.2-2.3 1.3-3.6 3.3-3.6s3.1 1.3 3.3 3.6M9.1 10.4c1.9-.7 3.6.4 4.2 2.8" /></>,
    bolt: <path d="m9.2 2.3-5 6.4h3.5l-.9 5 5-6.5H8.3l.9-4.9Z" />,
  };

  return (
    <span className="grid h-14 w-14 shrink-0 place-items-center rounded-[18px] bg-[#15382a] text-[#d2a15c] shadow-[0_10px_24px_rgba(21,56,42,0.16)]">
      <svg aria-hidden="true" viewBox="0 0 16 16" className="h-7 w-7" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.35">
        {paths[name]}
      </svg>
    </span>
  );
}

function LogoLockup({ compact = false }: { compact?: boolean }) {
  return (
    <span className={`inline-flex items-center ${compact ? "gap-2" : "gap-3"}`}>
      <Image
        src="/badge.png"
        alt=""
        width={compact ? 32 : 42}
        height={compact ? 29 : 38}
        className="object-contain"
        priority={!compact}
      />
      <span className="leading-none">
        <span className={`block font-black tracking-[0.18em] text-[#16392b] ${compact ? "text-[13px]" : "text-[16px]"}`}>DUMALA</span>
        <span className={`mt-1 block text-center font-bold tracking-[0.35em] text-[#bc9657] ${compact ? "text-[8px]" : "text-[9px]"}`}>POS</span>
      </span>
    </span>
  );
}

function ProductPreview() {
  const metrics = [
    { label: "Total sales", value: "₱28,650", trend: "+12%" },
    { label: "Transactions", value: "142", trend: "+8%" },
    { label: "Items sold", value: "356", trend: "+15%" },
  ];
  const topItems = [
    ["Cappuccino", "89"],
    ["Iced Latte", "72"],
    ["Chicken meal", "56"],
    ["Rice bowl", "41"],
  ];

  return (
    <div className="relative mx-auto w-full max-w-[650px] pb-8 pt-2 lg:pt-8" aria-label="Dumala POS product preview">
      <div className="absolute -right-8 top-10 h-[78%] w-[85%] rounded-[45%] bg-[#173a2b] opacity-[0.98] sm:-right-14" />
      <div className="absolute -left-4 bottom-10 h-40 w-40 rounded-full border border-[#c39756]/60 sm:-left-10" />
      <div className="relative rotate-[1.5deg] rounded-[26px] border border-[#c8c5ba] bg-[#29332d] p-2.5 shadow-[0_30px_70px_rgba(18,43,32,0.24)] sm:p-3 lg:rotate-[3deg]">
        <div className="overflow-hidden rounded-[19px] border border-[#b7c2b7] bg-[#f8f4ec]">
          <div className="flex h-12 items-center justify-between bg-[#15382a] px-3 text-[#fffaf1] sm:h-14 sm:px-5">
            <div className="flex items-center gap-2">
              <Image src="/badge.png" alt="" width={25} height={23} className="object-contain" />
              <span className="text-[9px] font-bold tracking-[0.18em] sm:text-[11px]">DUMALA POS</span>
            </div>
            <div className="flex items-center gap-2 text-[9px] text-[#e8eadf] sm:text-[10px]">
              <span className="hidden rounded-full border border-[#8fa695]/40 px-2 py-1 sm:inline">Walk-in customer</span>
              <span className="h-5 w-5 rounded-full border border-[#8fa695]/40" />
              <span className="h-5 w-5 rounded-full border border-[#8fa695]/40" />
            </div>
          </div>
          <div className="grid min-h-[340px] grid-cols-[92px_minmax(0,1fr)] sm:min-h-[400px] sm:grid-cols-[124px_minmax(0,1fr)]">
            <aside className="bg-[#173a2b] px-2 py-4 text-[#eef0e8] sm:px-3 sm:py-5">
              <p className="px-2 text-[8px] font-bold uppercase tracking-[0.17em] text-[#a7b8a8]">Workspace</p>
              <nav className="mt-3 grid gap-1.5 text-[9px] sm:text-[10px]" aria-label="Preview navigation">
                {['Overview', 'POS', 'Orders', 'Products', 'Reports'].map((item, index) => (
                  <span key={item} className={`flex items-center gap-2 rounded-lg px-2 py-2 ${index === 0 ? "bg-[#c39756] font-bold text-[#173a2b]" : "text-[#d9e0d6]"}`}>
                    <span className={`h-1.5 w-1.5 rounded-full ${index === 0 ? "bg-[#173a2b]" : "bg-[#92a798]"}`} />
                    {item}
                  </span>
                ))}
              </nav>
            </aside>
            <div className="bg-[#fbf8f1] p-3 sm:p-5">
              <div className="flex items-end justify-between gap-3">
                <div>
                  <p className="text-[8px] font-bold uppercase tracking-[0.14em] text-[#8b968b] sm:text-[9px]">Today at a glance</p>
                  <p className="mt-1 text-base font-black tracking-[-0.03em] text-[#173a2b] sm:text-xl">Good morning, Alex</p>
                </div>
                <span className="rounded-lg border border-[#dfe2d7] px-2 py-1 text-[8px] font-bold text-[#586a5e]">This week⌄</span>
              </div>
              <div className="mt-4 grid grid-cols-3 gap-2">
                {metrics.map((metric) => (
                  <div key={metric.label} className="rounded-xl border border-[#e1e1d8] bg-[#fffdf8] p-2 sm:p-3">
                    <p className="text-[7px] font-semibold text-[#89958b] sm:text-[8px]">{metric.label}</p>
                    <p className="mt-1 text-[11px] font-black text-[#173a2b] sm:text-sm">{metric.value}</p>
                    <p className="mt-1 text-[7px] font-bold text-[#5b835d] sm:text-[8px]">↑ {metric.trend}</p>
                  </div>
                ))}
              </div>
              <div className="mt-3 grid gap-2.5 sm:grid-cols-[minmax(0,1.35fr)_minmax(130px,0.65fr)]">
                <div className="rounded-xl border border-[#e1e1d8] bg-[#fffdf8] p-3">
                  <div className="flex items-center justify-between">
                    <p className="text-[8px] font-bold text-[#173a2b] sm:text-[9px]">Sales overview</p>
                    <span className="text-[7px] text-[#89958b] sm:text-[8px]">May 11–17</span>
                  </div>
                  <svg aria-hidden="true" viewBox="0 0 260 110" className="mt-3 h-[105px] w-full overflow-visible">
                    <path d="M4 91h252M4 60h252M4 29h252" stroke="#e6e8df" strokeWidth="1" />
                    <path d="M5 83 37 80 68 57 98 66 128 43 158 52 188 27 218 42 255 12" fill="none" stroke="#183b2c" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.3" />
                    <path d="M5 83 37 80 68 57 98 66 128 43 158 52 188 27 218 42 255 12V100H5Z" fill="#dce8dc" opacity=".65" />
                    <g fill="#c39756" stroke="#fffdf8" strokeWidth="1.5">
                      <circle cx="68" cy="57" r="3" /><circle cx="128" cy="43" r="3" /><circle cx="188" cy="27" r="3" /><circle cx="255" cy="12" r="3" />
                    </g>
                  </svg>
                </div>
                <div className="rounded-xl border border-[#e1e1d8] bg-[#fffdf8] p-3">
                  <p className="text-[8px] font-bold text-[#173a2b] sm:text-[9px]">Top items</p>
                  <div className="mt-3 grid gap-2.5">
                    {topItems.map(([name, count], index) => (
                      <div key={name} className="flex items-center justify-between gap-2 text-[8px] text-[#59685d] sm:text-[9px]">
                        <span className="flex min-w-0 items-center gap-1.5"><span className={`h-4 w-4 shrink-0 rounded-md ${index % 2 === 0 ? "bg-[#d4a55f]" : "bg-[#9bb39a]"}`} /><span className="truncate">{name}</span></span>
                        <strong className="text-[#173a2b]">{count}</strong>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
      <div className="absolute -bottom-1 left-0 flex items-center gap-3 rounded-2xl border border-[#d7d9cd] bg-[#f9f5ec] px-3 py-2 shadow-[0_16px_30px_rgba(23,58,43,0.16)] sm:left-3 sm:px-4 sm:py-3">
        <span className="grid h-9 w-9 place-items-center rounded-xl bg-[#173a2b] text-[#c39756]"><span className="text-sm font-black">D</span></span>
        <span><strong className="block text-[10px] text-[#173a2b] sm:text-xs">Your counter, in control.</strong><span className="mt-0.5 block text-[8px] text-[#798478] sm:text-[9px]">Ready for the next sale</span></span>
      </div>
    </div>
  );
}

export default function LandingPage() {
  return (
    <main className="min-h-screen overflow-hidden bg-[#f8f3eb] text-[#102d21]">
      <header className="relative z-10 mx-auto flex w-full max-w-[1440px] items-center justify-between gap-6 px-6 py-5 sm:px-10 lg:px-16 lg:py-7">
        <Link href="/" aria-label="Dumala POS home" className="shrink-0 rounded-lg focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#173a2b]">
          <LogoLockup />
        </Link>
        <nav className="hidden items-center gap-8 text-sm font-semibold text-[#20372c] lg:flex" aria-label="Primary navigation">
          <a href="#features" className="transition hover:text-[#b18448]">Features</a>
          <a href="#how-it-works" className="transition hover:text-[#b18448]">How it works</a>
          <a href="#for-teams" className="transition hover:text-[#b18448]">For teams</a>
          <a href="#start" className="transition hover:text-[#b18448]">Get started</a>
        </nav>
        <div className="flex items-center gap-3">
          <Link href="/login" className="inline-flex rounded-lg px-2 py-2 text-xs font-semibold text-[#173a2b] transition hover:bg-[#ece8de] sm:px-3 sm:text-sm">Log in</Link>
          <Link href="/signup" className="inline-flex items-center gap-3 rounded-xl bg-[#15382a] px-4 py-3 text-sm font-bold text-[#fffaf1] shadow-[0_10px_22px_rgba(21,56,42,0.16)] transition hover:bg-[#0e2a20] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#bc9657] sm:px-5">Start free <ArrowIcon /></Link>
        </div>
      </header>

      <section className="relative mx-auto max-w-[1440px] px-6 pb-12 pt-7 sm:px-10 sm:pb-16 sm:pt-12 lg:px-16 lg:pb-20 lg:pt-16">
        <div className="pointer-events-none absolute -left-36 top-4 h-96 w-96 rounded-full bg-[#e8e4d8] opacity-45 blur-3xl" />
        <div className="pointer-events-none absolute right-[-12%] top-[-12%] h-[500px] w-[500px] rounded-full border border-[#dfcda9]/55" />
        <div className="relative grid items-center gap-8 lg:grid-cols-[minmax(360px,0.76fr)_minmax(0,1.24fr)] lg:gap-4">
          <div className="max-w-[540px]">
            <p className="inline-flex items-center gap-2 rounded-full bg-[#15382a] px-4 py-2 text-[11px] font-bold uppercase tracking-[0.12em] text-[#fffaf1] shadow-[0_8px_20px_rgba(21,56,42,0.12)]"><span className="text-[#d1a05b]">✦</span> All-in-one POS system</p>
            <h1 className="mt-7 max-w-[560px] text-[clamp(3.25rem,6.2vw,6.1rem)] font-black leading-[0.94] tracking-[-0.065em] text-[#102d21]">Run your business.<br /><span className="text-[#b18448]">Better sales.</span><br />Less stress.</h1>
            <p className="mt-7 max-w-[470px] text-base leading-7 text-[#526157] sm:text-lg sm:leading-8">Dumala POS gives owners one simple place to sell, understand the day, and keep every branch moving.</p>
            <div className="mt-8 flex flex-wrap items-center gap-5">
              <Link href="/signup" className="inline-flex min-h-14 items-center gap-4 rounded-xl bg-[#15382a] px-5 text-sm font-bold text-[#fffaf1] shadow-[0_12px_28px_rgba(21,56,42,0.18)] transition hover:-translate-y-0.5 hover:bg-[#0e2a20] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#bc9657] sm:px-6">Create your workspace <ArrowIcon /></Link>
              <a href="#how-it-works" className="group inline-flex items-center gap-3 text-sm font-bold text-[#173a2b] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#bc9657]"><PlayIcon /> See how it works</a>
            </div>
            <div className="mt-7 flex flex-wrap gap-x-5 gap-y-2 text-xs font-semibold text-[#667269]">
              <span className="inline-flex items-center gap-2"><CheckIcon /> No card to get started</span>
              <span className="inline-flex items-center gap-2"><CheckIcon /> Branch-ready access</span>
              <span className="inline-flex items-center gap-2"><CheckIcon /> Built for busy shifts</span>
            </div>
          </div>
          <ProductPreview />
        </div>
      </section>

      <section id="features" className="relative mx-auto max-w-[1380px] scroll-mt-8 px-6 pb-10 sm:px-10 lg:px-16">
        <div className="grid overflow-hidden rounded-[24px] border border-[#ddd8cc] bg-[#fbf8f1] shadow-[0_10px_35px_rgba(35,48,37,0.04)] sm:grid-cols-2 lg:grid-cols-4">
          {featureCards.map((feature, index) => (
            <article key={feature.title} className={`flex gap-4 p-5 sm:p-6 ${index > 0 ? "border-t border-[#e5e1d7] sm:border-l lg:border-t-0" : ""}`}>
              <FeatureIcon name={feature.icon} />
              <div><h2 className="text-sm font-black text-[#173a2b] sm:text-base">{feature.title}</h2><p className="mt-1.5 text-xs leading-5 text-[#68736a] sm:text-sm">{feature.description}</p></div>
            </article>
          ))}
        </div>
      </section>

      <section id="how-it-works" className="scroll-mt-8 bg-[#15382a] px-6 py-16 text-[#fffaf1] sm:px-10 sm:py-20 lg:px-16">
        <div className="mx-auto grid max-w-[1280px] gap-10 lg:grid-cols-[0.8fr_1.2fr] lg:items-center lg:gap-20">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#d1a05b]">Simple by design</p>
            <h2 className="mt-4 max-w-lg text-4xl font-black leading-[1.02] tracking-[-0.05em] sm:text-5xl">The right tools for the work in front of you.</h2>
            <p className="mt-5 max-w-md text-sm leading-7 text-[#cad6ca] sm:text-base">Start small, then make the workspace your own as your business grows. Dumala keeps the important things close without making the counter feel complicated.</p>
            <Link href="/signup" className="mt-7 inline-flex items-center gap-3 rounded-xl bg-[#c39756] px-5 py-3.5 text-sm font-black text-[#16392b] transition hover:bg-[#d4aa6b] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#fffaf1]">Start with Dumala <ArrowIcon /></Link>
          </div>
          <div id="for-teams" className="grid scroll-mt-8 gap-3 sm:grid-cols-3">
            {[{ number: "01", title: "Set up your workspace", text: "Create your business account and first branch in a few focused steps." }, { number: "02", title: "Give your team access", text: "Share a unique branch link with managers and cashiers, each with their own login." }, { number: "03", title: "Run the day", text: "Sell, watch the numbers, and make decisions with less manual work." }].map((step) => (
              <article key={step.number} className="rounded-2xl border border-[#55705d] bg-[#1a422f] p-5">
                <span className="text-xs font-black tracking-[0.18em] text-[#c39756]">{step.number}</span>
                <h3 className="mt-10 text-base font-black leading-5">{step.title}</h3>
                <p className="mt-3 text-sm leading-6 text-[#c8d4c9]">{step.text}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section id="start" className="mx-auto max-w-[1280px] scroll-mt-8 px-6 py-16 sm:px-10 sm:py-20 lg:px-16">
        <div className="relative overflow-hidden rounded-[28px] border border-[#d9d4c8] bg-[#eee9de] px-6 py-10 sm:px-10 lg:px-14">
          <div className="pointer-events-none absolute -right-24 -top-24 h-64 w-64 rounded-full border-[18px] border-[#e0c48e]/40" />
          <div className="relative flex flex-col items-start justify-between gap-8 md:flex-row md:items-center">
            <div className="max-w-2xl"><p className="text-xs font-bold uppercase tracking-[0.16em] text-[#b18448]">Ready when you are</p><h2 className="mt-3 text-3xl font-black tracking-[-0.045em] text-[#173a2b] sm:text-4xl">Give your business a calmer way to run.</h2><p className="mt-3 max-w-xl text-sm leading-6 text-[#657168] sm:text-base">Create your owner workspace today. Your team can join later through their own secure store access link.</p></div>
            <Link href="/signup" className="inline-flex shrink-0 items-center gap-4 rounded-xl bg-[#15382a] px-5 py-3.5 text-sm font-bold text-[#fffaf1] shadow-[0_10px_22px_rgba(21,56,42,0.15)] transition hover:bg-[#0e2a20] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#bc9657]">Create your account <ArrowIcon /></Link>
          </div>
        </div>
      </section>

      <footer className="border-t border-[#dfd9ce] px-6 py-7 sm:px-10 lg:px-16">
        <div className="mx-auto flex max-w-[1280px] flex-col gap-4 text-xs text-[#708076] sm:flex-row sm:items-center sm:justify-between">
          <LogoLockup compact />
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2"><span>Simple tools for growing businesses.</span><Link href="/login" className="font-bold text-[#173a2b] hover:text-[#b18448]">Owner log in</Link><Link href="/platform/login" className="font-bold text-[#173a2b] hover:text-[#b18448]">Platform access</Link></div>
        </div>
      </footer>
    </main>
  );
}
