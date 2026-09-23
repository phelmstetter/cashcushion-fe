import { useState } from 'react';
import { ArrowUpRight, CircleDollarSign, Eye, Landmark, TrendingDown } from 'lucide-react';

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
        <section className="summary-panel" aria-label="Current account outlook">
        <header className="summary-panel__topline">
          <div className="summary-panel__identity">
            <span className="summary-panel__icon" aria-hidden="true"><Landmark size={18} /></span>
            <div>
              <p className="summary-panel__eyebrow">Current version</p>
              <h1 className="summary-panel__title">Account outlook</h1>
              <p className="summary-panel__meta">Current balances and projected lows</p>
            </div>
          </div>
          <span className="summary-panel__count">{trackedCount}/{accounts.length} tracked</span>
        </header>

        {focusedLow && <div className="summary-panel__notice">Chart jump ready for the projected low on {focusedLow}.</div>}

        <div className="summary-table-wrap">
          <table className="summary-table">
            <colgroup>
              <col style={{ width: '20px' }} />
              <col style={{ width: 'calc((100% - 20px) / 3)' }} />
              <col style={{ width: 'calc((100% - 20px) / 3)' }} />
              <col style={{ width: 'calc((100% - 20px) / 3)' }} />
            </colgroup>
            <thead>
              <tr>
                <th className="summary-table__track" scope="col"><Eye size={14} aria-hidden="true" /></th>
                <th scope="col">Account</th>
                <th scope="col"><span className="summary-table__heading"><CircleDollarSign size={14} aria-hidden="true" /> Current balance</span></th>
                <th scope="col"><span className="summary-table__heading"><TrendingDown size={14} aria-hidden="true" /> Low balance</span></th>
              </tr>
            </thead>
            <tbody>
              {accounts.map((account) => {
                const isTracked = Boolean(tracked[account.id]);
                const lowTone = account.low < 0 ? 'danger' : 'warning';
                return (
                  <tr key={account.id}>
                    <td className="summary-table__track">
                      <input
                        type="checkbox"
                        checked={isTracked}
                        onChange={() => setTracked((value) => ({ ...value, [account.id]: !value[account.id] }))}
                        aria-label={`${isTracked ? 'Exclude' : 'Include'} ${account.name}`}
                      />
                    </td>
                    <th scope="row">
                      <span className="summary-table__account">
                        <span className="summary-table__rail" style={{ backgroundColor: account.color, opacity: isTracked ? 1 : 0.4 }} aria-hidden="true" />
                        <span style={{ minWidth: 0 }}>
                          <span className="summary-table__account-name">{account.name}</span>
                          <span className="summary-table__status" style={{ color: isTracked ? '#2563eb' : '#94a3b8' }}>
                            {isTracked ? 'Included in projection' : 'Hidden from projection'}
                          </span>
                        </span>
                      </span>
                    </th>
                    <td>
                      <strong className={`summary-table__money${account.current < 0 ? ' summary-table__money--danger' : ''}`}>{money.format(account.current)}</strong>
                      <span className="summary-table__date">As of Jan 02</span>
                    </td>
                    <td>
                      <div className="summary-table__low">
                        <strong className={`summary-table__money summary-table__money--${lowTone}`}>{money.format(account.low)}</strong>
                        <button className="summary-table__jump" type="button" onClick={() => setFocusedLow(account.lowDate)} aria-label={`Show chart for ${account.lowDate}`} title={`Show chart for ${account.lowDate}`}>
                          <ArrowUpRight size={14} aria-hidden="true" />
                        </button>
                      </div>
                      <span className={`summary-table__date summary-table__date--${lowTone}`}>Low on {account.lowDate}</span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        </section>
      </div>
    </main>
  );
}