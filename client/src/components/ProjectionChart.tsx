import { useState } from "react";
import type { Account } from "@/lib/firebase";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";

type ProjectionChartProps = {
  chartData: Array<Record<string, string | number | null>>;
  accounts: Account[];
  formatDate: (dateString: string) => string;
};

const CHART_COLORS = ['#1976d2', '#e53935', '#43a047', '#fb8c00', '#8e24aa', '#00acc1', '#d81b60', '#6d4c41'];
const currencyFormatter = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

function accountLabel(account: Account) {
  return [account.name || 'Unnamed account', account.mask].filter(Boolean).join(' ');
}

function abbreviatedDate(dateString: string) {
  const date = /^\d{4}-\d{2}-\d{2}$/.test(dateString)
    ? new Date(`${dateString}T00:00:00`)
    : new Date(dateString);

  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  });
}

export default function ProjectionChart({
  chartData,
  accounts,
  formatDate,
}: ProjectionChartProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const containerMaxHeight = isExpanded ? '50svh' : '33.333svh';
  const chartHeight = accounts.length > 0
    ? (isExpanded ? '30svh' : '20svh')
    : containerMaxHeight;
  const summaryMaxHeight = isExpanded ? '20svh' : '13.333svh';

  const accountSummaries = accounts.map((account, index) => {
    let minimumBalance: number | null = null;
    let minimumDate: string | null = null;

    for (const point of chartData) {
      const balance = point[account.account_id];
      if (typeof balance !== 'number' || !Number.isFinite(balance)) continue;

      if (minimumBalance == null || balance < minimumBalance) {
        minimumBalance = balance;
        minimumDate = typeof point.fullDate === 'string' ? point.fullDate : null;
      }
    }

    return {
      account,
      color: CHART_COLORS[index % CHART_COLORS.length],
      minimumBalance,
      minimumDate,
    };
  });

  return (
    <div
      data-testid="chart-container"
      style={{
        boxSizing: 'border-box',
        display: 'flex',
        flexDirection: 'column',
        maxHeight: containerMaxHeight,
      }}
    >
      <div
        style={{
          boxSizing: 'border-box',
          flexShrink: 0,
          height: chartHeight,
          backgroundColor: 'white',
          borderRadius: accounts.length > 0 ? '8px 8px 0 0' : '8px',
          boxShadow: accounts.length > 0 ? '0 1px 3px rgba(0,0,0,0.1)' : undefined,
          border: '1px solid #eee',
          overflow: 'hidden',
          position: 'relative',
        }}
      >
        <button
          type="button"
          onClick={() => setIsExpanded((expanded) => !expanded)}
          aria-label={isExpanded ? 'Minimize chart' : 'Maximize chart'}
          title={isExpanded ? 'Minimize chart' : 'Maximize chart'}
          style={{
            backgroundColor: 'rgba(255, 255, 255, 0.92)',
            border: '1px solid #d0d0d0',
            borderRadius: '4px',
            color: '#555',
            cursor: 'pointer',
            fontSize: '10px',
            fontWeight: 600,
            padding: '3px 6px',
            position: 'absolute',
            right: '6px',
            top: '6px',
            zIndex: 1,
          }}
        >
          {isExpanded ? 'Min' : 'Max'}
        </button>
        {chartData.length > 0 ? (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
              <XAxis
                dataKey="fullDate"
                tick={{ fontSize: 10 }}
                interval={Math.floor(chartData.length / 6)}
                tickLine={false}
                tickFormatter={(value: string) => formatDate(value).replace(/, \d{4}$/, '')}
              />
              <YAxis
                tick={{ fontSize: 10 }}
                tickFormatter={(v: number) => `$${(v / 1000).toFixed(1)}k`}
                width={48}
                tickLine={false}
                axisLine={false}
              />
              <Tooltip
                formatter={(value: number, name: string) => {
                  const acct = accounts.find(a => a.account_id === name);
                  const label = acct ? `${acct.name} ${acct.mask}` : name;
                  return [currencyFormatter.format(value), label];
                }}
                labelFormatter={(label: string) => formatDate(label)}
                contentStyle={{ fontSize: '12px', borderRadius: '6px' }}
              />
              <ReferenceLine
                y={0}
                stroke="#999"
                strokeDasharray="3 3"
                strokeWidth={1}
                ifOverflow="extendDomain"
              />
              {accounts.map((acct, i) => (
                <Line
                  key={acct.account_id}
                  type="stepAfter"
                  dataKey={acct.account_id}
                  stroke={CHART_COLORS[i % CHART_COLORS.length]}
                  strokeWidth={2}
                  dot={false}
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#999', fontSize: '14px' }}>
            No account data
          </div>
        )}
      </div>
      {accounts.length > 0 && (
        <div
          data-testid="account-balance-summary"
          style={{
            backgroundColor: '#fafafa',
            border: '1px solid #eee',
            borderTop: 'none',
            borderRadius: '0 0 8px 8px',
            boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
            boxSizing: 'border-box',
            maxHeight: summaryMaxHeight,
            overflow: 'auto',
          }}
        >
          <table
            aria-label="Account balance summary"
            style={{
              borderCollapse: 'collapse',
              fontSize: '12px',
              tableLayout: 'fixed',
              width: '100%',
              minWidth: '320px',
            }}
          >
            <thead>
              <tr style={{ color: '#666', fontSize: '11px', textAlign: 'left' }}>
                <th scope="col" style={{ backgroundColor: '#fafafa', padding: '3px 10px 5px', position: 'sticky', top: 0, width: '42%', zIndex: 1 }}>Account</th>
                <th scope="col" style={{ backgroundColor: '#fafafa', padding: '3px 8px 5px', position: 'sticky', top: 0, width: '26%', zIndex: 1 }}>Current balance</th>
                <th scope="col" style={{ backgroundColor: '#fafafa', padding: '3px 10px 5px', position: 'sticky', top: 0, width: '32%', zIndex: 1 }}>Low balance (date)</th>
              </tr>
            </thead>
            <tbody>
              {accountSummaries.map(({ account, color, minimumBalance, minimumDate }) => (
                <tr key={account.account_id} style={{ borderTop: '1px solid #e7e7e7' }}>
                  <th
                    scope="row"
                    style={{
                      color,
                      fontWeight: 600,
                      overflowWrap: 'anywhere',
                      padding: '7px 10px',
                      textAlign: 'left',
                      verticalAlign: 'top',
                    }}
                  >
                    <span
                      aria-hidden="true"
                      style={{
                        backgroundColor: color,
                        borderRadius: '50%',
                        display: 'inline-block',
                        height: '8px',
                        marginRight: '6px',
                        width: '8px',
                      }}
                    />
                    {accountLabel(account)}
                  </th>
                  <td style={{ color: '#333', fontWeight: 600, overflowWrap: 'anywhere', padding: '7px 8px', verticalAlign: 'top' }}>
                    {typeof account.available_balance === 'number' && Number.isFinite(account.available_balance)
                      ? currencyFormatter.format(account.available_balance)
                      : '—'}
                  </td>
                  <td style={{ color: '#333', padding: '7px 10px', verticalAlign: 'top', whiteSpace: 'nowrap' }}>
                    {minimumBalance != null && minimumDate
                      ? <><strong>{currencyFormatter.format(minimumBalance)}</strong><span style={{ color: '#666' }}> ({abbreviatedDate(minimumDate)})</span></>
                      : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}