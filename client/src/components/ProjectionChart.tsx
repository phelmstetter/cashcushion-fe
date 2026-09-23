import type { Account } from "@/lib/firebase";
import { MessageCircle, SquareArrowOutUpRight } from "lucide-react";
import { useEffect, useState } from "react";
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
const CALLOUT_TRANSITION_MS = 220;
const currencyFormatter = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

function accountLabel(account: Account) {
  return [account.name || 'Unnamed account', account.mask].filter(Boolean).join(' ');
}

function compactDate(dateString: string) {
  return new Date(`${dateString}T00:00:00`).toLocaleDateString('en-US', {
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
  const [calloutOpen, setCalloutOpen] = useState(true);
  const [calloutClosing, setCalloutClosing] = useState(false);
  const [displayMode, setDisplayMode] = useState<'chart' | 'summary'>('chart');
  const containerHeight = `${windowHeight}svh`;
  const includedAccountIdSet = new Set(includedAccountIds);
  const visibleAccounts = accounts.filter((account) => includedAccountIdSet.has(account.account_id));
  const selectedChartDate = activeDate && chartData.some((point) => point.fullDate === activeDate)
    ? activeDate
    : null;
  const detailPoint = selectedChartDate
    ? chartData.find((point) => point.fullDate === selectedChartDate)
    : undefined;
  const selectedChartIndex = selectedChartDate
    ? chartData.findIndex((point) => point.fullDate === selectedChartDate)
    : -1;
  const calloutPosition = selectedChartIndex >= 0 && chartData.length > 1
    ? 10 + (80 * selectedChartIndex) / (chartData.length - 1)
    : 50;
  const calloutLeft = `clamp(92px, ${calloutPosition}%, calc(100% - 92px))`;
  const currentBalanceDate = typeof chartData[0]?.fullDate === 'string'
    ? chartData[0].fullDate
    : null;

  useEffect(() => {
    if (!calloutClosing) return;

    const timeoutId = window.setTimeout(() => {
      setCalloutClosing(false);
      setCalloutOpen(false);
    }, CALLOUT_TRANSITION_MS);

    return () => window.clearTimeout(timeoutId);
  }, [calloutClosing]);

  const closeCallout = () => {
    if (calloutClosing) return;
    setCalloutClosing(true);
  };

  const openCallout = () => {
    setCalloutClosing(false);
    setCalloutOpen(true);
  };

  const jumpToLowBalance = (date: string) => {
    setDisplayMode('chart');
    onDateSelect?.(date);
  };

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
      {displayMode === 'summary' && accounts.length > 0 && (
        <div
          data-testid="account-balance-summary"
          style={{
            backgroundColor: '#ffffff',
            borderRadius: '8px',
            boxSizing: 'border-box',
            flex: '1 1 0',
            maxHeight: 'none',
            overflow: 'auto',
          }}
        >
          <table
            aria-label="Account balance summary"
            style={{
              borderCollapse: 'collapse',
              fontSize: '14px',
              tableLayout: 'fixed',
              width: '100%',
            }}
          >
            <colgroup>
              <col style={{ width: '12%' }} />
              <col style={{ width: '30%' }} />
              <col style={{ width: '29%' }} />
              <col style={{ width: '29%' }} />
            </colgroup>
            <thead>
              <tr style={{ color: '#405866', fontSize: '12px', textAlign: 'left' }}>
                <th scope="col" style={{ backgroundColor: '#ffffff', boxSizing: 'border-box', padding: '8px 4px 7px', position: 'sticky', textAlign: 'center', top: 0, zIndex: 1 }}>Show</th>
                <th scope="col" style={{ backgroundColor: '#ffffff', boxSizing: 'border-box', padding: '8px 7px 7px', position: 'sticky', top: 0, zIndex: 1 }}>Account</th>
                <th scope="col" style={{ backgroundColor: '#ffffff', boxSizing: 'border-box', padding: '8px 7px 7px', position: 'sticky', top: 0, whiteSpace: 'nowrap', zIndex: 1 }}>Current balance</th>
                <th scope="col" style={{ backgroundColor: '#ffffff', boxSizing: 'border-box', padding: '8px 6px 7px', position: 'sticky', top: 0, whiteSpace: 'nowrap', zIndex: 1 }}>Low balance</th>
              </tr>
            </thead>
            <tbody>
              {accountSummaries.map(({ account, color, isIncluded, minimumBalance, minimumDate }) => (
                <tr key={account.account_id} style={{ borderTop: '1px solid #dce5e9', opacity: isIncluded ? 1 : 0.55 }}>
                  <td style={{ boxSizing: 'border-box', padding: '10px 4px', textAlign: 'center', verticalAlign: 'top' }}>
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
                      boxSizing: 'border-box',
                      fontWeight: 600,
                      overflowWrap: 'anywhere',
                      padding: '10px 7px',
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
                  <td style={{ boxSizing: 'border-box', color: '#263238', padding: '10px 7px', verticalAlign: 'top', whiteSpace: 'nowrap' }}>
                    {typeof account.available_balance === 'number' && Number.isFinite(account.available_balance) ? (
                      <>
                        <strong style={{ display: 'block', fontSize: '16px', lineHeight: 1.25 }}>{currencyFormatter.format(account.available_balance)}</strong>
                        {currentBalanceDate && (
                          <time
                            dateTime={currentBalanceDate}
                            aria-label={`Current balance date: ${formatDate(currentBalanceDate)}`}
                            title={formatDate(currentBalanceDate)}
                            style={{ color: '#607d8b', display: 'block', fontSize: '11px', lineHeight: 1.3, marginTop: '2px' }}
                          >
                            {compactDate(currentBalanceDate)}
                          </time>
                        )}
                      </>
                    ) : '—'}
                  </td>
                  <td style={{ boxSizing: 'border-box', color: '#37474f', padding: '10px 6px', verticalAlign: 'top', whiteSpace: 'nowrap' }}>
                    {minimumBalance != null && minimumDate ? (
                      <>
                        <div style={{ alignItems: 'center', display: 'flex', gap: '4px' }}>
                          <strong style={{ display: 'block', fontSize: '16px', lineHeight: 1.25 }}>{currencyFormatter.format(minimumBalance)}</strong>
                          <button
                            type="button"
                            aria-label={`Show the chart and transactions for the projected low balance on ${formatDate(minimumDate)}`}
                            title={`Show chart and transactions for ${formatDate(minimumDate)}`}
                            onClick={() => jumpToLowBalance(minimumDate)}
                            style={{
                              alignItems: 'center',
                              backgroundColor: '#edf4f7',
                              border: '1px solid #b8ccd6',
                              borderRadius: '4px',
                              color: '#405f70',
                              cursor: 'pointer',
                              display: 'inline-flex',
                              flexShrink: 0,
                              height: '22px',
                              justifyContent: 'center',
                              padding: 0,
                              width: '22px',
                            }}
                          >
                            <SquareArrowOutUpRight aria-hidden="true" size={14} strokeWidth={2.25} />
                          </button>
                        </div>
                        <time
                          dateTime={minimumDate}
                          aria-label={`Projected low balance date: ${formatDate(minimumDate)}`}
                          title={formatDate(minimumDate)}
                          style={{ color: '#607d8b', display: 'block', fontSize: '11px', lineHeight: 1.3, marginTop: '2px' }}
                        >
                          {compactDate(minimumDate)}
                        </time>
                      </>
                    ) : '—'}
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
          display: displayMode === 'chart' ? 'block' : 'none',
          flex: '1 1 0',
          minHeight: 0,
          position: 'relative',
          backgroundColor: 'white',
          border: '1px solid #eee',
          borderRadius: '8px',
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
                        onClick={openCallout}
                        style={{ cursor: calloutOpen ? 'default' : 'pointer' }}
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
        {(calloutOpen || calloutClosing) && selectedChartDate && detailPoint && (
          <div
            data-testid="chart-balance-callout"
            aria-label={`Projected balances on ${formatDate(selectedChartDate)}`}
            style={{
              backgroundColor: '#ffffff',
              border: '1px solid #b9c8d0',
              borderRadius: '6px',
              boxShadow: '0 2px 7px rgba(45, 65, 78, 0.24)',
              boxSizing: 'border-box',
              left: calloutClosing ? 'calc(100% - 12px)' : calloutLeft,
              maxHeight: '55%',
              maxWidth: 'calc(100% - 24px)',
              minWidth: '150px',
              overflow: 'auto',
              padding: '7px 9px',
              opacity: calloutClosing ? 0 : 1,
              pointerEvents: calloutClosing ? 'none' : 'auto',
              position: 'absolute',
              top: '10px',
              transform: calloutClosing ? 'translateX(calc(-50% - 15px)) scale(0.14)' : 'translateX(-50%) scale(1)',
              transformOrigin: 'center center',
              transition: `left ${CALLOUT_TRANSITION_MS}ms cubic-bezier(0.4, 0, 0.2, 1), opacity ${CALLOUT_TRANSITION_MS}ms ease, transform ${CALLOUT_TRANSITION_MS}ms cubic-bezier(0.4, 0, 0.2, 1)`,
              zIndex: 2,
            }}
          >
            <button
              type="button"
              aria-label="Close chart balance call-out"
              onClick={closeCallout}
              style={{
                alignItems: 'center',
                background: 'transparent',
                border: 'none',
                borderRadius: '50%',
                color: '#607d8b',
                cursor: 'pointer',
                display: 'inline-flex',
                fontSize: '16px',
                height: '22px',
                justifyContent: 'center',
                lineHeight: 1,
                padding: 0,
                position: 'absolute',
                right: '3px',
                top: '2px',
                width: '22px',
              }}
              title="Close call-out"
            >
              ×
            </button>
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
                paddingRight: '18px',
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
        {(!calloutOpen || calloutClosing) && selectedChartDate && detailPoint && (
          <button
            type="button"
            data-testid="chart-balance-callout-reopen"
            aria-label="Reopen chart balance call-out"
            onClick={openCallout}
            title="Reopen call-out"
            style={{
              alignItems: 'center',
              backgroundColor: '#f4f8fa',
              border: '1px solid #78909c',
              borderRadius: '50%',
              boxShadow: '0 2px 6px rgba(45, 65, 78, 0.22)',
              color: '#526b7c',
              cursor: 'pointer',
              display: 'inline-flex',
              height: '30px',
              justifyContent: 'center',
              padding: 0,
              position: 'absolute',
              right: '12px',
              top: '10px',
              transform: `scale(${calloutClosing ? 0.82 : 1})`,
              transition: `opacity ${CALLOUT_TRANSITION_MS}ms ease, transform ${CALLOUT_TRANSITION_MS}ms ease`,
              width: '30px',
              zIndex: calloutClosing ? 1 : 2,
            }}
          >
            <MessageCircle aria-hidden="true" size={16} strokeWidth={2.25} />
          </button>
        )}
      </div>
      <div
        style={{
          alignItems: 'center',
          background: 'linear-gradient(180deg, #f8fbfc 0%, #edf3f6 100%)',
          borderTop: '1px solid #c8d6dd',
          boxShadow: '0 7px 12px -10px rgba(45, 65, 78, 0.72)',
          display: 'flex',
          flexShrink: 0,
          justifyContent: 'center',
          marginTop: '8px',
          padding: '8px 0 10px',
        }}
      >
        <div
          role="group"
          aria-label="Projection view"
          style={{
            backgroundColor: '#dbe7ec',
            border: '1px solid #bdcdd5',
            borderRadius: '999px',
            boxShadow: 'inset 0 1px 2px rgba(45, 65, 78, 0.16)',
            display: 'flex',
            gap: '2px',
            padding: '3px',
          }}
        >
          {(['chart', 'summary'] as const).map((mode) => {
            const isActive = displayMode === mode;
            const label = mode === 'chart' ? 'Chart' : 'Account summary';

            return (
              <button
                key={mode}
                type="button"
                aria-pressed={isActive}
                disabled={mode === 'summary' && accounts.length === 0}
                onClick={() => setDisplayMode(mode)}
                style={{
                  backgroundColor: isActive ? '#405f70' : 'transparent',
                  border: '1px solid transparent',
                  borderRadius: '999px',
                  boxShadow: isActive ? '0 1px 3px rgba(45, 65, 78, 0.34)' : 'none',
                  boxSizing: 'border-box',
                  color: isActive ? '#ffffff' : '#314b59',
                  cursor: mode === 'summary' && accounts.length === 0 ? 'not-allowed' : 'pointer',
                  fontSize: '12px',
                  fontWeight: 700,
                  lineHeight: 1.2,
                  opacity: mode === 'summary' && accounts.length === 0 ? 0.55 : 1,
                  padding: '6px 14px',
                }}
              >
                {label}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}