import { useState } from 'react';
import {
  ArrowUpRight,
  Check,
  CircleDollarSign,
  Eye,
  EyeOff,
  Landmark,
  TrendingDown,
} from 'lucide-react';
import '/src/mockup.css';

type Account = {
  id: string;
  name: string;
  current: number;
  low: number;
  lowDate: string;
  lowDay: string;
  color: string;
  distance: string;
};

const accounts: Account[] = [
  {
    id: 'everyday',
    name: 'Everyday Checking ·· 4821',
    current: 4280,
    low: 1240,
    lowDate: 'Jan 06',
    lowDay: 'in 4 days',
    color: '#2d71c9',
    distance: 'Comfortable headroom',
  },
  {
    id: 'reserve',
    name: 'Emergency Reserve ·· 1904',
    current: 12500,
    low: 9800,
    lowDate: 'Jan 14',
    lowDay: 'in 12 days',
    color: '#258a7d',
    distance: 'Strong buffer',
  },
  {
    id: 'card',
    name: 'Travel Card ·· 7712',
    current: -640,
    low: -1120,
    lowDate: 'Jan 22',
    lowDay: 'in 20 days',
    color: '#bf6f4e',
    distance: 'Crosses below zero',
  },
];

const money = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 0,
});

const css = {
  panel: {
    width: 'min(100%, 720px)',
    background: '#fbfdfc',
    border: '1px solid #d7e6e2',
    boxShadow: '0 18px 50px rgba(30, 76, 79, 0.11)',
  },
  header: {
    background: 'linear-gradient(120deg, #f5fbf7 0%, #eaf5f3 100%)',
    borderBottom: '1px solid #dcebe7',
  },
} as const;

function meterWidth(account: Account) {
  const spread = Math.abs(account.current - account.low);
  const reference = Math.max(Math.abs(account.current), 1);
  return `${Math.min(86, Math.max(22, 100 - (spread / reference) * 100))}%`;
}

export function Scorecard() {
  const [tracked, setTracked] = useState<Record<string, boolean>>({
    everyday: true,
    reserve: true,
    card: false,
  });
  const [focusedLow, setFocusedLow] = useState<string | null>(null);
  const trackedCount = Object.values(tracked).filter(Boolean).length;

  return (
    <main className="summary-preview" style={{ background: '#eef5f2' }}>
      <section className="summary-panel" style={css.panel} aria-label="Cash Cushion account scorecard">
        <header className="summary-panel__topline" style={css.header}>
          <div className="summary-panel__identity">
            <span
              className="summary-panel__icon"
              aria-hidden="true"
              style={{ color: '#1f756e', background: '#d5ebe5' }}
            >
              <Landmark size={18} />
            </span>
            <div>
              <p className="summary-panel__eyebrow" style={{ color: '#54827d' }}>Cash Cushion</p>
              <h1 className="summary-panel__title" style={{ color: '#153f43' }}>Account scorecard</h1>
              <p className="summary-panel__meta" style={{ color: '#64817e' }}>
                A quick read on where your cash is headed
              </p>
            </div>
          </div>
          <span
            className="summary-panel__count"
            style={{ color: '#216d67', background: '#f7fcfa', borderColor: '#b9dcd3' }}
          >
            {trackedCount}/{accounts.length} visible
          </span>
        </header>

        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 16,
            padding: '15px 20px 13px',
            color: '#66807d',
            fontSize: 12,
          }}
        >
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}>
            <CircleDollarSign size={15} color="#438e84" aria-hidden="true" />
            Projected through January 31
          </span>
          <span style={{ fontWeight: 700, color: '#44716e' }}>Updated today</span>
        </div>

        {focusedLow && (
          <div
            className="summary-panel__notice"
            style={{ color: '#85613a', background: '#fff8e9', borderColor: '#edd8a8' }}
            role="status"
          >
            <span>Showing the decision point for {focusedLow}.</span>
            <button
              type="button"
              onClick={() => setFocusedLow(null)}
              style={{
                marginLeft: 10,
                padding: 0,
                color: 'inherit',
                background: 'transparent',
                border: 0,
                fontSize: 12,
                fontWeight: 800,
                textDecoration: 'underline',
                cursor: 'pointer',
              }}
            >
              Clear
            </button>
          </div>
        )}

        <div style={{ padding: '0 20px 20px' }}>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'minmax(0, 1.25fr) minmax(130px, 0.75fr) minmax(145px, 0.9fr)',
              gap: 10,
              padding: '0 13px 9px',
              color: '#78918d',
              fontSize: 10,
              fontWeight: 800,
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
            }}
          >
            <span>Account</span>
            <span>Balance now</span>
            <span>Lowest point</span>
          </div>

          <div style={{ display: 'grid', gap: 9 }}>
            {accounts.map((account) => {
              const isTracked = Boolean(tracked[account.id]);
              const isDanger = account.low < 0;
              return (
                <article
                  key={account.id}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'minmax(0, 1.25fr) minmax(130px, 0.75fr) minmax(145px, 0.9fr)',
                    gap: 10,
                    alignItems: 'center',
                    padding: '16px 13px',
                    background: isTracked ? '#ffffff' : '#f6f9f7',
                    border: `1px solid ${isTracked ? '#dce9e5' : '#e5eeeb'}`,
                    borderRadius: 14,
                    opacity: isTracked ? 1 : 0.78,
                    transition: 'transform 160ms ease, border-color 160ms ease, box-shadow 160ms ease',
                  }}
                  onMouseEnter={(event) => {
                    event.currentTarget.style.transform = 'translateY(-1px)';
                    event.currentTarget.style.borderColor = '#b8d8d1';
                    event.currentTarget.style.boxShadow = '0 8px 20px rgba(45, 113, 106, 0.08)';
                  }}
                  onMouseLeave={(event) => {
                    event.currentTarget.style.transform = 'translateY(0)';
                    event.currentTarget.style.borderColor = isTracked ? '#dce9e5' : '#e5eeeb';
                    event.currentTarget.style.boxShadow = 'none';
                  }}
                >
                  <div style={{ minWidth: 0, display: 'flex', alignItems: 'flex-start', gap: 11 }}>
                    <span
                      aria-hidden="true"
                      style={{
                        flex: '0 0 auto',
                        width: 5,
                        height: 44,
                        marginTop: 1,
                        background: account.color,
                        borderRadius: 99,
                        opacity: isTracked ? 1 : 0.45,
                      }}
                    />
                    <div style={{ minWidth: 0 }}>
                      <strong
                        style={{
                          display: 'block',
                          overflow: 'hidden',
                          color: '#174247',
                          fontSize: 13,
                          fontWeight: 800,
                          lineHeight: 1.25,
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {account.name}
                      </strong>
                      <span style={{ display: 'block', marginTop: 7, color: isTracked ? '#2f8178' : '#8ca09c', fontSize: 10, fontWeight: 800 }}>
                        {isTracked ? 'Included in outlook' : 'Excluded from outlook'}
                      </span>
                    </div>
                  </div>

                  <div>
                    <strong
                      style={{
                        display: 'block',
                        color: account.current < 0 ? '#a85744' : '#174247',
                        fontSize: 21,
                        fontWeight: 800,
                        letterSpacing: '-0.04em',
                        lineHeight: 1,
                      }}
                    >
                      {money.format(account.current)}
                    </strong>
                    <span style={{ display: 'block', marginTop: 7, color: '#7a928f', fontSize: 10, fontWeight: 700 }}>
                      As of Jan 02
                    </span>
                  </div>

                  <div style={{ minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 7 }}>
                      <strong style={{ color: isDanger ? '#a85744' : '#765d3d', fontSize: 16, fontWeight: 800 }}>
                        {money.format(account.low)}
                      </strong>
                      <button
                        className="scorecard-card__button"
                        type="button"
                        onClick={() => setFocusedLow(account.lowDate)}
                        aria-label={`Show decision point for ${account.lowDate}`}
                        title={`Show decision point for ${account.lowDate}`}
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          flex: '0 0 auto',
                          width: 26,
                          height: 26,
                          color: isDanger ? '#a85744' : '#9a7443',
                          background: isDanger ? '#fff1ed' : '#fff8e9',
                          border: `1px solid ${isDanger ? '#e9b8aa' : '#ebd6a8'}`,
                          borderRadius: 999,
                          cursor: 'pointer',
                          transition: 'transform 160ms ease, background-color 160ms ease',
                        }}
                        onMouseEnter={(event) => {
                          event.currentTarget.style.transform = 'translateY(-1px)';
                          event.currentTarget.style.backgroundColor = isDanger ? '#ffe5df' : '#fff0cc';
                        }}
                        onMouseLeave={(event) => {
                          event.currentTarget.style.transform = 'translateY(0)';
                          event.currentTarget.style.backgroundColor = isDanger ? '#fff1ed' : '#fff8e9';
                        }}
                      >
                        <ArrowUpRight size={14} aria-hidden="true" />
                      </button>
                    </div>
                    <div style={{ height: 5, marginTop: 9, overflow: 'hidden', background: '#e8f0ed', borderRadius: 99 }}>
                      <span style={{ display: 'block', width: meterWidth(account), height: '100%', background: isDanger ? '#c67a62' : account.color, borderRadius: 99 }} />
                    </div>
                    <span
                      className="scorecard-card__date"
                      style={{
                        color: isDanger ? '#a85744' : '#80623c',
                        background: isDanger ? '#fff1ed' : '#fff8e9',
                      }}
                    >
                      Low on {account.lowDate} · {account.lowDay}
                    </span>
                  </div>

                  <button
                    type="button"
                    aria-label={`${isTracked ? 'Exclude' : 'Include'} ${account.name}`}
                    aria-pressed={isTracked}
                    onClick={() => setTracked((value) => ({ ...value, [account.id]: !value[account.id] }))}
                    style={{
                      gridColumn: '1 / -1',
                      justifySelf: 'start',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 6,
                      marginTop: -2,
                      padding: '5px 8px',
                      color: isTracked ? '#33776f' : '#748b87',
                      background: isTracked ? '#edf8f4' : '#f0f5f2',
                      border: `1px solid ${isTracked ? '#cbe5dd' : '#dbe8e3'}`,
                      borderRadius: 7,
                      fontSize: 10,
                      fontWeight: 800,
                      cursor: 'pointer',
                      transition: 'background-color 160ms ease, color 160ms ease, transform 160ms ease',
                    }}
                    onMouseDown={(event) => {
                      event.currentTarget.style.transform = 'scale(0.98)';
                    }}
                    onMouseUp={(event) => {
                      event.currentTarget.style.transform = 'scale(1)';
                    }}
                  >
                    {isTracked ? <Check size={13} aria-hidden="true" /> : <EyeOff size={13} aria-hidden="true" />}
                    {isTracked ? 'Visible in outlook' : 'Add to outlook'}
                    {!isTracked && <Eye size={13} aria-hidden="true" />}
                  </button>
                </article>
              );
            })}
          </div>
        </div>
      </section>
    </main>
  );
}