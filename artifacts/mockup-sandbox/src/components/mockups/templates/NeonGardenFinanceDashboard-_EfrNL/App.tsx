import { useState } from 'react';
import {
  Sprout, Droplets, Sun, Scissors, Zap, ArrowUpRight, Leaf,
  CircleDollarSign, Bell, Search, ChevronRight, Flower2, Trees,
  Sparkles, Trophy, Clock, Shield, Wallet
} from 'lucide-react';
import { AreaChart, Area, XAxis, YAxis, ResponsiveContainer, Tooltip, CartesianGrid } from 'recharts';
import { motion, AnimatePresence } from 'framer-motion';

const PLANTS = [
  {
    id: 'fern',
    name: 'EMERGENCY FERN',
    account: 'Rainy-Day Vault',
    icon: Leaf,
    stage: 'SPROUTING',
    stagePct: 48,
    balance: 4820,
    target: 10000,
    apy: '4.30%',
    cadence: 'Every Friday · $150',
    risk: 'LOW · CASH SOIL',
    neon: '#AAFF00',
    health: 92,
    nextWater: 'IN 2 DAYS',
    chart: [
      { m: 'JAN', v: 1200 }, { m: 'FEB', v: 1750 }, { m: 'MAR', v: 2300 },
      { m: 'APR', v: 2750 }, { m: 'MAY', v: 3400 }, { m: 'JUN', v: 3900 },
      { m: 'JUL', v: 4380 }, { m: 'AUG', v: 4820 },
    ],
  },
  {
    id: 'monstera',
    name: 'INDEX MONSTERA',
    account: 'Total-Market ETF',
    icon: Trees,
    stage: 'FLOURISHING',
    stagePct: 81,
    balance: 28950,
    target: 35000,
    apy: '+11.2% YTD',
    cadence: '1st of month · $600',
    risk: 'MED · DIVERSIFIED LOAM',
    neon: '#00F0FF',
    health: 97,
    nextWater: 'OCT 01',
    chart: [
      { m: 'JAN', v: 21000 }, { m: 'FEB', v: 22400 }, { m: 'MAR', v: 21800 },
      { m: 'APR', v: 24100 }, { m: 'MAY', v: 25600 }, { m: 'JUN', v: 26900 },
      { m: 'JUL', v: 28100 }, { m: 'AUG', v: 28950 },
    ],
  },
  {
    id: 'ivy',
    name: 'ROTH IVY',
    account: 'Retirement IRA',
    icon: Flower2,
    stage: 'CLIMBING',
    stagePct: 63,
    balance: 12400,
    target: 19500,
    apy: '+9.8% YTD',
    cadence: 'Bi-weekly · $270',
    risk: 'MED · TAX-FREE COMPOST',
    neon: '#FF3DF2',
    health: 88,
    nextWater: 'TOMORROW',
    chart: [
      { m: 'JAN', v: 7800 }, { m: 'FEB', v: 8500 }, { m: 'MAR', v: 8900 },
      { m: 'APR', v: 9800 }, { m: 'MAY', v: 10600 }, { m: 'JUN', v: 11200 },
      { m: 'JUL', v: 11900 }, { m: 'AUG', v: 12400 },
    ],
  },
  {
    id: 'cactus',
    name: 'CRYPTO CACTUS',
    account: 'High-Volatility Pot',
    icon: Sprout,
    stage: 'NEEDS WATER',
    stagePct: 22,
    balance: 1140,
    target: 5000,
    apy: '−6.4% MTD',
    cadence: 'Manual only · $50 cap',
    risk: 'HIGH · ARID SAND',
    neon: '#FFB300',
    health: 54,
    nextWater: 'OVERDUE 3 DAYS',
    chart: [
      { m: 'JAN', v: 900 }, { m: 'FEB', v: 1500 }, { m: 'MAR', v: 1100 },
      { m: 'APR', v: 1750 }, { m: 'MAY', v: 1300 }, { m: 'JUN', v: 1600 },
      { m: 'JUL', v: 1220 }, { m: 'AUG', v: 1140 },
    ],
  },
];

const TASKS = [
  { plant: 'EMERGENCY FERN', action: 'AUTO-WATER FIRES', detail: '$150 deposit · Friday 9:00AM', neon: '#AAFF00', icon: Droplets },
  { plant: 'CRYPTO CACTUS', action: 'WATERING OVERDUE', detail: 'Skipped 3 deposits — streak at risk', neon: '#FFB300', icon: Bell },
  { plant: 'ROTH IVY', action: 'SUNLIGHT BOOST', detail: 'Raise contribution +$30 to hit 2025 max', neon: '#FF3DF2', icon: Sun },
  { plant: 'INDEX MONSTERA', action: 'PRUNE FEES', detail: '0.42% expense ratio detected — swap fund', neon: '#00F0FF', icon: Scissors },
];

const LESSONS = {
  WATERING: {
    icon: Droplets,
    neon: '#00F0FF',
    title: 'WATERING 101 // AUTOMATE THE DRIP',
    blurb: 'A plant watered on schedule never wilts. Money works the same way — automation beats willpower 100% of the time.',
    steps: [
      { n: '01', h: 'SET THE DRIP', p: 'Schedule a recurring transfer the morning after payday. Even $25/week compounds into a canopy.' },
      { n: '02', h: 'PAY THE SOIL FIRST', p: 'Route deposits before spending money ever touches your checking account. You can\'t spend what you never see.' },
      { n: '03', h: 'NEVER SKIP TWICE', p: 'Missed a week? Fine. Two in a row kills the root system. BloomVault auto-doubles your next drip to recover.' },
    ],
    stat: { label: 'AVG. GROWTH WITH AUTO-WATERING ON', value: '+38% / YR' },
  },
  SUNLIGHT: {
    icon: Sun,
    neon: '#AAFF00',
    title: 'SUNLIGHT // COMPOUND INTEREST IS PHOTOSYNTHESIS',
    blurb: 'Interest earned on interest is free energy from the sky. Your only job: keep the leaves in the light and don\'t dig up the roots.',
    steps: [
      { n: '01', h: 'CHASE THE WINDOW', p: 'Park cash at 4.30% APY, not 0.01%. Same plant, 430× more sun. Move it once, benefit forever.' },
      { n: '02', h: 'LET IT SIT STILL', p: 'Every withdrawal is a cloudy day. The fern that compounds untouched for 10 years triples without a single extra deposit.' },
      { n: '03', h: 'STACK THE SEASONS', p: 'Reinvest dividends automatically. That\'s sunlight bouncing back onto new leaves — the loop heroes are made of.' },
    ],
    stat: { label: '$10K AT 4.3% LEFT ALONE FOR 10 YRS', value: '$15,260' },
  },
  PRUNING: {
    icon: Scissors,
    neon: '#FF3DF2',
    title: 'PRUNING // CUT FEES BEFORE THEY STRANGLE',
    blurb: 'A 1% fee looks like a single yellow leaf. Over 30 years it eats a third of your canopy. Sharpen the shears.',
    steps: [
      { n: '01', h: 'SCAN FOR ROT', p: 'Open Fee X-Ray weekly. Anything above a 0.20% expense ratio gets flagged neon — clip it.' },
      { n: '02', h: 'KILL ZOMBIE SUBS', p: 'Forgotten subscriptions are vines choking your trunk. The average user reclaims $214/yr on the first sweep.' },
      { n: '03', h: 'NEGOTIATE LIKE A HERO', p: 'One 12-minute call cuts the average APR by 4 points. Scripts are pre-loaded in the app. Read them out loud. Win.' },
    ],
    stat: { label: 'FEES CLIPPED BY BLOOMVAULT USERS IN 2024', value: '$4.1M' },
  },
  REPOTTING: {
    icon: Shield,
    neon: '#FFB300',
    title: 'REPOTTING // REBALANCE WHEN ROOTS OUTGROW THE POT',
    blurb: 'Winners grow until they crowd everything else. Once a year, move soil around so no single root can topple the garden.',
    steps: [
      { n: '01', h: 'CHECK THE ROOT BALL', p: 'If one holding exceeds 30% of the garden, it\'s pot-bound. Concentration feels heroic until the frost comes.' },
      { n: '02', h: 'TRIM AND TRANSPLANT', p: 'Sell the overgrowth, feed the seedlings. Selling high and buying low is just gardening with extra steps.' },
      { n: '03', h: 'DATE THE REPOT', p: 'Pick a birthday, not a headline. Calendar-based rebalancing beats panic-based every measured decade.' },
    ],
    stat: { label: 'DRIFT REDUCED BY ANNUAL REPOTTING', value: '−61% RISK' },
  },
};

const fmt = (n) => '$' + n.toLocaleString();

const ChartTip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-black border border-white/20 px-3 py-2 font-mono text-[11px]">
      <div className="text-white/50 tracking-[0.2em]">{label}</div>
      <div className="text-white font-bold">{fmt(payload[0].value)}</div>
    </div>
  );
};

export default function App() {
  const [selectedId, setSelectedId] = useState('monstera');
  const [lesson, setLesson] = useState('WATERING');
  const [watered, setWatered] = useState(false);

  const plant = PLANTS.find((p) => p.id === selectedId);
  const L = LESSONS[lesson];
  const totalGrown = PLANTS.reduce((a, p) => a + p.balance, 0);

  return (
    <div className="min-h-screen bg-[#0A0A0B] text-white relative overflow-hidden" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link href="https://fonts.googleapis.com/css2?family=Michroma&family=Space+Grotesk:wght@400;500;700&family=Space+Mono:wght@400;700&display=swap" rel="stylesheet" />
      <style dangerouslySetInnerHTML={{ __html: `
        .display { font-family: 'Michroma', sans-serif; }
        .mono { font-family: 'Space Mono', monospace; }
        .chrome-text {
          background: linear-gradient(180deg, #ffffff 0%, #d8dee6 30%, #6f7780 50%, #f0f4f8 56%, #8a929c 80%, #ffffff 100%);
          -webkit-background-clip: text; background-clip: text; color: transparent;
        }
        .chrome-ring {
          background: linear-gradient(160deg, #f5f7fa, #6b7280 35%, #e5e7eb 50%, #4b5563 65%, #f9fafb);
        }
        .grid-bg {
          background-image:
            radial-gradient(circle at 20% 0%, rgba(170,255,0,0.06), transparent 40%),
            radial-gradient(circle at 90% 90%, rgba(0,240,255,0.05), transparent 40%),
            linear-gradient(rgba(255,255,255,0.025) 1px, transparent 1px),
            linear-gradient(90deg, rgba(255,255,255,0.025) 1px, transparent 1px);
          background-size: 100% 100%, 100% 100%, 32px 32px, 32px 32px;
        }
        .scanlines::after {
          content: ''; position: fixed; inset: 0; pointer-events: none; z-index: 50;
          background: repeating-linear-gradient(0deg, transparent 0px, transparent 3px, rgba(255,255,255,0.012) 3px, rgba(255,255,255,0.012) 4px);
        }
        .neon-glow-lime { box-shadow: 0 0 24px rgba(170,255,0,0.25), 0 0 4px rgba(170,255,0,0.6); }
        .pulse-dot { animation: pulse 1.6s ease-in-out infinite; }
        @keyframes pulse { 0%,100%{ opacity:1 } 50%{ opacity:.35 } }
        @keyframes spinSlow { to { transform: rotate(360deg); } }
        .spin-slow { animation: spinSlow 14s linear infinite; }
        ::-webkit-scrollbar { width: 8px; height: 8px; }
        ::-webkit-scrollbar-track { background: #0A0A0B; }
        ::-webkit-scrollbar-thumb { background: linear-gradient(#AAFF00, #00F0FF); border-radius: 99px; }
      `}} />

      <div className="grid-bg scanlines min-h-screen">

        {/* ===== HEADER ===== */}
        <header className="border-b border-white/10 px-6 py-4 flex items-center justify-between sticky top-0 bg-[#0A0A0B]/90 backdrop-blur-md z-40">
          <div className="flex items-center gap-4">
            <div className="w-10 h-10 rounded-full chrome-ring p-[2px]">
              <div className="w-full h-full rounded-full bg-black flex items-center justify-center">
                <Sprout size={18} className="text-[#AAFF00]" />
              </div>
            </div>
            <div>
              <div className="display text-sm tracking-[0.3em] chrome-text">BLOOMVAULT</div>
              <div className="mono text-[9px] tracking-[0.35em] text-[#AAFF00]">GROW MONEY LIKE A LIVING THING ✦ V2.000</div>
            </div>
          </div>

          <nav className="hidden lg:flex items-center gap-2">
            {['GARDEN', 'GROW SCHOOL', 'FEE X-RAY', 'SEED VAULT'].map((t, i) => (
              <button key={t} className={`mono text-[10px] tracking-[0.25em] px-4 py-2 rounded-full border transition-all ${i === 0 ? 'border-[#AAFF00] text-[#AAFF00] bg-[#AAFF00]/10' : 'border-white/15 text-white/50 hover:text-white hover:border-white/40'}`}>
                {t}
              </button>
            ))}
          </nav>

          <div className="flex items-center gap-3">
            <button className="w-9 h-9 rounded-full border border-white/15 flex items-center justify-center hover:border-[#00F0FF] hover:text-[#00F0FF] transition-colors text-white/60">
              <Search size={14} />
            </button>
            <button className="relative w-9 h-9 rounded-full border border-white/15 flex items-center justify-center hover:border-[#FF3DF2] hover:text-[#FF3DF2] transition-colors text-white/60">
              <Bell size={14} />
              <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-[#FF3DF2] pulse-dot" />
            </button>
            <div className="hidden md:flex items-center gap-2 rounded-full border border-white/15 pl-3 pr-1.5 py-1.5">
              <span className="mono text-[10px] tracking-[0.2em] text-white/50">GARDENER_07</span>
              <div className="w-7 h-7 rounded-full chrome-ring p-[1.5px]">
                <div className="w-full h-full rounded-full bg-[#1a1a1c] flex items-center justify-center text-[10px] mono text-[#AAFF00]">M</div>
              </div>
            </div>
          </div>
        </header>

        {/* ===== HERO STRIP ===== */}
        <div className="px-6 py-3 border-b border-white/10 flex items-center gap-6 overflow-x-auto whitespace-nowrap">
          <span className="mono text-[10px] tracking-[0.3em] text-white/40">✦ TOTAL GARDEN VALUE</span>
          <span className="display text-lg chrome-text tracking-wider">{fmt(totalGrown)}</span>
          <span className="mono text-[10px] tracking-[0.2em] text-[#AAFF00] flex items-center gap-1"><ArrowUpRight size={12} /> +$1,940 THIS MONTH</span>
          <span className="mono text-[10px] tracking-[0.3em] text-white/40">✦ WATERING STREAK</span>
          <span className="mono text-[11px] tracking-[0.2em] text-[#00F0FF] font-bold">26 WEEKS</span>
          <span className="mono text-[10px] tracking-[0.3em] text-white/40">✦ HERO RANK</span>
          <span className="mono text-[11px] tracking-[0.2em] text-[#FF3DF2] font-bold flex items-center gap-1.5"><Trophy size={12} /> CANOPY GUARDIAN</span>
        </div>

        {/* ===== MAIN GRID  ⅓ + ⅔ ===== */}
        <main className="grid grid-cols-1 lg:grid-cols-3 gap-5 p-6 max-w-[1500px] mx-auto">

          {/* ───────── LEFT ⅓ ───────── */}
          <div className="space-y-5">

            {/* GARDEN STATUS */}
            <section className="border border-white/12 rounded-3xl rounded-tr-[60px] p-5 relative overflow-hidden">
              <div className="absolute -top-8 -right-8 w-28 h-28 rounded-full chrome-ring opacity-20 spin-slow" />
              <div className="display text-[11px] tracking-[0.3em] text-white/60 mb-4 flex items-center gap-2">
                <Sparkles size={12} className="text-[#AAFF00]" /> GARDEN STATUS
              </div>
              <div className="display text-3xl chrome-text mb-1">{fmt(totalGrown)}</div>
              <div className="mono text-[10px] tracking-[0.25em] text-[#AAFF00] mb-5">PLANTED ACROSS {PLANTS.length} SPECIES</div>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { k: 'GROWTH RATE', v: '+8.4%', c: '#AAFF00' },
                  { k: 'AUTO-DRIPS', v: '3 / WK', c: '#00F0FF' },
                  { k: 'HEALTH', v: '83 / 100', c: '#FF3DF2' },
                ].map((s) => (
                  <div key={s.k} className="border border-white/10 rounded-2xl p-2.5 bg-white/[0.02]">
                    <div className="mono text-[8px] tracking-[0.2em] text-white/40 mb-1">{s.k}</div>
                    <div className="mono text-sm font-bold" style={{ color: s.c }}>{s.v}</div>
                  </div>
                ))}
              </div>
            </section>

            {/* PLANT ROSTER */}
            <section className="border border-white/12 rounded-3xl p-5">
              <div className="flex items-center justify-between mb-4">
                <div className="display text-[11px] tracking-[0.3em] text-white/60">YOUR PLANTS</div>
                <button className="mono text-[9px] tracking-[0.2em] text-[#00F0FF] hover:text-white transition-colors flex items-center gap-1">+ PLANT NEW SEED</button>
              </div>
              <div className="space-y-2">
                {PLANTS.map((p) => {
                  const Icon = p.icon;
                  const active = p.id === selectedId;
                  return (
                    <button
                      key={p.id}
                      onClick={() => { setSelectedId(p.id); setWatered(false); }}
                      className={`w-full text-left flex items-center gap-3 rounded-2xl border p-3 transition-all duration-200 group ${active ? 'bg-white/[0.05]' : 'border-white/10 hover:border-white/30 hover:bg-white/[0.02]'}`}
                      style={active ? { borderColor: p.neon, boxShadow: `0 0 20px ${p.neon}22` } : {}}
                    >
                      <div className="w-10 h-10 rounded-full flex items-center justify-center shrink-0 border" style={{ borderColor: active ? p.neon : 'rgba(255,255,255,0.15)', background: active ? `${p.neon}15` : 'transparent' }}>
                        <Icon size={16} style={{ color: p.neon }} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="display text-[10px] tracking-[0.18em] truncate" style={{ color: active ? p.neon : '#fff' }}>{p.name}</div>
                        <div className="mono text-[9px] text-white/40 tracking-wider truncate">{p.account} · {p.stage}</div>
                      </div>
                      <div className="text-right shrink-0">
                        <div className="mono text-xs font-bold">{fmt(p.balance)}</div>
                        <div className="h-1 w-14 bg-white/10 rounded-full mt-1 overflow-hidden">
                          <div className="h-full rounded-full" style={{ width: `${p.stagePct}%`, background: p.neon }} />
                        </div>
                      </div>
                      <ChevronRight size={14} className={`shrink-0 transition-transform ${active ? 'translate-x-0.5' : 'text-white/20 group-hover:text-white/60'}`} style={active ? { color: p.neon } : {}} />
                    </button>
                  );
                })}
              </div>
            </section>

            {/* CARE QUEUE */}
            <section className="border border-white/12 rounded-3xl rounded-bl-[60px] p-5">
              <div className="display text-[11px] tracking-[0.3em] text-white/60 mb-4 flex items-center gap-2">
                <Clock size={12} className="text-[#FF3DF2]" /> CARE QUEUE — THIS WEEK
              </div>
              <div className="space-y-3">
                {TASKS.map((t, i) => {
                  const Icon = t.icon;
                  return (
                    <div key={i} className="flex gap-3 items-start group cursor-pointer">
                      <div className="w-7 h-7 rounded-full border flex items-center justify-center shrink-0 mt-0.5" style={{ borderColor: `${t.neon}66`, background: `${t.neon}10` }}>
                        <Icon size={12} style={{ color: t.neon }} />
                      </div>
                      <div className="flex-1 border-b border-white/8 pb-3">
                        <div className="flex justify-between items-baseline">
                          <span className="mono text-[10px] tracking-[0.2em] font-bold" style={{ color: t.neon }}>{t.action}</span>
                          <span className="mono text-[8px] tracking-[0.15em] text-white/30">{t.plant}</span>
                        </div>
                        <p className="text-[12px] text-white/60 mt-0.5 group-hover:text-white/85 transition-colors">{t.detail}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          </div>

          {/* ───────── RIGHT ⅔ ───────── */}
          <div className="lg:col-span-2 space-y-5">

            {/* PLANT DETAIL */}
            <AnimatePresence mode="wait">
              <motion.section
                key={plant.id}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.25 }}
                className="border border-white/12 rounded-3xl rounded-tl-[70px] p-6 relative overflow-hidden"
              >
                <div className="absolute top-0 right-0 mono text-[9px] tracking-[0.3em] px-4 py-2 rounded-bl-2xl border-l border-b border-white/10 text-white/40">
                  SPECIMEN_{plant.id.toUpperCase()}.DAT ✦ LIVE
                </div>

                <div className="flex flex-wrap items-start justify-between gap-4 mb-6 pr-24">
                  <div>
                    <div className="flex items-center gap-3 mb-2">
                      <div className="w-12 h-12 rounded-full chrome-ring p-[2px]">
                        <div className="w-full h-full rounded-full bg-black flex items-center justify-center">
                          <plant.icon size={20} style={{ color: plant.neon }} />
                        </div>
                      </div>
                      <div>
                        <h1 className="display text-2xl tracking-[0.12em] chrome-text">{plant.name}</h1>
                        <div className="mono text-[10px] tracking-[0.25em]" style={{ color: plant.neon }}>{plant.account.toUpperCase()} ✦ STAGE: {plant.stage}</div>
                      </div>
                    </div>
                  </div>
                  <button
                    onClick={() => setWatered(true)}
                    className={`mono text-[11px] tracking-[0.25em] font-bold px-6 py-3 rounded-full transition-all duration-300 ${watered ? 'bg-white/10 text-white/50 border border-white/20' : 'bg-[#AAFF00] text-black neon-glow-lime hover:scale-[1.03] active:scale-95'}`}
                  >
                    {watered ? '✓ WATERED · $50 SENT' : '⛆ WATER NOW · $50'}
                  </button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                  {/* chart */}
                  <div className="md:col-span-2 border border-white/10 rounded-2xl p-4 bg-white/[0.02]">
                    <div className="flex justify-between items-baseline mb-3">
                      <span className="mono text-[9px] tracking-[0.3em] text-white/40">GROWTH RING — 8 MO</span>
                      <span className="display text-lg" style={{ color: plant.neon }}>{fmt(plant.balance)}</span>
                    </div>
                    <div className="h-44">
                      <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={plant.chart} margin={{ top: 4, right: 4, bottom: 0, left: -16 }}>
                          <defs>
                            <linearGradient id="growGrad" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="0%" stopColor={plant.neon} stopOpacity={0.45} />
                              <stop offset="100%" stopColor={plant.neon} stopOpacity={0} />
                            </linearGradient>
                          </defs>
                          <CartesianGrid stroke="rgba(255,255,255,0.06)" vertical={false} />
                          <XAxis dataKey="m" tick={{ fill: 'rgba(255,255,255,0.35)', fontSize: 9, fontFamily: 'Space Mono' }} axisLine={false} tickLine={false} />
                          <YAxis tick={{ fill: 'rgba(255,255,255,0.35)', fontSize: 9, fontFamily: 'Space Mono' }} axisLine={false} tickLine={false} tickFormatter={(v) => `$${v / 1000}k`} />
                          <Tooltip content={<ChartTip />} />
                          <Area type="monotone" dataKey="v" stroke={plant.neon} strokeWidth={2.5} fill="url(#growGrad)" dot={false} activeDot={{ r: 4, fill: plant.neon, stroke: '#000' }} />
                        </AreaChart>
                      </ResponsiveContainer>
                    </div>
                  </div>

                  {/* care card */}
                  <div className="border border-white/10 rounded-2xl p-4 bg-white/[0.02] flex flex-col">
                    <div className="mono text-[9px] tracking-[0.3em] text-white/40 mb-4">CARE CARD</div>
                    {[
                      { icon: Droplets, k: 'WATERING (DEPOSITS)', v: plant.cadence },
                      { icon: Sun, k: 'SUNLIGHT (YIELD)', v: plant.apy },
                      { icon: Shield, k: 'SOIL (RISK PROFILE)', v: plant.risk },
                      { icon: Clock, k: 'NEXT WATER', v: plant.nextWater },
                    ].map((row) => (
                      <div key={row.k} className="flex items-start gap-2.5 py-2.5 border-b border-white/8 last:border-0">
                        <row.icon size={13} style={{ color: plant.neon }} className="mt-0.5 shrink-0" />
                        <div>
                          <div className="mono text-[8px] tracking-[0.2em] text-white/40">{row.k}</div>
                          <div className="mono text-[11px] font-bold mt-0.5">{row.v}</div>
                        </div>
                      </div>
                    ))}
                    <div className="mt-auto pt-3">
                      <div className="flex justify-between mono text-[9px] tracking-[0.2em] text-white/40 mb-1.5">
                        <span>GOAL PROGRESS</span><span style={{ color: plant.neon }}>{Math.round((plant.balance / plant.target) * 100)}%</span>
                      </div>
                      <div className="h-2.5 rounded-full bg-white/8 overflow-hidden border border-white/10">
                        <motion.div initial={{ width: 0 }} animate={{ width: `${(plant.balance / plant.target) * 100}%` }} transition={{ duration: 0.8, ease: 'easeOut' }}
                          className="h-full rounded-full" style={{ background: `linear-gradient(90deg, ${plant.neon}, #ffffff)` }} />
                      </div>
                      <div className="mono text-[9px] text-white/40 mt-1.5 tracking-wider">{fmt(plant.target - plant.balance)} TO FULL BLOOM ({fmt(plant.target)})</div>
                    </div>
                  </div>
                </div>
              </motion.section>
            </AnimatePresence>

            {/* GROW SCHOOL */}
            <section className="border border-white/12 rounded-3xl rounded-br-[70px] p-6">
              <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
                <div>
                  <div className="display text-sm tracking-[0.3em] chrome-text">GROW SCHOOL</div>
                  <div className="mono text-[9px] tracking-[0.3em] text-white/40 mt-1">FIELD MANUAL FOR FEARLESS GARDENERS ✦ 04 MODULES</div>
                </div>
                <div className="flex gap-1.5 flex-wrap">
                  {Object.keys(LESSONS).map((k) => {
                    const Icon = LESSONS[k].icon;
                    const active = lesson === k;
                    return (
                      <button key={k} onClick={() => setLesson(k)}
                        className={`mono text-[10px] tracking-[0.22em] px-4 py-2 rounded-full border flex items-center gap-1.5 transition-all ${active ? 'text-black font-bold' : 'border-white/15 text-white/50 hover:text-white hover:border-white/40'}`}
                        style={active ? { background: LESSONS[k].neon, borderColor: LESSONS[k].neon, boxShadow: `0 0 18px ${LESSONS[k].neon}55` } : {}}>
                        <Icon size={12} /> {k}
                      </button>
                    );
                  })}
                </div>
              </div>

              <AnimatePresence mode="wait">
                <motion.div key={lesson} initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -10 }} transition={{ duration: 0.22 }}>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="border rounded-2xl p-5 flex flex-col" style={{ borderColor: `${L.neon}55`, background: `${L.neon}08` }}>
                      <L.icon size={22} style={{ color: L.neon }} className="mb-3" />
                      <h3 className="display text-[13px] leading-relaxed tracking-[0.12em] mb-3" style={{ color: L.neon }}>{L.title}</h3>
                      <p className="text-[13px] text-white/65 leading-relaxed">{L.blurb}</p>
                      <div className="mt-auto pt-5">
                        <div className="mono text-[8px] tracking-[0.25em] text-white/40">{L.stat.label}</div>
                        <div className="display text-2xl chrome-text mt-1">{L.stat.value}</div>
                      </div>
                    </div>

                    <div className="md:col-span-2 grid grid-cols-1 sm:grid-cols-3 gap-3">
                      {L.steps.map((s) => (
                        <div key={s.n} className="border border-white/10 rounded-2xl p-4 bg-white/[0.02] hover:border-white/30 hover:bg-white/[0.04] transition-all group flex flex-col">
                          <div className="flex items-center justify-between mb-3">
                            <span className="display text-xl" style={{ color: L.neon }}>{s.n}</span>
                            <Zap size={12} className="text-white/20 group-hover:text-white/60 transition-colors" />
                          </div>
                          <div className="display text-[10px] tracking-[0.18em] mb-2 leading-relaxed">{s.h}</div>
                          <p className="text-[12px] text-white/55 leading-relaxed">{s.p}</p>
                          <button className="mt-auto pt-4 mono text-[9px] tracking-[0.25em] flex items-center gap-1.5 text-white/40 group-hover:text-white transition-colors text-left">
                            START LESSON <ChevronRight size={11} />
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                </motion.div>
              </AnimatePresence>
            </section>

            {/* FOOTER STRIP */}
            <div className="flex flex-wrap items-center justify-between gap-3 px-2 pb-4">
              <div className="mono text-[9px] tracking-[0.3em] text-white/30 flex items-center gap-2">
                <Wallet size={11} /> BLOOMVAULT IS A FINANCIAL TECHNOLOGY COMPANY, NOT A BANK ✦ FUNDS FDIC-INSURED VIA PARTNER BANKS
              </div>
              <div className="mono text-[9px] tracking-[0.3em] text-white/30 flex items-center gap-2">
                <CircleDollarSign size={11} className="text-[#AAFF00]" /> EST. 1999 — STILL OPTIMISTIC ✦✦✦
              </div>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}