import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowUpRight,
  ArrowDownLeft,
  Plus,
  CalendarDays,
  FileText,
  ChevronRight,
  Lock,
  Check,
  Circle,
  Eye,
  EyeOff,
} from 'lucide-react';

const INK = '#0a0a0a';
const PAPER = '#fafafa';
const GREY = '#8e8e8e';

const transactions = [
  { id: 1, label: 'Reserve deposit', sub: 'Standing order · UBS Genève', amount: '+ 4,500.00', dir: 'in', date: '24 Feb' },
  { id: 2, label: 'Atelier milestone released', sub: 'Dial fabrication · Stage III', amount: '− 18,000.00', dir: 'out', date: '19 Feb' },
  { id: 3, label: 'Reserve deposit', sub: 'Standing order · UBS Genève', amount: '+ 4,500.00', dir: 'in', date: '24 Jan' },
  { id: 4, label: 'Insurance rider', sub: 'In-transit coverage · Helvetia', amount: '− 320.00', dir: 'out', date: '12 Jan' },
  { id: 5, label: 'Reserve deposit', sub: 'Standing order · UBS Genève', amount: '+ 4,500.00', dir: 'in', date: '24 Dec' },
];

const stages = [
  {
    id: 0,
    name: 'Movement architecture',
    state: 'done',
    date: 'Completed · 4 Oct',
    detail:
      'Calibre L-921 plates milled from German silver, then frosted by hand. 248 components catalogued and weighed to the tenth of a milligram.',
  },
  {
    id: 1,
    name: 'Guilloché dial',
    state: 'done',
    date: 'Completed · 19 Feb',
    detail:
      'Your clous de Paris pattern was cut on a 1947 rose engine — 1,420 passes, each guided by hand. The release of CHF 18,000 funded this stage.',
  },
  {
    id: 2,
    name: 'Hand-bevelling & finishing',
    state: 'active',
    date: 'In progress · Day 23 of ~40',
    detail:
      '62 of 71 interior angles polished to a mirror. The balance bridge alone has taken eleven hours under the loupe this week.',
  },
  {
    id: 3,
    name: 'Casing & regulation',
    state: 'next',
    date: 'Begins ~ April',
    detail:
      'Six-position regulation over fifteen days. Final escrow release of CHF 39,250 occurs upon chronometer certification.',
  },
  {
    id: 4,
    name: 'Private unveiling',
    state: 'next',
    date: 'Genève · by invitation',
    detail:
      'A quiet evening at the atelier. You will be the first to wind it.',
  },
];

const tabs = ['Overview', 'Vault', 'Statements'];

export default function App() {
  const [tab, setTab] = useState('Overview');
  const [openStage, setOpenStage] = useState(2);
  const [hidden, setHidden] = useState(false);

  return (
    <div className="app-root min-h-screen w-full" style={{ background: INK }}>
      <link
        href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,400;0,500;0,600;1,400;1,500&family=Inter:wght@300;400;500;600&display=swap"
        rel="stylesheet"
      />
      <style
        dangerouslySetInnerHTML={{
          __html: `
        .app-root { font-family: 'Inter', sans-serif; -webkit-font-smoothing: antialiased; }
        .serif { font-family: 'Cormorant Garamond', serif; }
        .ls-wide { letter-spacing: 0.22em; }
        .ls-mid { letter-spacing: 0.12em; }
        .hairline { border-color: rgba(10,10,10,0.12); }
        .hairline-w { border-color: rgba(250,250,250,0.16); }
        .row-hover { transition: background 0.35s ease; }
        .row-hover:hover { background: rgba(10,10,10,0.035); }
        .stage-row { transition: background 0.4s ease; }
        .stage-row:hover { background: rgba(250,250,250,0.05); }
        .img-reveal { filter: grayscale(100%) contrast(1.05); transition: transform 1.6s cubic-bezier(.16,1,.3,1); }
        .img-frame:hover .img-reveal { transform: scale(1.045); }
        .btn-ink { transition: all .35s ease; }
        .btn-ink:hover { background: ${INK}; color: ${PAPER}; }
        .btn-ghost-w { transition: all .35s ease; }
        .btn-ghost-w:hover { background: ${PAPER}; color: ${INK}; }
        ::-webkit-scrollbar { width: 0px; }
        @keyframes pulseDot { 0%,100% { opacity: 1 } 50% { opacity: .35 } }
        .pulse { animation: pulseDot 2.4s ease-in-out infinite; }
      `,
        }}
      />

      <div className="flex flex-col lg:flex-row min-h-screen">
        {/* ————————————————— LEFT · THE RESERVE (white) ————————————————— */}
        <div className="w-full lg:w-1/2 flex flex-col" style={{ background: PAPER, color: INK }}>
          <div className="px-8 lg:px-14 pt-9 pb-6 flex items-center justify-between border-b hairline">
            <div className="flex items-baseline gap-4">
              <span className="serif text-[22px] tracking-[0.04em]" style={{ fontWeight: 500 }}>
                Lacroix <span className="italic">&amp;</span> Fils
              </span>
              <span className="text-[10px] uppercase ls-wide" style={{ color: GREY }}>
                Private Reserve
              </span>
            </div>
            <div
              className="w-9 h-9 rounded-full flex items-center justify-center text-[11px] tracking-wider border"
              style={{ borderColor: INK }}
            >
              VA
            </div>
          </div>

          {/* Tabs */}
          <div className="px-8 lg:px-14 pt-6 flex gap-8 text-[11px] uppercase ls-mid">
            {tabs.map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className="pb-3 relative"
                style={{ color: tab === t ? INK : GREY }}
              >
                {t}
                {tab === t && (
                  <motion.span
                    layoutId="tabline"
                    className="absolute left-0 right-0 bottom-0 h-[1px]"
                    style={{ background: INK }}
                  />
                )}
              </button>
            ))}
          </div>

          <div className="px-8 lg:px-14 pt-10 pb-12 flex-1 flex flex-col">
            {/* Greeting */}
            <motion.p
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8 }}
              className="serif italic text-[26px] leading-snug"
              style={{ fontWeight: 400 }}
            >
              Good evening, Vivienne.
            </motion.p>
            <p className="mt-1 text-[12px]" style={{ color: GREY }}>
              Your reserve grew quietly while you were away.
            </p>

            {/* Balance */}
            <div className="mt-10">
              <div className="flex items-center justify-between">
                <span className="text-[10px] uppercase ls-wide" style={{ color: GREY }}>
                  Commission reserve · Nº 0148
                </span>
                <button onClick={() => setHidden(!hidden)} style={{ color: GREY }}>
                  {hidden ? <EyeOff size={14} /> : <Eye size={14} />}
                </button>
              </div>
              <div className="mt-3 flex items-baseline gap-3">
                <span className="serif" style={{ fontSize: 52, fontWeight: 500, lineHeight: 1 }}>
                  {hidden ? '••••••' : '84,250'}
                </span>
                <span className="text-[13px]" style={{ color: GREY }}>
                  CHF {hidden ? '' : '.00'}
                </span>
              </div>
              <div className="mt-5">
                <div className="h-[2px] w-full" style={{ background: 'rgba(10,10,10,0.1)' }}>
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: '59%' }}
                    transition={{ duration: 1.4, ease: [0.16, 1, 0.3, 1], delay: 0.3 }}
                    className="h-full"
                    style={{ background: INK }}
                  />
                </div>
                <div className="mt-2 flex justify-between text-[11px]" style={{ color: GREY }}>
                  <span>59% of CHF 142,000 commission</span>
                  <span>Next remittance · CHF 4,500 on 1 Mar</span>
                </div>
              </div>
            </div>

            {/* Actions */}
            <div className="mt-9 grid grid-cols-3 gap-3">
              {[
                { icon: Plus, label: 'Add funds' },
                { icon: CalendarDays, label: 'Schedule' },
                { icon: FileText, label: 'Statement' },
              ].map(({ icon: Icon, label }) => (
                <button
                  key={label}
                  className="btn-ink border hairline py-4 flex flex-col items-center gap-2 text-[10px] uppercase ls-mid"
                  style={{ borderColor: 'rgba(10,10,10,0.2)' }}
                >
                  <Icon size={15} strokeWidth={1.5} />
                  {label}
                </button>
              ))}
            </div>

            {/* Movements */}
            <div className="mt-12 flex-1">
              <div className="flex items-center justify-between pb-3 border-b hairline">
                <span className="text-[10px] uppercase ls-wide" style={{ color: GREY }}>
                  Recent movements
                </span>
                <button className="text-[11px] flex items-center gap-1" style={{ color: INK }}>
                  All activity <ChevronRight size={12} />
                </button>
              </div>
              <div>
                {transactions.map((t) => (
                  <div
                    key={t.id}
                    className="row-hover flex items-center justify-between py-4 border-b hairline cursor-default"
                  >
                    <div className="flex items-center gap-4">
                      <div
                        className="w-8 h-8 rounded-full flex items-center justify-center border"
                        style={{ borderColor: 'rgba(10,10,10,0.18)' }}
                      >
                        {t.dir === 'in' ? (
                          <ArrowDownLeft size={13} strokeWidth={1.5} />
                        ) : (
                          <ArrowUpRight size={13} strokeWidth={1.5} />
                        )}
                      </div>
                      <div>
                        <p className="text-[13px]">{t.label}</p>
                        <p className="text-[11px] mt-0.5" style={{ color: GREY }}>
                          {t.sub}
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-[13px]" style={{ fontVariantNumeric: 'tabular-nums' }}>
                        {hidden ? '••••' : t.amount}
                      </p>
                      <p className="text-[11px] mt-0.5" style={{ color: GREY }}>
                        {t.date}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="mt-8 flex items-center gap-2 text-[10px]" style={{ color: GREY }}>
              <Lock size={11} strokeWidth={1.5} />
              Funds held in escrow with Banque Privée Genève. Released only as your watch is made.
            </div>
          </div>
        </div>

        {/* ————————————————— RIGHT · THE ATELIER (black) ————————————————— */}
        <div className="w-full lg:w-1/2 flex flex-col" style={{ background: INK, color: PAPER }}>
          <div className="px-8 lg:px-14 pt-9 pb-6 flex items-center justify-between border-b hairline-w">
            <span className="text-[10px] uppercase ls-wide" style={{ color: GREY }}>
              From the atelier · Le Brassus
            </span>
            <span className="flex items-center gap-2 text-[10px] uppercase ls-mid">
              <span className="w-1.5 h-1.5 rounded-full pulse" style={{ background: PAPER }} />
              Live this week
            </span>
          </div>

          <div className="px-8 lg:px-14 pt-10 pb-12 flex-1 flex flex-col">
            <motion.h2
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.9, delay: 0.15 }}
              className="serif text-[34px] leading-[1.12]"
              style={{ fontWeight: 400 }}
            >
              Your calibre is being
              <br />
              <span className="italic">finished by hand.</span>
            </motion.h2>

            {/* Image */}
            <div className="img-frame mt-8 overflow-hidden relative">
              <img
                src="https://images.unsplash.com/photo-1495857000853-fe46c8aefc30?w=1200&h=700&fit=crop"
                alt="Calibre L-921 under the loupe"
                className="img-reveal w-full h-[210px] lg:h-[250px] object-cover"
              />
              <div className="absolute bottom-0 left-0 right-0 px-5 py-3 flex items-center justify-between"
                   style={{ background: 'linear-gradient(to top, rgba(10,10,10,0.85), rgba(10,10,10,0))' }}>
                <span className="text-[10px] uppercase ls-mid">Calibre L-921 · Bench Nº 7</span>
                <span className="text-[10px]" style={{ color: GREY }}>Photographed Tuesday, 14:12</span>
              </div>
            </div>

            {/* Progress strip */}
            <div className="mt-8 flex items-end justify-between">
              <div>
                <p className="text-[10px] uppercase ls-wide" style={{ color: GREY }}>
                  Overall completion
                </p>
                <p className="serif text-[40px] leading-none mt-2" style={{ fontWeight: 500 }}>
                  58<span className="text-[20px]">%</span>
                </p>
              </div>
              <div className="text-right text-[11px]" style={{ color: GREY }}>
                <p>Estimated unveiling</p>
                <p className="mt-0.5" style={{ color: PAPER }}>
                  June, Genève
                </p>
              </div>
            </div>

            {/* Stages */}
            <div className="mt-7 border-t hairline-w">
              {stages.map((s) => {
                const open = openStage === s.id;
                return (
                  <div key={s.id} className="border-b hairline-w">
                    <button
                      onClick={() => setOpenStage(open ? -1 : s.id)}
                      className="stage-row w-full flex items-center justify-between py-4 px-2 text-left"
                    >
                      <div className="flex items-center gap-4">
                        <span
                          className="w-5 h-5 rounded-full flex items-center justify-center border"
                          style={{
                            borderColor: s.state === 'next' ? GREY : PAPER,
                            background: s.state === 'done' ? PAPER : 'transparent',
                          }}
                        >
                          {s.state === 'done' ? (
                            <Check size={11} color={INK} strokeWidth={2.5} />
                          ) : s.state === 'active' ? (
                            <span className="w-1.5 h-1.5 rounded-full pulse" style={{ background: PAPER }} />
                          ) : (
                            <Circle size={5} color={GREY} fill={GREY} />
                          )}
                        </span>
                        <span
                          className="text-[13px]"
                          style={{ color: s.state === 'next' ? GREY : PAPER }}
                        >
                          {s.name}
                        </span>
                      </div>
                      <span className="text-[11px]" style={{ color: GREY }}>
                        {s.date}
                      </span>
                    </button>
                    <AnimatePresence initial={false}>
                      {open && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: 'auto', opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
                          className="overflow-hidden"
                        >
                          <p
                            className="px-2 pb-5 pl-11 text-[12px] leading-relaxed max-w-md"
                            style={{ color: 'rgba(250,250,250,0.72)' }}
                          >
                            {s.detail}
                          </p>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                );
              })}
            </div>

            {/* Craftsman note */}
            <div className="mt-9 flex-1 flex flex-col justify-end">
              <p className="serif italic text-[19px] leading-relaxed" style={{ color: 'rgba(250,250,250,0.9)' }}>
                “Your guilloché dial caught the afternoon light beautifully today.
                I thought you would want to know.”
              </p>
              <p className="mt-3 text-[10px] uppercase ls-wide" style={{ color: GREY }}>
                — Élise Mercier, Master Finisher
              </p>

              <button
                className="btn-ghost-w mt-8 self-start border px-7 py-3 text-[10px] uppercase ls-wide flex items-center gap-3"
                style={{ borderColor: 'rgba(250,250,250,0.4)' }}
              >
                Request a private viewing <ArrowUpRight size={13} strokeWidth={1.5} />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}