import type { Account } from "@/lib/firebase";
import { sharedStyles, ui } from "@/lib/uiTheme";
import {
  Landmark,
  MessageCircle,
  SquareArrowOutUpRight,
  TrendingDown,
} from "lucide-react";
import { useEffect, useRef, useState, type TouchEvent } from "react";
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

const CHART_COLORS = ui.chartSeries;
const CALLOUT_TRANSITION_MS = 220;
const currencyFormatter = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});
const PROJECTION_VIEWS = [
  { mode: 'chart', label: 'Chart' },
  { mode: 'summary', label: 'Account summary' },
  { mode: 'placeholder', label: 'Coming soon' },
] as const;
type ProjectionView = typeof PROJECTION_VIEWS[number]['mode'];

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
  const [displayMode, setDisplayMode] = useState<ProjectionView>('chart');
  const [navigationDotsVisible, setNavigationDotsVisible] = useState(true);
  const swipeStartXRef = useRef<number | null>(null);
  const navigationDotsTimerRef = useRef<number | null>(null);
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
  const displayModeIndex = Math.max(0, PROJECTION_VIEWS.findIndex(({ mode }) => mode === displayMode));
  const previousView = PROJECTION_VIEWS[(displayModeIndex + PROJECTION_VIEWS.length - 1) % PROJECTION_VIEWS.length];
  const nextView = PROJECTION_VIEWS[(displayModeIndex + 1) % PROJECTION_VIEWS.length];

  const selectDisplayMode = (mode: ProjectionView) => {
    if (mode === 'summary' && accounts.length === 0) return;
    setDisplayMode(mode);
  };

  const moveDisplayMode = (direction: -1 | 1) => {
    const nextIndex = (displayModeIndex + direction + PROJECTION_VIEWS.length) % PROJECTION_VIEWS.length;
    selectDisplayMode(PROJECTION_VIEWS[nextIndex].mode);
  };

  const revealNavigationDots = () => {
    setNavigationDotsVisible(true);
    if (navigationDotsTimerRef.current !== null) {
      window.clearTimeout(navigationDotsTimerRef.current);
    }
    navigationDotsTimerRef.current = window.setTimeout(() => {
      setNavigationDotsVisible(false);
      navigationDotsTimerRef.current = null;
    }, 1800);
  };

  const handleTouchStart = (event: TouchEvent<HTMLDivElement>) => {
    swipeStartXRef.current = event.touches[0]?.clientX ?? null;
  };

  const handleTouchEnd = (event: TouchEvent<HTMLDivElement>) => {
    const startX = swipeStartXRef.current;
    const endX = event.changedTouches[0]?.clientX;
    swipeStartXRef.current = null;
    if (startX == null || endX == null) return;

    const distance = endX - startX;
    if (Math.abs(distance) < 45) return;
    revealNavigationDots();
    moveDisplayMode(distance < 0 ? 1 : -1);
  };

  useEffect(() => {
    revealNavigationDots();

    return () => {
      if (navigationDotsTimerRef.current !== null) {
        window.clearTimeout(navigationDotsTimerRef.current);
      }
    };
  }, []);

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
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      style={{
        boxSizing: 'border-box',
        display: 'flex',
        flexDirection: 'column',
        height: containerHeight,
        touchAction: 'pan-y',
      }}
    >
      <div
        style={{
          display: 'flex',
          flex: '1 1 0',
          flexDirection: 'column',
          minHeight: 0,
          position: 'relative',
        }}
      >
      {displayMode === 'summary' && accounts.length > 0 && (
        <div
          data-testid="account-balance-summary"
          style={{
            ...sharedStyles.card,
            boxSizing: 'border-box',
            display: 'flex',
            flex: '1 1 0',
            flexDirection: 'column',
            maxHeight: 'none',
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              alignItems: 'center',
              background: `linear-gradient(135deg, ${ui.color.surface} 0%, ${ui.color.surfaceSelected} 100%)`,
              borderBottom: `1px solid ${ui.color.border}`,
              display: 'flex',
              flexShrink: 0,
              gap: '10px',
              justifyContent: 'space-between',
              padding: '10px 12px',
            }}
          >
            <div style={{ alignItems: 'center', display: 'flex', gap: '9px', minWidth: 0 }}>
              <span
                aria-hidden="true"
                style={{
                  alignItems: 'center',
                  backgroundColor: ui.color.primarySoft,
                  borderRadius: ui.radius.control,
                  color: ui.color.primary,
                  display: 'inline-flex',
                  flexShrink: 0,
                  height: '30px',
                  justifyContent: 'center',
                  width: '30px',
                }}
              >
                <Landmark size={17} strokeWidth={2.1} />
              </span>
              <div style={{ minWidth: 0 }}>
                <strong style={{ color: ui.color.text, display: 'block', fontSize: '14px', lineHeight: 1.2 }}>
                  Account outlook
                </strong>
                <span style={{ color: ui.color.textMuted, display: 'block', fontSize: '11px', lineHeight: 1.3 }}>
                  Current balances and projected lows
                </span>
              </div>
            </div>
            <span
              style={{
                backgroundColor: ui.color.surface,
                border: `1px solid ${ui.color.border}`,
                borderRadius: ui.radius.pill,
                color: ui.color.textMuted,
                flexShrink: 0,
                fontSize: '11px',
                fontWeight: 600,
                padding: '4px 8px',
              }}
            >
              {accountSummaries.filter(({ isIncluded }) => isIncluded).length}/{accountSummaries.length} tracked
            </span>
          </div>
          <div
            style={{
              display: 'flex',
              flex: '1 1 0',
              flexDirection: 'column',
              minHeight: 0,
              overflow: 'auto',
            }}
          >
            <div
              data-testid="account-balance-summary-cards"
              style={{
                gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
                gap: '8px',
                padding: '10px 12px 12px',
                display: 'none',
              }}
            >
              {accountSummaries.map(({ account, color, isIncluded, minimumBalance, minimumDate }) => (
                <article
                  key={account.account_id}
                  style={{
                    backgroundColor: ui.color.surface,
                    border: `1px solid ${ui.color.border}`,
                    borderRadius: ui.radius.control,
                    boxSizing: 'border-box',
                    display: 'grid',
                    gap: '12px',
                    gridTemplateColumns: 'minmax(0, 1.1fr) minmax(0, 1fr)',
                    minWidth: 0,
                    padding: '10px',
                  }}
                >
                  <div style={{ alignItems: 'center', display: 'flex', gap: '8px', minWidth: 0 }}>
                    <input
                      type="checkbox"
                      checked={isIncluded}
                      onChange={() => onAccountToggle(account.account_id)}
                      aria-label={`${isIncluded ? 'Exclude' : 'Include'} ${accountLabel(account)}`}
                      style={{
                        accentColor: color,
                        cursor: 'pointer',
                        flex: '0 0 auto',
                        height: '16px',
                        margin: 0,
                        width: '16px',
                      }}
                    />
                    <span
                      aria-hidden="true"
                      style={{
                        backgroundColor: color,
                        borderRadius: ui.radius.pill,
                        flex: '0 0 auto',
                        height: '28px',
                        opacity: isIncluded ? 1 : 0.45,
                        width: '4px',
                      }}
                    />
                    <span style={{ display: 'flex', flexDirection: 'column', gap: '3px', minWidth: 0 }}>
                      <strong
                        style={{
                          color: isIncluded ? ui.color.text : ui.color.textMuted,
                          display: 'block',
                          fontSize: '13px',
                          fontWeight: 700,
                          lineHeight: 1.2,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {accountLabel(account)}
                      </strong>
                      <span
                        style={{
                          color: isIncluded ? ui.color.primary : ui.color.textDisabled,
                          fontSize: '10px',
                          fontWeight: 600,
                          lineHeight: 1.2,
                        }}
                      >
                        {isIncluded ? 'Include' : 'Exclude'}
                      </span>
                    </span>
                  </div>

                  <div
                    style={{
                      display: 'grid',
                      gap: '10px',
                      gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
                      minWidth: 0,
                    }}
                  >
                    <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                      <span style={{ color: ui.color.textMuted, fontSize: '10px', fontWeight: 700, lineHeight: 1.15, marginBottom: '3px' }}>
                        Current balance
                      </span>
                      {typeof account.available_balance === 'number' && Number.isFinite(account.available_balance) ? (
                        <>
                          <strong
                            style={{
                              color: account.available_balance < 0 ? ui.color.danger : ui.color.text,
                              fontSize: '16px',
                              fontWeight: 700,
                              lineHeight: 1.2,
                            }}
                          >
                            {currencyFormatter.format(account.available_balance)}
                          </strong>
                          {currentBalanceDate && (
                            <time
                              dateTime={currentBalanceDate}
                              aria-label={`Current balance date: ${formatDate(currentBalanceDate)}`}
                              title={formatDate(currentBalanceDate)}
                              style={{
                                color: ui.color.textMuted,
                                fontSize: '10px',
                                fontWeight: 600,
                                lineHeight: 1.3,
                                marginTop: '3px',
                              }}
                            >
                              As of {compactDate(currentBalanceDate)}
                            </time>
                          )}
                        </>
                      ) : (
                        <span style={{ color: ui.color.textDisabled }}>—</span>
                      )}
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                      <span style={{ color: ui.color.textMuted, fontSize: '10px', fontWeight: 700, lineHeight: 1.15, marginBottom: '3px' }}>
                        Projected low
                      </span>
                      {minimumBalance != null && minimumDate ? (
                        <>
                          <div style={{ alignItems: 'center', display: 'flex', flexWrap: 'wrap', gap: '4px', minWidth: 0 }}>
                            <strong
                              style={{
                                color: minimumBalance < 0 ? ui.color.danger : ui.color.warning,
                                fontSize: '16px',
                                fontWeight: 700,
                                lineHeight: 1.2,
                              }}
                            >
                              {currencyFormatter.format(minimumBalance)}
                            </strong>
                            <button
                              type="button"
                              aria-label={`Show the chart and transactions for the projected low balance on ${formatDate(minimumDate)}`}
                              title={`Show chart and transactions for ${formatDate(minimumDate)}`}
                              onClick={() => jumpToLowBalance(minimumDate)}
                              style={{
                                alignItems: 'center',
                                backgroundColor: minimumBalance < 0 ? ui.color.dangerSoft : ui.color.warningSoft,
                                border: `1px solid ${minimumBalance < 0 ? ui.color.dangerBorder : ui.color.warningBorder}`,
                                borderRadius: ui.radius.pill,
                                color: minimumBalance < 0 ? ui.color.danger : ui.color.warning,
                                cursor: 'pointer',
                                display: 'inline-flex',
                                flex: '0 0 auto',
                                height: '22px',
                                justifyContent: 'center',
                                padding: 0,
                                width: '22px',
                              }}
                            >
                              <SquareArrowOutUpRight aria-hidden="true" size={13} strokeWidth={2.25} />
                            </button>
                          </div>
                          <time
                            dateTime={minimumDate}
                            aria-label={`Projected low balance date: ${formatDate(minimumDate)}`}
                            title={formatDate(minimumDate)}
                            style={{
                              color: minimumBalance < 0 ? ui.color.danger : ui.color.warning,
                              fontSize: '10px',
                              fontWeight: 600,
                              lineHeight: 1.3,
                              marginTop: '3px',
                            }}
                          >
                            Low on {compactDate(minimumDate)}
                          </time>
                        </>
                      ) : (
                        <span style={{ color: ui.color.textDisabled }}>—</span>
                      )}
                    </div>
                  </div>
                </article>
              ))}
            </div>

            <table
              aria-label="Account balance summary"
              style={{
                borderCollapse: 'separate',
                borderSpacing: 0,
                fontSize: '14px',
                minWidth: 0,
                tableLayout: 'fixed',
                width: '100%',
              }}
            >
              <colgroup>
                <col style={{ width: '33.3333%' }} />
                <col style={{ width: '33.3333%' }} />
                <col style={{ width: '33.3333%' }} />
              </colgroup>
              <thead>
                <tr style={{ color: ui.color.textMuted, fontSize: '13px', fontWeight: 700, lineHeight: '18px', textAlign: 'left' }}>
                  <th
                    scope="col"
                    style={{
                      backgroundColor: ui.color.surfaceSubtle,
                      borderBottom: `1px solid ${ui.color.border}`,
                      boxSizing: 'border-box',
                      padding: '9px 10px',
                      position: 'sticky',
                      top: 0,
                      zIndex: 1,
                    }}
                  >
                    Account
                  </th>
                  <th
                    scope="col"
                    style={{
                      backgroundColor: ui.color.surfaceSubtle,
                      borderBottom: `1px solid ${ui.color.border}`,
                      borderLeft: `1px solid ${ui.color.border}`,
                      boxSizing: 'border-box',
                      padding: '9px 10px',
                      position: 'sticky',
                      top: 0,
                      zIndex: 1,
                    }}
                  >
                    Current balance
                  </th>
                  <th
                    scope="col"
                    style={{
                      backgroundColor: ui.color.surfaceSubtle,
                      borderBottom: `1px solid ${ui.color.border}`,
                      borderLeft: `1px solid ${ui.color.border}`,
                      boxSizing: 'border-box',
                      padding: '9px 10px',
                      position: 'sticky',
                      top: 0,
                      zIndex: 1,
                    }}
                  >
                    <span style={{ alignItems: 'center', display: 'inline-flex', gap: '5px' }}>
                      <TrendingDown aria-hidden="true" size={14} strokeWidth={2} />
                      Low balance
                    </span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {accountSummaries.map(({ account, color, isIncluded, minimumBalance, minimumDate }) => (
                  <tr
                    key={account.account_id}
                    style={{
                      backgroundColor: isIncluded ? ui.color.surface : ui.color.surfaceSubtle,
                      color: isIncluded ? ui.color.text : ui.color.textMuted,
                      transition: 'background-color 0.15s ease, opacity 0.15s ease',
                    }}
                    onMouseEnter={(event) => {
                      event.currentTarget.style.backgroundColor = isIncluded
                        ? ui.color.surfaceSelected
                        : ui.color.surfaceMuted;
                    }}
                    onMouseLeave={(event) => {
                      event.currentTarget.style.backgroundColor = isIncluded
                        ? ui.color.surface
                        : ui.color.surfaceSubtle;
                    }}
                  >
                    <th
                      scope="row"
                      style={{
                        borderBottom: `1px solid ${ui.color.border}`,
                        borderLeft: `1px solid ${ui.color.border}`,
                        boxSizing: 'border-box',
                        padding: '12px 10px',
                        textAlign: 'left',
                        verticalAlign: 'middle',
                      }}
                    >
                      <span style={{ alignItems: 'center', display: 'flex', gap: '8px', minWidth: 0 }}>
                        <span style={{ minWidth: 0 }}>
                          <strong
                            style={{
                              color: isIncluded ? ui.color.text : ui.color.textMuted,
                              display: 'block',
                              fontSize: '14px',
                              fontWeight: 700,
                              lineHeight: 1.25,
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap',
                            }}
                          >
                            {accountLabel(account)}
                          </strong>
                          <span style={{ alignItems: 'center', display: 'inline-flex', gap: '5px', marginTop: '2px' }}>
                            <input
                              type="checkbox"
                              checked={isIncluded}
                              onChange={() => onAccountToggle(account.account_id)}
                              aria-label={`${isIncluded ? 'Exclude' : 'Include'} ${accountLabel(account)}`}
                              style={{
                                accentColor: color,
                                cursor: 'pointer',
                                flex: '0 0 auto',
                                height: '14px',
                                margin: 0,
                                width: '14px',
                              }}
                            />
                            <span
                              style={{
                                color: isIncluded ? ui.color.primary : ui.color.textDisabled,
                                display: 'block',
                                fontSize: '10px',
                                fontWeight: 600,
                                letterSpacing: '0.02em',
                                lineHeight: 1.3,
                              }}
                            >
                              {isIncluded ? 'Include' : 'Exclude'}
                            </span>
                          </span>
                        </span>
                      </span>
                    </th>
                    <td
                      style={{
                        borderBottom: `1px solid ${ui.color.border}`,
                        borderLeft: `1px solid ${ui.color.border}`,
                        boxSizing: 'border-box',
                        padding: '12px 10px',
                        verticalAlign: 'middle',
                        whiteSpace: 'normal',
                      }}
                    >
                      {typeof account.available_balance === 'number' && Number.isFinite(account.available_balance) ? (
                        <>
                          <strong
                            style={{
                              color: account.available_balance < 0 ? ui.color.danger : ui.color.text,
                              display: 'block',
                              fontSize: '16px',
                              fontWeight: 700,
                              lineHeight: 1.2,
                            }}
                        >
                            {currencyFormatter.format(account.available_balance)}
                          </strong>
                          {currentBalanceDate && (
                            <time
                              dateTime={currentBalanceDate}
                              aria-label={`Current balance date: ${formatDate(currentBalanceDate)}`}
                              title={formatDate(currentBalanceDate)}
                              style={{
                                backgroundColor: ui.color.surfaceMuted,
                                borderRadius: ui.radius.pill,
                                color: ui.color.textMuted,
                                display: 'inline-block',
                                fontSize: '10px',
                                fontWeight: 600,
                                lineHeight: 1.3,
                                marginTop: '5px',
                                padding: '2px 6px',
                              }}
                            >
                              As of {compactDate(currentBalanceDate)}
                            </time>
                          )}
                        </>
                      ) : (
                        <span style={{ color: ui.color.textDisabled }}>—</span>
                      )}
                    </td>
                    <td
                      style={{
                        borderBottom: `1px solid ${ui.color.border}`,
                        borderLeft: `1px solid ${ui.color.border}`,
                        boxSizing: 'border-box',
                        padding: '12px 10px',
                        verticalAlign: 'middle',
                        whiteSpace: 'normal',
                      }}
                    >
                      {minimumBalance != null && minimumDate ? (
                        <>
                          <div style={{ alignItems: 'center', display: 'flex', gap: '6px' }}>
                            <strong
                              style={{
                                color: minimumBalance < 0 ? ui.color.danger : ui.color.warning,
                                display: 'block',
                                fontSize: '16px',
                                fontWeight: 700,
                                lineHeight: 1.2,
                              }}
                            >
                              {currencyFormatter.format(minimumBalance)}
                            </strong>
                            <button
                              type="button"
                              aria-label={`Show the chart and transactions for the projected low balance on ${formatDate(minimumDate)}`}
                              title={`Show chart and transactions for ${formatDate(minimumDate)}`}
                              onClick={() => jumpToLowBalance(minimumDate)}
                              style={{
                                alignItems: 'center',
                                backgroundColor: minimumBalance < 0 ? ui.color.dangerSoft : ui.color.warningSoft,
                                border: `1px solid ${minimumBalance < 0 ? ui.color.dangerBorder : ui.color.warningBorder}`,
                                borderRadius: ui.radius.pill,
                                color: minimumBalance < 0 ? ui.color.danger : ui.color.warning,
                                cursor: 'pointer',
                                display: 'inline-flex',
                                flexShrink: 0,
                                height: '26px',
                                justifyContent: 'center',
                                padding: 0,
                                width: '26px',
                              }}
                            >
                              <SquareArrowOutUpRight aria-hidden="true" size={14} strokeWidth={2.25} />
                            </button>
                          </div>
                          <time
                            dateTime={minimumDate}
                            aria-label={`Projected low balance date: ${formatDate(minimumDate)}`}
                            title={formatDate(minimumDate)}
                            style={{
                              backgroundColor: minimumBalance < 0 ? ui.color.dangerSoft : ui.color.warningSoft,
                              borderRadius: ui.radius.pill,
                              color: minimumBalance < 0 ? ui.color.danger : ui.color.warning,
                              display: 'inline-block',
                              fontSize: '10px',
                              fontWeight: 600,
                              lineHeight: 1.3,
                              marginTop: '5px',
                              padding: '2px 6px',
                            }}
                          >
                            Low on {compactDate(minimumDate)}
                          </time>
                        </>
                      ) : (
                        <span style={{ color: ui.color.textDisabled }}>—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
      {displayMode === 'placeholder' && (
        <div
          data-testid="projection-placeholder"
          style={{
            alignItems: 'center',
            ...sharedStyles.card,
            boxSizing: 'border-box',
            color: ui.color.textMuted,
            display: 'flex',
            flex: '1 1 0',
            fontSize: '14px',
            justifyContent: 'center',
            minHeight: 0,
          }}
        >
          Coming soon
        </div>
      )}
      <div
        style={{
          boxSizing: 'border-box',
          display: displayMode === 'chart' ? 'block' : 'none',
          flex: '1 1 0',
          minHeight: 0,
          position: 'relative',
          ...sharedStyles.card,
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
                stroke={ui.color.chartZero}
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
                    stroke={ui.color.chartSelection}
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
                        stroke={ui.color.surface}
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
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: ui.color.textMuted, fontSize: '14px' }}>
            {accounts.length > 0 ? 'No accounts included' : 'No account data'}
          </div>
        )}
        {(calloutOpen || calloutClosing) && selectedChartDate && detailPoint && (
          <div
            data-testid="chart-balance-callout"
            aria-label={`Projected balances on ${formatDate(selectedChartDate)}`}
            style={{
              ...sharedStyles.card,
              borderRadius: ui.radius.control,
              boxShadow: ui.shadow.raised,
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
                color: ui.color.textMuted,
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
                backgroundColor: ui.color.surface,
                borderBottom: `1px solid ${ui.color.borderStrong}`,
                borderRight: `1px solid ${ui.color.borderStrong}`,
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
                color: ui.color.text,
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
                    color: ui.color.text,
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
               backgroundColor: ui.color.surfaceSelected,
               border: `1px solid ${ui.color.chartSelection}`,
              borderRadius: '50%',
              boxShadow: ui.shadow.raised,
               color: ui.color.primary,
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
        aria-label="Projection view positions"
        style={{
          bottom: '10px',
          display: 'flex',
          justifyContent: 'center',
          left: 0,
          pointerEvents: 'none',
          position: 'absolute',
          right: 0,
          zIndex: 4,
        }}
      >
        <div
          style={{
            alignItems: 'center',
            display: 'flex',
            gap: '5px',
            opacity: navigationDotsVisible ? 1 : 0,
            pointerEvents: navigationDotsVisible ? 'auto' : 'none',
            transition: 'opacity 260ms ease',
          }}
        >
          {PROJECTION_VIEWS.map((view, index) => {
            const isActive = index === displayModeIndex;
            const isDisabled = view.mode === 'summary' && accounts.length === 0;

            return (
              <button
                key={view.mode}
                type="button"
                aria-label={`Show ${view.label}`}
                aria-pressed={isActive}
                disabled={isDisabled}
                onClick={() => selectDisplayMode(view.mode)}
                style={{
                  backgroundColor: isActive ? ui.color.primary : ui.color.borderStrong,
                  border: `1px solid ${ui.color.surface}`,
                  borderRadius: '50%',
                  boxShadow: ui.shadow.card,
                  cursor: isDisabled ? 'not-allowed' : 'pointer',
                  height: '8px',
                  opacity: isDisabled ? 0.45 : 1,
                  padding: 0,
                  width: '8px',
                }}
              />
            );
          })}
        </div>
      </div>
      </div>
      <div
        style={{
          alignItems: 'center',
          background: ui.color.surface,
          borderTop: `1px solid ${ui.color.border}`,
          boxShadow: ui.shadow.card,
          display: 'flex',
          flexShrink: 0,
          justifyContent: 'center',
          marginTop: '4px',
          padding: '5px 10px 6px',
        }}
      >
        <div
          role="group"
          aria-label="Projection view"
          style={{
            alignItems: 'center',
            display: 'grid',
            gridTemplateColumns: 'minmax(0, 1fr) auto minmax(0, 1fr)',
            width: '100%',
          }}
        >
          <button
            type="button"
            aria-label={`Show ${previousView.label}`}
            disabled={previousView.mode === 'summary' && accounts.length === 0}
            onClick={() => moveDisplayMode(-1)}
            style={{
              background: 'none',
              border: 'none',
               color: ui.color.textMuted,
              cursor: previousView.mode === 'summary' && accounts.length === 0 ? 'not-allowed' : 'pointer',
              fontSize: '12px',
              justifySelf: 'start',
              lineHeight: 1.2,
              maxWidth: '110px',
              opacity: previousView.mode === 'summary' && accounts.length === 0 ? 0.45 : 1,
              overflow: 'hidden',
              padding: '6px 0',
              textAlign: 'left',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {previousView.label}
          </button>
          <div style={{ alignItems: 'center', display: 'flex', justifyContent: 'center', minWidth: '120px' }}>
             <strong style={{ color: ui.color.text, fontSize: '15px', lineHeight: 1.2 }}>
              {PROJECTION_VIEWS[displayModeIndex].label}
            </strong>
          </div>
          <button
            type="button"
            aria-label={`Show ${nextView.label}`}
            disabled={nextView.mode === 'summary' && accounts.length === 0}
            onClick={() => moveDisplayMode(1)}
            style={{
              background: 'none',
              border: 'none',
               color: ui.color.textMuted,
              cursor: nextView.mode === 'summary' && accounts.length === 0 ? 'not-allowed' : 'pointer',
              fontSize: '12px',
              justifySelf: 'end',
              lineHeight: 1.2,
              maxWidth: '110px',
              opacity: nextView.mode === 'summary' && accounts.length === 0 ? 0.45 : 1,
              overflow: 'hidden',
              padding: '6px 0',
              textAlign: 'right',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {nextView.label}
          </button>
        </div>
      </div>
    </div>
  );
}