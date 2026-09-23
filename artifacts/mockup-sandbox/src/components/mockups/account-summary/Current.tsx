import { useState } from 'react';
import { ArrowUpRight } from 'lucide-react';

const accounts = [
  { id: 'everyday', name: 'Everyday Checking ·· 4821', current: 4280, low: 1240, lowDate: 'Jan 06', color: '#2563eb' },
  { id: 'reserve', name: 'Emergency Reserve ·· 1904', current: 12500, low: 9800, lowDate: 'Jan 14', color: '#0e7490' },
  { id: 'card', name: 'Travel Card ·· 7712', current: -640, low: -1120, lowDate: 'Jan 22', color: '#7c3aed' },
];

const money = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 0,
});

export function Current() {
  const [tracked, setTracked] = useState<Record<string, boolean>>({
    everyday: true,
    reserve: true,
    card: false,
  });
  const [focusedLow, setFocusedLow] = useState<string | null>(null);
  const trackedCount = Object.values(tracked).filter(Boolean).length;

  return (
    <main className="summary-preview summary-preview--compact">
      <div className="summary-preview__viewport">
        <section className="summary-panel simple-summary" aria-label="Current account outlook">
          <header className="simple-summary__header">
            <div>
              <strong className="simple-summary__title">Account outlook</strong>
              <span className="simple-summary__subtitle">Current balances and projected lows</span>
            </div>
            <span className="simple-summary__count">{trackedCount}/{accounts.length} tracked</span>
          </header>

          {focusedLow && (
            <div className="simple-summary__notice" role="status">
              Chart focus: projected low on {focusedLow}.
            </div>
          )}

          <div className="simple-summary__accounts">
            {accounts.map((account) => {
              const isTracked = Boolean(tracked[account.id]);
              const lowTone = account.low < 0 ? 'danger' : 'warning';

              return (
                <article className="simple-account-card" key={account.id}>
                  <div className="simple-account-card__identity">
                    <input
                      type="checkbox"
                      checked={isTracked}
                      onChange={() => setTracked((value) => ({ ...value, [account.id]: !value[account.id] }))}
                      aria-label={`${isTracked ? 'Exclude' : 'Include'} ${account.name}`}
                    />
                    <span className="simple-account-card__dot" style={{ backgroundColor: account.color, opacity: isTracked ? 1 : 0.4 }} aria-hidden="true" />
                    <div className="simple-account-card__name">
                      <strong>{account.name}</strong>
                      <span style={{ color: isTracked ? '#2563eb' : '#94a3b8' }}>
                        {isTracked ? 'Included in projection' : 'Hidden from projection'}
                      </span>
                    </div>
                  </div>

                  <div className="simple-account-card__metrics">
                    <div className="simple-account-card__metric">
                      <span className="simple-account-card__label">Current balance</span>
                      <strong className={`simple-summary__money${account.current < 0 ? ' simple-summary__money--danger' : ''}`}>
                        {money.format(account.current)}
                      </strong>
                      <span className="simple-summary__date">As of Jan 02</span>
                    </div>

                    <div className="simple-account-card__metric">
                      <span className="simple-account-card__label">Projected low</span>
                      <div className="simple-account-card__low">
                        <strong className={`simple-summary__money simple-summary__money--${lowTone}`}>
                          {money.format(account.low)}
                        </strong>
                        <button
                          className="simple-summary__jump"
                          type="button"
                          onClick={() => setFocusedLow(account.lowDate)}
                          aria-label={`Show chart for ${account.lowDate}`}
                          title={`Show chart for ${account.lowDate}`}
                        >
                          <ArrowUpRight size={13} aria-hidden="true" />
                        </button>
                      </div>
                      <span className={`simple-summary__date simple-summary__date--${lowTone}`}>Low on {account.lowDate}</span>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        </section>
      </div>
    </main>
  );
}