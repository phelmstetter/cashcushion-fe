import type { Account } from "@/lib/firebase";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
  ReferenceDot,
} from "recharts";

type ProjectionChartProps = {
  chartData: Array<Record<string, string | number | null>>;
  accounts: Account[];
  includedAccountIds: string[];
  activeDate: string | null;
  formatDate: (dateString: string) => string;
  windowHeight: number;
  onDateHover?: (date: string) => void;
  onDateSelect?: (date: string) => void;
  onAccountToggle: (accountId: string) => void;
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
  includedAccountIds,
  activeDate,
  formatDate,
  windowHeight,
  onDateHover,
  onDateSelect,
  onAccountToggle,
}: ProjectionChartProps) {
  const containerHeight = `${windowHeight}svh`;
  const includedAccountIdSet = new Set(includedAccountIds);
  const visibleAccounts = accounts.filter((account) => includedAccountIdSet.has(account.account_id));
  const firstChartDate = chartData.find((point) => typeof point.fullDate === 'string')?.fullDate as string | undefined;
  const selectedChartDate = activeDate && chartData.some((point) => point.fullDate === activeDate)
    ? activeDate
    : null;
  const detailDate = selectedChartDate
    ? selectedChartDate
    : firstChartDate ?? null;
  const detailPoint = detailDate
    ? chartData.find((point) => point.fullDate === detailDate)
    : undefined;
  const selectedChartIndex = selectedChartDate
    ? chartData.findIndex((point) => point.fullDate === selectedChartDate)
    : -1;
  const calloutPosition = selectedChartIndex >= 0 && chartData.length > 1
    ? 10 + (80 * selectedChartIndex) / (chartData.length - 1)
    : 50;

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
      isIncluded: includedAccountIdSet.has(account.account_id),
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
        height: containerHeight,
      }}
    >
      {accounts.length > 0 && (
        <div
          data-testid="account-balance-summary"
          style={{
            backgroundColor: '#ffffff',
            border: '1px solid #526b7c',
            borderBottom: '3px solid #526b7c',
            borderTop: '4px solid #526b7c',
            borderRadius: '8px 8px 0 0',
            boxShadow: '0 1px 3px rgba(45, 65, 78, 0.24)',
            boxSizing: 'border-box',
            flex: '0 1 auto',
            maxHeight: '40%',
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
              minWidth: '340px',
            }}
          >
            <thead>
              <tr style={{ color: '#405866', fontSize: '11px', textAlign: 'left' }}>
                <th scope="col" style={{ backgroundColor: '#ffffff', padding: '3px 6px 5px 10px', position: 'sticky', textAlign: 'center', top: 0, width: '12%', zIndex: 1 }}>Show</th>
                <th scope="col" style={{ backgroundColor: '#ffffff', padding: '3px 8px 5px', position: 'sticky', top: 0, width: '34%', zIndex: 1 }}>Account</th>
                <th scope="col" style={{ backgroundColor: '#ffffff', padding: '3px 8px 5px', position: 'sticky', top: 0, width: '25%', zIndex: 1 }}>Current balance</th>
                <th scope="col" style={{ backgroundColor: '#ffffff', padding: '3px 10px 5px', position: 'sticky', top: 0, width: '29%', zIndex: 1 }}>Low balance (date)</th>
              </tr>
            </thead>
            <tbody>
              {accountSummaries.map(({ account, color, isIncluded, minimumBalance, minimumDate }) => (
                <tr key={account.account_id} style={{ borderTop: '1px solid #dce5e9', opacity: isIncluded ? 1 : 0.55 }}>
                  <td style={{ padding: '7px 6px 7px 10px', textAlign: 'center', verticalAlign: 'top' }}>
                    <input
                      type="checkbox"
                      checked={isIncluded}
                      onChange={() => onAccountToggle(account.account_id)}
                      aria-label={`${isIncluded ? 'Exclude' : 'Include'} ${accountLabel(account)}`}
                      style={{ accentColor: color, cursor: 'pointer', margin: 0 }}
                    />
                  </td>
                  <th
                    scope="row"
                    style={{
                      color: '#263238',
                      fontWeight: 600,
                      overflowWrap: 'anywhere',
                      padding: '7px 8px',
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
                  <td style={{ color: '#263238', fontWeight: 600, overflowWrap: 'anywhere', padding: '7px 8px', verticalAlign: 'top' }}>
                    {typeof account.available_balance === 'number' && Number.isFinite(account.available_balance)
                      ? currencyFormatter.format(account.available_balance)
                      : '—'}
                  </td>
                  <td style={{ color: '#37474f', padding: '7px 10px', verticalAlign: 'top', whiteSpace: 'nowrap' }}>
                    {minimumBalance != null && minimumDate
                      ? <><strong>{currencyFormatter.format(minimumBalance)}</strong><span style={{ color: '#607d8b' }}> ({abbreviatedDate(minimumDate)})</span></>
                      : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div
        style={{
          boxSizing: 'border-box',
          flex: '1 1 0',
          minHeight: 0,
          position: 'relative',
          backgroundColor: 'white',
          border: '1px solid #eee',
          borderTop: accounts.length > 0 ? 'none' : undefined,
          borderRadius: accounts.length === 0
            ? '8px'
            : visibleAccounts.length === 0 || !detailDate
              ? '0 0 8px 8px'
              : '0',
          overflow: 'hidden',
        }}
      >
        {visibleAccounts.length > 0 && chartData.length > 0 ? (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart
              data={chartData}
              margin={{ top: 8, right: 12, left: 0, bottom: 0 }}
              onMouseMove={(state) => {
                const nextDate = state?.activeLabel;
                if (typeof nextDate === 'string') {
                  onDateHover?.(nextDate);
                }
              }}
              onClick={(state) => {
                if (typeof state?.activeLabel === 'string') {
                  onDateSelect?.(state.activeLabel);
                }
              }}
            >
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
                content={() => null}
                cursor={false}
              />
              <ReferenceLine
                y={0}
                stroke="#999"
                strokeDasharray="3 3"
                strokeWidth={1}
                ifOverflow="extendDomain"
              />
              {accountSummaries.filter(({ isIncluded }) => isIncluded).map(({ account, color }) => (
                <Line
                  key={account.account_id}
                  type="stepAfter"
                  dataKey={account.account_id}
                  stroke={color}
                  strokeWidth={2}
                  dot={false}
                  activeDot={false}
                />
              ))}
              {selectedChartDate && (
                <>
                  <ReferenceLine
                    x={selectedChartDate}
                    stroke="#78909c"
                    strokeWidth={1}
                  />
                  {accountSummaries.filter(({ isIncluded }) => isIncluded).map(({ account, color }) => {
                    const balance = detailPoint?.[account.account_id];
                    if (typeof balance !== 'number' || !Number.isFinite(balance)) return null;

                    return (
                      <ReferenceDot
                        key={account.account_id}
                        x={selectedChartDate}
                        y={balance}
                        r={4}
                        fill={color}
                        stroke="#ffffff"
                        strokeWidth={2}
                      />
                    );
                  })}
                </>
              )}
            </LineChart>
          </ResponsiveContainer>
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#999', fontSize: '14px' }}>
            {accounts.length > 0 ? 'No accounts included' : 'No account data'}
          </div>
        )}
        {selectedChartDate && detailPoint && (
          <div
            data-testid="chart-balance-callout"
            aria-label={`Projected balances on ${formatDate(selectedChartDate)}`}
            style={{
              backgroundColor: '#ffffff',
              border: '1px solid #b9c8d0',
              borderRadius: '6px',
              boxShadow: '0 2px 7px rgba(45, 65, 78, 0.24)',
              boxSizing: 'border-box',
              left: `clamp(92px, ${calloutPosition}%, calc(100% - 92px))`,
              maxHeight: '55%',
              maxWidth: 'calc(100% - 24px)',
              minWidth: '150px',
              overflow: 'auto',
              padding: '7px 9px',
              pointerEvents: 'none',
              position: 'absolute',
              top: '10px',
              transform: 'translateX(-50%)',
              zIndex: 2,
            }}
          >
            <div
              aria-hidden="true"
              style={{
                backgroundColor: '#ffffff',
                borderBottom: '1px solid #b9c8d0',
                borderRight: '1px solid #b9c8d0',
                bottom: '-5px',
                height: '8px',
                left: '50%',
                position: 'absolute',
                transform: 'translateX(-50%) rotate(45deg)',
                width: '8px',
              }}
            />
            <time
              dateTime={selectedChartDate}
              style={{
                color: '#405866',
                display: 'block',
                fontSize: '12px',
                fontWeight: 700,
                marginBottom: '4px',
                whiteSpace: 'nowrap',
              }}
            >
              {formatDate(selectedChartDate)}
            </time>
            {accountSummaries.filter(({ isIncluded }) => isIncluded).map(({ account, color }) => {
              const balance = detailPoint[account.account_id];
              return (
                <div
                  key={account.account_id}
                  style={{
                    alignItems: 'center',
                    color: '#333',
                    display: 'flex',
                    fontSize: '12px',
                    gap: '5px',
                    justifyContent: 'space-between',
                    lineHeight: 1.45,
                    whiteSpace: 'nowrap',
                  }}
                >
                  <span style={{ alignItems: 'center', display: 'flex', gap: '5px', minWidth: 0 }}>
                    <span
                      aria-hidden="true"
                      style={{
                        backgroundColor: color,
                        borderRadius: '50%',
                        flexShrink: 0,
                        height: '7px',
                        width: '7px',
                      }}
                    />
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{accountLabel(account)}</span>
                  </span>
                  <strong>
                    {typeof balance === 'number' && Number.isFinite(balance)
                      ? currencyFormatter.format(balance)
                      : '—'}
                  </strong>
                </div>
              );
            })}
          </div>
        )}
      </div>
      {visibleAccounts.length > 0 && detailDate && (
        <div
          data-testid="chart-detail-strip"
          aria-label={`Projected balances on ${formatDate(detailDate)}`}
          style={{
            alignItems: 'center',
            backgroundColor: '#f6f8f9',
            border: '1px solid #e2e8ec',
            borderTop: 'none',
            borderRadius: '0 0 8px 8px',
            boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
            boxSizing: 'border-box',
            display: 'flex',
            flex: '0 0 auto',
            gap: '12px',
            overflowX: 'auto',
            padding: '6px 10px',
          }}
        >
          <time
            dateTime={detailDate}
            style={{
              color: '#405866',
              flexShrink: 0,
              fontSize: '12px',
              fontWeight: 700,
            }}
          >
            {formatDate(detailDate)}
          </time>
          {accountSummaries.filter(({ isIncluded }) => isIncluded).map(({ account, color }) => {
            const balance = detailPoint?.[account.account_id];
            return (
              <div
                key={account.account_id}
                style={{
                  alignItems: 'center',
                  color: '#333',
                  display: 'flex',
                  flexShrink: 0,
                  fontSize: '12px',
                  gap: '5px',
                  whiteSpace: 'nowrap',
                }}
              >
                <span
                  aria-hidden="true"
                  style={{
                    backgroundColor: color,
                    borderRadius: '50%',
                    height: '8px',
                    width: '8px',
                  }}
                />
                <span>{accountLabel(account)}</span>
                <strong>
                  {typeof balance === 'number' && Number.isFinite(balance)
                    ? currencyFormatter.format(balance)
                    : '—'}
                </strong>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}