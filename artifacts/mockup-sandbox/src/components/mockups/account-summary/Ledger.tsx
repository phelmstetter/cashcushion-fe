import { useState } from 'react';
import {
  ArrowUpRight,
  CircleDollarSign,
  Eye,
  Landmark,
  TrendingDown,
} from 'lucide-react';
import '../../../mockup.css';

const accounts = [
  {
    id: 'everyday',
    name: 'Everyday Checking ·· 4821',
    current: 4280,
    low: 1240,
    lowDate: 'Jan 06',
    color: '#2563eb',
  },
  {
    id: 'reserve',
    name: 'Emergency Reserve ·· 1904',
    current: 12500,
    low: 9800,
    lowDate: 'Jan 14',
    color: '#0e7490',
  },
  {
    id: 'card',
    name: 'Travel Card ·· 7712',
    current: -640,
    low: -1120,
    lowDate: 'Jan 22',
    color: '#7c3aed',
  },
];

const money = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 0,
});

export function Ledger() {
  const [tracked, setTracked] = useState<Record<string, boolean>>({
    everyday: true,
    reserve: true,
    card: false,
  });
  const [focusedLow, setFocusedLow] = useState<string | null>(null);
  const trackedCount = Object.values(tracked).filter(Boolean).length;

  return (
    <main className="summary-preview">
      <section className="summary-panel" aria-label="Ledger account outlook">
        <header className="summary-panel__topline">
          <div className="summary-panel__identity">
            <span className="summary-panel__icon" aria-hidden="true">
              <Landmark size={18} />
            </span>
            <div>
              <p className="summary-panel__eyebrow">Ledger view</p>
              <h1 className="summary-panel__title">Account outlook</h1>
              <p className="summary-panel__meta">A quick register of what each account can carry</p>
            </div>
          </div>
          <span className="summary-panel__count" aria-label={`${trackedCount} of ${accounts.length} accounts tracked`}>
            {trackedCount}/{accounts.length} tracked
          </span>
        </header>

        {focusedLow && (
          <div className="summary-panel__notice" role="status" aria-live="polite">
            Projection focus set to the low on {focusedLow}.
          </div>
        )}

        <div className="summary-table-wrap" style={{ paddingTop: 12 }}>
          <table className="summary-table" style={{ minWidth: 660 }}>
            <colgroup>
              <col style={{ width: '8%' }} />
              <col style={{ width: '38%' }} />
              <col style={{ width: '25%' }} />
              <col style={{ width: '29%' }} />
            </colgroup>
            <thead>
              <tr>
                <th className="summary-table__track" scope="col">
                  <Eye size={14} aria-label="Include in projection" />
                </th>
                <th scope="col">Account register</th>
                <th scope="col">
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                    <CircleDollarSign size={14} aria-hidden="true" />
                    Current
                  </span>
                </th>
                <th scope="col">
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                    <TrendingDown size={14} aria-hidden="true" />
                    Projected low
                  </span>
                </th>
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
                        onChange={() =>
                          setTracked((value) => ({
                            ...value,
                            [account.id]: !value[account.id],
                          }))
                        }
                        aria-label={`${isTracked ? 'Exclude' : 'Include'} ${account.name}`}
                      />
                    </td>
                    <th scope="row">
                      <span className="summary-table__account">
                        <span
                          className="summary-table__rail"
                          style={{
                            backgroundColor: account.color,
                            opacity: isTracked ? 1 : 0.35,
                          }}
                          aria-hidden="true"
                        />
                        <span style={{ minWidth: 0 }}>
                          <span className="summary-table__account-name">{account.name}</span>
                          <span
                            className="summary-table__status"
                            style={{ color: isTracked ? '#2563eb' : '#94a3b8' }}
                          >
                            {isTracked ? 'Included in projection' : 'Excluded from projection'}
                          </span>
                        </span>
                      </span>
                    </th>
                    <td>
                      <strong
                        className={`summary-table__money${
                          account.current < 0 ? ' summary-table__money--danger' : ''
                        }`}
                      >
                        {money.format(account.current)}
                      </strong>
                      <span className="summary-table__date">As of Jan 02</span>
                    </td>
                    <td>
                      <div className="summary-table__low">
                        <strong className={`summary-table__money summary-table__money--${lowTone}`}>
                          {money.format(account.low)}
                        </strong>
                        <button
                          className="summary-table__jump"
                          type="button"
                          onClick={() => setFocusedLow(account.lowDate)}
                          aria-label={`Focus projected low on ${account.lowDate}`}
                          title={`Focus projected low on ${account.lowDate}`}
                        >
                          <ArrowUpRight size={14} aria-hidden="true" />
                        </button>
                      </div>
                      <span className={`summary-table__date summary-table__date--${lowTone}`}>
                        Low on {account.lowDate}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}