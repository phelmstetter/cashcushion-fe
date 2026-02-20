import { useState, useEffect, useRef, useMemo } from "react";
import { signOut } from "firebase/auth";
import { auth, getTransactions, Transaction, saveForecast, saveSeriesForecasts, saveDayIntervalForecasts, updateForecast, updateSeriesForecasts, deleteForecast, deleteSeriesForecasts, getForecasts, Forecast, reconcileForecast, unreconcileForecast, getAccounts, Account } from "@/lib/firebase";
import { useLocation } from "wouter";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend } from 'recharts';

const LONG_PRESS_MS = 500;

const Home = () => {
  const [, setLocation] = useLocation();
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [hasMore, setHasMore] = useState(true);
  const hasMoreRef = useRef(true);
  const [loading, setLoading] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  const [selectedTransaction, setSelectedTransaction] = useState<Transaction | null>(null);
  const [modalView, setModalView] = useState<'details' | 'forecast' | 'editForecast'>('details');
  const [forecastDate, setForecastDate] = useState('');
  const [forecastAmount, setForecastAmount] = useState('');
  const [forecastType, setForecastType] = useState<'single' | 'monthly' | 'every_x_days'>('single');
  const [forecastMonths, setForecastMonths] = useState(12);
  const [forecastDayInterval, setForecastDayInterval] = useState(14);
  const [forecastDayCount, setForecastDayCount] = useState(12);
  const [saving, setSaving] = useState(false);
  const [editingForecast, setEditingForecast] = useState<Forecast | null>(null);
  const [companyFilter, setCompanyFilter] = useState('');
  const [accountFilter, setAccountFilter] = useState('');
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const [chartOpen, setChartOpen] = useState(true);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [forecasts, setForecasts] = useState<Forecast[]>([]);
  const [draggingForecast, setDraggingForecast] = useState<Forecast | null>(null);
  const [dragPos, setDragPos] = useState<{ x: number; y: number } | null>(null);
  const [dropTargetId, setDropTargetId] = useState<string | null>(null);
  const cursorRef = useRef<{ date: string; id: string } | null>(null);
  const loadingRef = useRef(false);
  const observerRef = useRef<IntersectionObserver | null>(null);
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const transactionRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const dragStartPosRef = useRef<{ x: number; y: number } | null>(null);
  const scrollAnchorRef = useRef<HTMLDivElement | null>(null);
  const hasAutoScrolled = useRef(false);

  const handleSignOut = async () => {
    await signOut(auth);
    setLocation("/login");
  };

  const loadInitialTransactions = async () => {
    const userId = auth.currentUser?.uid;
    if (!userId) {
      setInitialLoading(false);
      return;
    }
    
    try {
      const result = await getTransactions(userId, null);
      setTransactions(result.transactions);
      if (result.lastDate && result.lastId) {
        cursorRef.current = { date: result.lastDate, id: result.lastId };
      }
      setHasMore(result.hasMore);
    } catch (error) {
      console.error("Error loading transactions:", error);
    }
    try {
      const userForecasts = await getForecasts(userId);
      setForecasts(userForecasts);
    } catch (error) {
      console.error("Error loading forecasts:", error);
    }
    try {
      const userAccounts = await getAccounts(userId);
      setAccounts(userAccounts);
    } catch (error) {
      console.error("Error loading accounts:", error);
    }
    setInitialLoading(false);
  };

  const reobserveSentinel = () => {
    if (observerRef.current && sentinelRef.current) {
      observerRef.current.unobserve(sentinelRef.current);
      observerRef.current.observe(sentinelRef.current);
    }
  };

  const loadMoreTransactions = async () => {
    if (loadingRef.current || !hasMoreRef.current) return;
    
    const userId = auth.currentUser?.uid;
    if (!userId) return;
    
    loadingRef.current = true;
    setLoading(true);
    try {
      const result = await getTransactions(userId, cursorRef.current);
      if (result.transactions.length > 0) {
        setTransactions(prev => [...prev, ...result.transactions]);
        if (result.lastDate && result.lastId) {
          cursorRef.current = { date: result.lastDate, id: result.lastId };
        }
        hasMoreRef.current = result.hasMore;
        setHasMore(result.hasMore);
      } else {
        hasMoreRef.current = false;
        setHasMore(false);
      }
    } catch (error) {
      console.error("Error loading more:", error);
    } finally {
      loadingRef.current = false;
      setLoading(false);
      setTimeout(() => reobserveSentinel(), 100);
    }
  };

  useEffect(() => {
    loadInitialTransactions();
  }, []);

  useEffect(() => {
    if (observerRef.current) {
      observerRef.current.disconnect();
    }

    observerRef.current = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMoreRef.current && !loadingRef.current) {
          loadMoreTransactions();
        }
      },
      { threshold: 0.1, rootMargin: '200px' }
    );

    if (sentinelRef.current) {
      observerRef.current.observe(sentinelRef.current);
    }

    return () => {
      if (observerRef.current) {
        observerRef.current.disconnect();
      }
    };
  }, [hasMore, transactions.length, forecasts.length]);

  useEffect(() => {
    const handleScroll = () => {
      if (!hasMoreRef.current || loadingRef.current) return;
      const scrollY = window.scrollY || document.documentElement.scrollTop;
      const windowHeight = window.innerHeight;
      const docHeight = document.documentElement.scrollHeight;
      if (scrollY + windowHeight >= docHeight - 300) {
        loadMoreTransactions();
      }
    };
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const getClientPos = (e: React.TouchEvent | React.MouseEvent | TouchEvent | MouseEvent) => {
    if ('touches' in e && e.touches.length > 0) {
      return { x: e.touches[0].clientX, y: e.touches[0].clientY };
    }
    if ('changedTouches' in e && e.changedTouches.length > 0) {
      return { x: e.changedTouches[0].clientX, y: e.changedTouches[0].clientY };
    }
    if ('clientX' in e) {
      return { x: e.clientX, y: e.clientY };
    }
    return { x: 0, y: 0 };
  };

  const findDropTarget = (x: number, y: number): string | null => {
    let found: string | null = null;
    transactionRefs.current.forEach((el, txId) => {
      const rect = el.getBoundingClientRect();
      if (x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom) {
        found = txId;
      }
    });
    return found;
  };

  const cancelLongPress = () => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  };

  const handleLongPressStart = (forecast: Forecast, e: React.TouchEvent | React.MouseEvent) => {
    if (!forecast.id) return;
    const pos = getClientPos(e);
    dragStartPosRef.current = pos;

    longPressTimerRef.current = setTimeout(() => {
      setDraggingForecast(forecast);
      setDragPos(pos);
    }, LONG_PRESS_MS);
  };

  useEffect(() => {
    const onMove = (e: TouchEvent | MouseEvent) => {
      const pos = getClientPos(e);

      if (longPressTimerRef.current && dragStartPosRef.current) {
        const dx = pos.x - dragStartPosRef.current.x;
        const dy = pos.y - dragStartPosRef.current.y;
        if (Math.sqrt(dx * dx + dy * dy) > 10) {
          cancelLongPress();
        }
      }

      if (draggingForecast) {
        e.preventDefault();
        setDragPos(pos);
        setDropTargetId(findDropTarget(pos.x, pos.y));
      }
    };

    const onEnd = async (e: TouchEvent | MouseEvent) => {
      cancelLongPress();

      if (!draggingForecast) {
        dragStartPosRef.current = null;
        return;
      }

      const pos = getClientPos(e);
      const target = findDropTarget(pos.x, pos.y);

      if (draggingForecast.id && target) {
        try {
          await reconcileForecast(draggingForecast.id, target);
          setForecasts(prev =>
            prev.map(f =>
              f.id === draggingForecast.id ? { ...f, matched_transaction_id: target } : f
            )
          );
        } catch (error: any) {
          console.error('Error reconciling forecast:', error);
          alert('Error reconciling: ' + (error?.message || 'Unknown error'));
        }
      }

      setDraggingForecast(null);
      setDragPos(null);
      setDropTargetId(null);
      dragStartPosRef.current = null;
    };

    window.addEventListener('touchmove', onMove, { passive: false });
    window.addEventListener('mousemove', onMove);
    window.addEventListener('touchend', onEnd);
    window.addEventListener('mouseup', onEnd);

    return () => {
      window.removeEventListener('touchmove', onMove);
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('touchend', onEnd);
      window.removeEventListener('mouseup', onEnd);
    };
  }, [draggingForecast]);

  const formatAmount = (amount: number) => {
    const flippedAmount = -amount;
    const formatted = new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD'
    }).format(flippedAmount);
    
    return {
      display: formatted,
      isPositive: flippedAmount >= 0
    };
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
  };

  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map(word => word[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };

  const visibleForecasts = forecasts.filter(f => !f.matched_transaction_id);

  const companyNames: string[] = Array.from(new Set([
    ...transactions.map(t => t.merchant_name || t.counterparty_name),
    ...visibleForecasts.map(f => f.name)
  ])).filter(Boolean).sort((a, b) => a.localeCompare(b));

  const accountOptions = accounts
    .filter(a => a.account_id)
    .map(a => ({
      label: a.name ? `${a.name} ${a.mask}` : a.mask,
      value: a.account_id
    }));

  const CHART_COLORS = ['#1976d2', '#e53935', '#43a047', '#fb8c00', '#8e24aa', '#00acc1', '#d81b60', '#6d4c41'];

  const chartData = useMemo(() => {
    if (accounts.length === 0) return [];

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const endDate = new Date(today);
    endDate.setMonth(endDate.getMonth() + 12);

    const forecastsByAccount: Record<string, Record<string, number>> = {};
    for (const f of visibleForecasts) {
      if (!f.account_id) continue;
      if (!forecastsByAccount[f.account_id]) forecastsByAccount[f.account_id] = {};
      const dateStr = f.date;
      if (!forecastsByAccount[f.account_id][dateStr]) forecastsByAccount[f.account_id][dateStr] = 0;
      forecastsByAccount[f.account_id][dateStr] += f.amount;
    }

    const data: Record<string, any>[] = [];
    const currentBalances: Record<string, number> = {};
    for (const acct of accounts) {
      currentBalances[acct.account_id] = acct.available_balance ?? 0;
    }

    const d = new Date(today);
    while (d <= endDate) {
      const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      const displayDate = `${d.getMonth() + 1}/${d.getDate()}`;

      for (const acct of accounts) {
        const dayForecast = forecastsByAccount[acct.account_id]?.[dateStr] || 0;
        if (dayForecast !== 0) {
          currentBalances[acct.account_id] += dayForecast;
        }
      }

      const point: Record<string, any> = { date: displayDate, fullDate: dateStr };
      for (const acct of accounts) {
        point[acct.account_id] = Math.round(currentBalances[acct.account_id] * 100) / 100;
      }
      data.push(point);

      d.setDate(d.getDate() + 1);
    }

    return data;
  }, [accounts, visibleForecasts]);

  type MergedItem = 
    | { type: 'transaction'; data: Transaction }
    | { type: 'forecast'; data: Forecast };

  const mergedItems: MergedItem[] = [
    ...visibleForecasts.map(f => ({ type: 'forecast' as const, data: f })),
    ...transactions.map(t => ({ type: 'transaction' as const, data: t })),
  ].sort((a, b) => b.data.date.localeCompare(a.data.date))
  .filter(item => {
    if (accountFilter) {
      if (item.type === 'transaction') {
        const tx = item.data as Transaction;
        if (tx.account_id !== accountFilter) return false;
      } else {
        const fc = item.data as Forecast;
        if (fc.account_id !== accountFilter) return false;
      }
    }
    if (!companyFilter) return true;
    if (item.type === 'forecast') {
      return (item.data as Forecast).name === companyFilter;
    }
    const tx = item.data as Transaction;
    return (tx.merchant_name || tx.counterparty_name) === companyFilter;
  });

  const matchedTransactionIds = useMemo(() => {
    const ids = new Set<string>();
    for (const f of forecasts) {
      if (f.matched_transaction_id) ids.add(f.matched_transaction_id);
    }
    return ids;
  }, [forecasts]);

  const scrollAnchorIndex = useMemo(() => {
    const firstTxIndex = mergedItems.findIndex(item => item.type === 'transaction');
    if (firstTxIndex <= 0) return 0;
    return Math.max(0, firstTxIndex - 3);
  }, [mergedItems]);

  useEffect(() => {
    if (!initialLoading && !hasAutoScrolled.current && scrollAnchorRef.current) {
      hasAutoScrolled.current = true;
      requestAnimationFrame(() => {
        if (!scrollAnchorRef.current) return;
        const rect = scrollAnchorRef.current.getBoundingClientRect();
        const fixedHeaderHeight = chartOpen ? 56 + window.innerHeight * 0.3 + 6 : 56 + 30;
        const scrollTarget = window.scrollY + rect.top - fixedHeaderHeight;
        window.scrollTo({ top: Math.max(0, scrollTarget), behavior: 'auto' });
      });
    }
  }, [initialLoading, mergedItems.length]);

  const currentUser = auth.currentUser;

  return (
    <div style={{ maxWidth: '600px', margin: '0 auto', paddingTop: chartOpen ? 'calc(56px + 30vh + 6px)' : 'calc(56px + 30px)', paddingLeft: '2px', paddingRight: '2px', paddingBottom: '2px' }}>
      <div style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        backgroundColor: 'white',
        zIndex: 999,
        borderBottom: '1px solid #eee',
        boxShadow: '0 1px 4px rgba(0,0,0,0.08)'
      }}>
        <div style={{
          maxWidth: '600px',
          margin: '0 auto',
          padding: '8px 10px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: '12px'
        }}>
          <h1 style={{ margin: 0, fontSize: '20px', whiteSpace: 'nowrap' }}>CashCushion</h1>
          <select
            data-testid="select-account-filter"
            value={accountFilter}
            onChange={(e) => setAccountFilter(e.target.value)}
            style={{
              flex: '0 1 auto',
              minWidth: '0',
              maxWidth: '140px',
              padding: '6px 8px',
              fontSize: '13px',
              borderRadius: '4px',
              border: '1px solid #ccc',
              backgroundColor: 'white',
              overflow: 'hidden',
              textOverflow: 'ellipsis'
            }}
          >
            <option value="">All Accts</option>
            {accountOptions.map(opt => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
          <select
            data-testid="select-company-filter"
            value={companyFilter}
            onChange={(e) => setCompanyFilter(e.target.value)}
            style={{
              flex: 1,
              minWidth: '0',
              padding: '6px 8px',
              fontSize: '13px',
              borderRadius: '4px',
              border: '1px solid #ccc',
              backgroundColor: 'white',
              overflow: 'hidden',
              textOverflow: 'ellipsis'
            }}
          >
            <option value="">All Merchants ({transactions.length + visibleForecasts.length})</option>
            {companyNames.map(name => (
              <option key={name} value={name}>{name}</option>
            ))}
          </select>
          <div style={{ position: 'relative', flexShrink: 0 }}>
            <div
              data-testid="button-profile-menu"
              onClick={() => setProfileMenuOpen(!profileMenuOpen)}
              style={{ cursor: 'pointer' }}
            >
              {currentUser?.photoURL ? (
                <img
                  src={currentUser.photoURL}
                  alt="Profile"
                  data-testid="img-profile"
                  style={{ width: '32px', height: '32px', borderRadius: '50%', objectFit: 'cover', display: 'block' }}
                />
              ) : (
                <div style={{
                  width: '32px',
                  height: '32px',
                  borderRadius: '50%',
                  backgroundColor: '#e0e0e0',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '14px',
                  fontWeight: 'bold'
                }}>
                  {currentUser?.email?.[0]?.toUpperCase() || '?'}
                </div>
              )}
            </div>
            {profileMenuOpen && (
              <>
                <div
                  style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 1000 }}
                  onClick={() => setProfileMenuOpen(false)}
                />
                <div style={{
                  position: 'absolute',
                  top: '40px',
                  right: 0,
                  backgroundColor: 'white',
                  border: '1px solid #ddd',
                  borderRadius: '6px',
                  boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
                  zIndex: 1001,
                  minWidth: '140px',
                  overflow: 'hidden'
                }}>
                  {currentUser?.email && (
                    <div style={{ padding: '10px 14px', fontSize: '12px', color: '#666', borderBottom: '1px solid #eee' }}>
                      {currentUser.email}
                    </div>
                  )}
                  <button
                    data-testid="button-sign-out"
                    onClick={() => {
                      setProfileMenuOpen(false);
                      handleSignOut();
                    }}
                    style={{
                      display: 'block',
                      width: '100%',
                      padding: '10px 14px',
                      fontSize: '14px',
                      textAlign: 'left',
                      backgroundColor: 'white',
                      border: 'none',
                      cursor: 'pointer',
                      color: '#d32f2f'
                    }}
                  >
                    Sign Out
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      <div style={{
        position: 'fixed',
        top: '44px',
        left: 0,
        right: 0,
        zIndex: 998,
        backgroundColor: '#f5f5f5'
      }}>
        <div style={{ maxWidth: '600px', margin: '0 auto', padding: '2px 2px 0 2px' }}>
          {chartOpen && (
            <div
              data-testid="chart-container"
              style={{
                height: '30vh',
                backgroundColor: 'white',
                borderRadius: '8px',
                boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
                display: 'flex',
                flexDirection: 'column',
                border: '1px solid #eee',
                overflow: 'hidden'
              }}
            >
              <div style={{ flex: 1, minHeight: 0, width: '100%' }}>
                {chartData.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={chartData} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
                      <XAxis
                        dataKey="date"
                        tick={{ fontSize: 10 }}
                        interval={Math.floor(chartData.length / 6)}
                        tickLine={false}
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
                          return [new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value), label];
                        }}
                        labelFormatter={(label: string) => label}
                        contentStyle={{ fontSize: '12px', borderRadius: '6px' }}
                      />
                      <Legend
                        formatter={(value: string) => {
                          const acct = accounts.find(a => a.account_id === value);
                          return acct ? `${acct.name} ${acct.mask}` : value;
                        }}
                        wrapperStyle={{ fontSize: '11px', paddingTop: '0px' }}
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
                  data-testid="account-balances"
                  style={{
                    borderTop: '1px solid #eee',
                    padding: '6px 10px',
                    display: 'flex',
                    flexWrap: 'wrap',
                    gap: '8px',
                    justifyContent: 'center',
                    backgroundColor: '#fafafa'
                  }}
                >
                  {accounts.map(acct => (
                    <div
                      key={acct.account_id}
                      data-testid={`balance-${acct.mask}`}
                      style={{
                        fontSize: '12px',
                        color: '#333',
                        whiteSpace: 'nowrap'
                      }}
                    >
                      <span style={{ color: '#888' }}>{acct.name} {acct.mask}</span>{' '}
                      <span style={{ fontWeight: 600 }}>
                        {acct.available_balance != null
                          ? new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(acct.available_balance)
                          : '—'}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
          <button
            data-testid="button-toggle-chart"
            onClick={() => setChartOpen(!chartOpen)}
            style={{
              display: 'block',
              width: '100%',
              padding: '4px',
              fontSize: '12px',
              color: '#666',
              backgroundColor: 'transparent',
              border: 'none',
              cursor: 'pointer',
              textAlign: 'center'
            }}
          >
            {chartOpen ? 'Hide Chart' : 'Show Chart'}
          </button>
        </div>
      </div>

      {initialLoading ? (
        <p>Loading...</p>
      ) : mergedItems.length === 0 ? (
        <p>No transactions found</p>
      ) : (
        <>
          {mergedItems.map((item, idx) => {
            const isForecast = item.type === 'forecast';
            const date = item.data.date;
            const amount = item.data.amount;
            
            let displayName: string;
            let logoUrl: string | undefined;
            let transactionForModal: Transaction | null = null;

            if (isForecast) {
              const forecast = item.data as Forecast;
              displayName = forecast.name;
              logoUrl = forecast.logo_url || undefined;
            } else {
              const transaction = item.data as Transaction;
              displayName = transaction.merchant_name || transaction.counterparty_name;
              logoUrl = transaction.logo_url;
              transactionForModal = transaction;
            }

            const isMatched = !isForecast && matchedTransactionIds.has((item.data as Transaction).id);
            const isForecasted = !isForecast && !isMatched && (() => {
              const tx = item.data as Transaction;
              const merchantId = tx.merchant_entity_id;
              const txName = tx.merchant_name || tx.counterparty_name;
              return forecasts.some(f =>
                (merchantId && f.merchant_entity_id === merchantId) ||
                (txName && f.name === txName)
              );
            })();

            const { display: amountDisplay, isPositive } = isForecast 
              ? { 
                  display: new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount),
                  isPositive: amount > 0
                }
              : formatAmount(amount);
            
            const itemKey = isForecast ? `forecast-${(item.data as Forecast).id}` : `tx-${(item.data as Transaction).id}`;
            const isDropTarget = !isForecast && dropTargetId === (item.data as Transaction).id;
            const isDragging = isForecast && draggingForecast?.id === (item.data as Forecast).id;

            return (
              <div
                key={itemKey}
                ref={(el) => {
                  if (idx === scrollAnchorIndex && el) {
                    scrollAnchorRef.current = el;
                  }
                  if (!isForecast && el) {
                    transactionRefs.current.set((item.data as Transaction).id, el);
                  }
                }}
                onTouchStart={isForecast ? (e) => handleLongPressStart(item.data as Forecast, e) : undefined}
                onMouseDown={isForecast ? (e) => handleLongPressStart(item.data as Forecast, e) : undefined}
                onTouchEnd={isForecast && !draggingForecast ? () => cancelLongPress() : undefined}
                onMouseUp={isForecast && !draggingForecast ? () => cancelLongPress() : undefined}
                onMouseLeave={isForecast && !draggingForecast ? () => cancelLongPress() : undefined}
                onClick={isForecast && !draggingForecast ? () => {
                  const fc = item.data as Forecast;
                  setEditingForecast(fc);
                  setForecastDate(fc.date);
                  setForecastAmount((-fc.amount).toString());
                  setModalView('editForecast');
                } : undefined}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px',
                  padding: '8px',
                  marginBottom: '2px',
                  backgroundColor: isDropTarget ? '#bbdefb' : isForecast ? '#E3F2FD' : '#fff',
                  borderRadius: '8px',
                  boxShadow: isDropTarget ? '0 0 0 3px #1976d2' : '0 1px 3px rgba(0,0,0,0.1)',
                  borderLeft: isForecast ? 'none' : (isMatched ? '4px solid #4CAF50' : isForecasted ? '4px solid #64B5F6' : '4px solid #F4A916'),
                  opacity: isDragging ? 0.4 : 1,
                  cursor: isForecast ? 'grab' : 'default',
                  userSelect: 'none',
                  transition: 'background-color 0.15s, box-shadow 0.15s',
                  touchAction: draggingForecast ? 'none' : 'auto'
                }}
              >
                {logoUrl ? (
                  <img 
                    src={logoUrl} 
                    alt={displayName}
                    style={{ width: '40px', height: '40px', borderRadius: '50%', objectFit: 'cover' }}
                  />
                ) : (
                  <div style={{
                    width: '40px',
                    height: '40px',
                    borderRadius: '50%',
                    backgroundColor: '#e0e0e0',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '14px',
                    fontWeight: 'bold'
                  }}>
                    {getInitials(displayName)}
                  </div>
                )}
                
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ 
                    fontWeight: 500,
                    display: '-webkit-box',
                    WebkitLineClamp: 2,
                    WebkitBoxOrient: 'vertical',
                    overflow: 'hidden'
                  }}>
                    {displayName}
                  </div>
                  {isForecast && (
                    <div style={{ fontSize: '11px', color: '#42A5F5', fontWeight: 600 }}>FORECAST</div>
                  )}
                </div>
                
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontWeight: 600, color: isForecast ? '#42A5F5' : (isPositive ? 'green' : 'inherit') }}>
                    {amountDisplay}
                  </div>
                  <div style={{ fontSize: '12px', color: '#666' }}>
                    {formatDate(date)}
                  </div>
                </div>
                
                {!isForecast && transactionForModal && (
                  <button 
                    data-testid={`button-details-${(item.data as Transaction).id}`}
                    style={{
                      padding: '6px 10px',
                      fontSize: '18px',
                      backgroundColor: 'transparent',
                      color: '#666',
                      border: '1px solid #ddd',
                      borderRadius: '4px',
                      cursor: 'pointer',
                      lineHeight: 1
                    }}
                    onClick={() => {
                      setSelectedTransaction(transactionForModal);
                      setModalView('details');
                    }}
                  >
                    ...
                  </button>
                )}
              </div>
            );
          })}
          
          <div ref={sentinelRef} style={{ textAlign: 'center', padding: '20px' }}>
            {loading && <p>Loading...</p>}
            {!hasMore && <p style={{ color: '#666' }}>No more transactions</p>}
          </div>
        </>
      )}

      {draggingForecast && dragPos && (
        <div style={{
          position: 'fixed',
          left: dragPos.x - 100,
          top: dragPos.y - 25,
          width: '200px',
          padding: '8px 12px',
          backgroundColor: '#42A5F5',
          color: 'white',
          borderRadius: '8px',
          boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
          pointerEvents: 'none',
          zIndex: 2000,
          fontSize: '13px',
          fontWeight: 600,
          textAlign: 'center',
          opacity: 0.9
        }}>
          {draggingForecast.name}
          <div style={{ fontSize: '11px', fontWeight: 400, marginTop: '2px' }}>
            Drop on a transaction to match
          </div>
        </div>
      )}

      {(selectedTransaction || editingForecast) && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0,0,0,0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000
        }}
        onClick={() => {
          setSelectedTransaction(null);
          setEditingForecast(null);
          setModalView('details');
          setForecastDate('');
          setForecastAmount('');
          setForecastType('single');
          setForecastMonths(12);
        }}>
          <div style={{
            backgroundColor: 'white',
            padding: '24px',
            borderRadius: '8px',
            maxWidth: '400px',
            width: '90%'
          }} onClick={(e) => e.stopPropagation()}>

            {modalView === 'details' && selectedTransaction && (
              <>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                  <h2 style={{ margin: 0 }}>Transaction Details</h2>
                  <button
                    data-testid="button-close-modal"
                    onClick={() => {
                      setSelectedTransaction(null);
                      setModalView('details');
                    }}
                    style={{
                      background: 'none',
                      border: 'none',
                      fontSize: '20px',
                      cursor: 'pointer',
                      color: '#666',
                      padding: '4px 8px'
                    }}
                  >
                    X
                  </button>
                </div>

                <button
                  data-testid="button-add-forecast"
                  onClick={() => {
                    if (selectedTransaction) {
                      const txDate = new Date(selectedTransaction.date + 'T00:00:00');
                      txDate.setMonth(txDate.getMonth() + 1);
                      const yyyy = txDate.getFullYear();
                      const mm = String(txDate.getMonth() + 1).padStart(2, '0');
                      const dd = String(txDate.getDate()).padStart(2, '0');
                      setForecastDate(`${yyyy}-${mm}-${dd}`);
                      setForecastAmount((-selectedTransaction.amount).toString());
                    }
                    setModalView('forecast');
                  }}
                  style={{
                    width: '100%',
                    padding: '10px',
                    backgroundColor: '#42A5F5',
                    color: 'white',
                    border: 'none',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    fontWeight: 600,
                    fontSize: '14px',
                    marginBottom: '20px'
                  }}
                >
                  + Add Forecast
                </button>

                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
                  {selectedTransaction.logo_url ? (
                    <img
                      src={selectedTransaction.logo_url}
                      alt={selectedTransaction.merchant_name || selectedTransaction.counterparty_name}
                      style={{ width: '48px', height: '48px', borderRadius: '50%', objectFit: 'cover' }}
                    />
                  ) : (
                    <div style={{
                      width: '48px',
                      height: '48px',
                      borderRadius: '50%',
                      backgroundColor: '#e0e0e0',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '16px',
                      fontWeight: 'bold'
                    }}>
                      {getInitials(selectedTransaction.merchant_name || selectedTransaction.counterparty_name)}
                    </div>
                  )}
                  <div>
                    <div style={{ fontWeight: 600, fontSize: '16px' }}>
                      {selectedTransaction.merchant_name || selectedTransaction.counterparty_name}
                    </div>
                    {selectedTransaction.merchant_name && selectedTransaction.counterparty_name && selectedTransaction.merchant_name !== selectedTransaction.counterparty_name && (
                      <div style={{ fontSize: '13px', color: '#666' }}>{selectedTransaction.counterparty_name}</div>
                    )}
                  </div>
                </div>

                <div style={{ borderTop: '1px solid #eee', paddingTop: '12px' }}>
                  {(() => {
                    const { display, isPositive } = formatAmount(selectedTransaction.amount);
                    return (
                      <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0' }}>
                        <span style={{ color: '#666' }}>Amount</span>
                        <span style={{ fontWeight: 600, color: isPositive ? 'green' : 'inherit' }}>{display}</span>
                      </div>
                    );
                  })()}
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0' }}>
                    <span style={{ color: '#666' }}>Date</span>
                    <span style={{ fontWeight: 500 }}>{formatDate(selectedTransaction.date)}</span>
                  </div>
                  {(() => {
                    const acct = accounts.find(a => a.account_id === selectedTransaction.account_id);
                    if (acct) {
                      return (
                        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0' }}>
                          <span style={{ color: '#666' }}>Account</span>
                          <span style={{ fontWeight: 500 }}>{acct.name} {acct.mask}</span>
                        </div>
                      );
                    }
                    return null;
                  })()}
                  {(() => {
                    const merchantId = selectedTransaction.merchant_entity_id;
                    const txName = selectedTransaction.merchant_name || selectedTransaction.counterparty_name;
                    const hasForecast = forecasts.some(f =>
                      (merchantId && f.merchant_entity_id === merchantId) ||
                      (txName && f.name === txName)
                    );
                    return (
                      <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0' }}>
                        <span style={{ color: '#666' }}>Forecasted</span>
                        <span style={{ fontWeight: 500, color: hasForecast ? 'green' : '#999' }}>
                          {hasForecast ? 'True' : 'False'}
                        </span>
                      </div>
                    );
                  })()}
                  {(() => {
                    const matchedForecast = forecasts.find(f => f.matched_transaction_id === selectedTransaction.id);
                    if (!matchedForecast) return null;
                    return (
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0' }}>
                        <span style={{ color: '#4CAF50', fontWeight: 600 }}>Matched</span>
                        <button
                          data-testid="button-undo-match"
                          onClick={async () => {
                            try {
                              await unreconcileForecast(matchedForecast.id!);
                              const updatedForecasts = await getForecasts(auth.currentUser!.uid);
                              setForecasts(updatedForecasts);
                            } catch (error) {
                              console.error('Error undoing match:', error);
                            }
                          }}
                          style={{
                            padding: '4px 12px',
                            fontSize: '13px',
                            backgroundColor: 'transparent',
                            color: '#e53935',
                            border: '1px solid #e53935',
                            borderRadius: '4px',
                            cursor: 'pointer',
                            fontWeight: 500
                          }}
                        >
                          Undo
                        </button>
                      </div>
                    );
                  })()}
                </div>
              </>
            )}

            {modalView === 'forecast' && selectedTransaction && (
              <>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <button
                      data-testid="button-back-to-details"
                      onClick={() => {
                        setModalView('details');
                        setForecastDate('');
                        setForecastAmount('');
                      }}
                      style={{
                        background: 'none',
                        border: 'none',
                        fontSize: '18px',
                        cursor: 'pointer',
                        color: '#666',
                        padding: '4px'
                      }}
                    >
                      &larr;
                    </button>
                    <h2 style={{ margin: 0 }}>Add Forecast</h2>
                  </div>
                  <button
                    onClick={() => {
                      setSelectedTransaction(null);
                      setModalView('details');
                      setForecastDate('');
                      setForecastAmount('');
                    }}
                    style={{
                      background: 'none',
                      border: 'none',
                      fontSize: '20px',
                      cursor: 'pointer',
                      color: '#666',
                      padding: '4px 8px'
                    }}
                  >
                    X
                  </button>
                </div>

                <p style={{ margin: '0 0 16px 0' }}>
                  <strong>{selectedTransaction!.merchant_name || selectedTransaction!.counterparty_name}</strong>
                </p>

                <div style={{ marginBottom: '16px' }}>
                  <label style={{ display: 'block', marginBottom: '6px', fontSize: '14px', fontWeight: 500 }}>Type</label>
                  <div style={{ display: 'flex', gap: '0' }}>
                    <button
                      data-testid="button-forecast-single"
                      onClick={() => setForecastType('single')}
                      style={{
                        flex: 1,
                        padding: '8px',
                        backgroundColor: forecastType === 'single' ? '#42A5F5' : '#f5f5f5',
                        color: forecastType === 'single' ? 'white' : '#333',
                        border: '1px solid #ccc',
                        borderRadius: '4px 0 0 4px',
                        cursor: 'pointer',
                        fontWeight: forecastType === 'single' ? 600 : 400,
                        fontSize: '14px'
                      }}
                    >
                      Single
                    </button>
                    <button
                      data-testid="button-forecast-monthly"
                      onClick={() => setForecastType('monthly')}
                      style={{
                        flex: 1,
                        padding: '8px',
                        backgroundColor: forecastType === 'monthly' ? '#42A5F5' : '#f5f5f5',
                        color: forecastType === 'monthly' ? 'white' : '#333',
                        border: '1px solid #ccc',
                        borderLeft: 'none',
                        borderRadius: '0',
                        cursor: 'pointer',
                        fontWeight: forecastType === 'monthly' ? 600 : 400,
                        fontSize: '14px'
                      }}
                    >
                      Monthly
                    </button>
                    <button
                      data-testid="button-forecast-every-x-days"
                      onClick={() => setForecastType('every_x_days')}
                      style={{
                        flex: 1,
                        padding: '8px',
                        backgroundColor: forecastType === 'every_x_days' ? '#42A5F5' : '#f5f5f5',
                        color: forecastType === 'every_x_days' ? 'white' : '#333',
                        border: '1px solid #ccc',
                        borderLeft: 'none',
                        borderRadius: '0 4px 4px 0',
                        cursor: 'pointer',
                        fontWeight: forecastType === 'every_x_days' ? 600 : 400,
                        fontSize: '14px'
                      }}
                    >
                      Every X Days
                    </button>
                  </div>
                </div>

                <div style={{ marginTop: '0' }}>
                  <label style={{ display: 'block', marginBottom: '4px', fontSize: '14px' }}>
                    {forecastType === 'single' ? 'Date' : 'Starting Date'}
                  </label>
                  <input 
                    type="date"
                    data-testid="input-forecast-date"
                    value={forecastDate}
                    onChange={(e) => setForecastDate(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '8px',
                      borderRadius: '4px',
                      border: '1px solid #ccc',
                      boxSizing: 'border-box'
                    }}
                  />
                </div>
                
                <div style={{ marginTop: '16px' }}>
                  <label style={{ display: 'block', marginBottom: '4px', fontSize: '14px' }}>Amount</label>
                  <input 
                    type="number" 
                    step="0.01"
                    placeholder="0.00"
                    data-testid="input-forecast-amount"
                    value={forecastAmount}
                    onChange={(e) => setForecastAmount(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '8px',
                      borderRadius: '4px',
                      border: '1px solid #ccc',
                      boxSizing: 'border-box'
                    }}
                  />
                </div>

                {forecastType === 'every_x_days' && (
                  <div style={{ marginTop: '16px', display: 'flex', gap: '8px' }}>
                    <div style={{ flex: 1 }}>
                      <label style={{ display: 'block', marginBottom: '4px', fontSize: '14px' }}>
                        Every
                      </label>
                      <input
                        type="number"
                        min="1"
                        data-testid="input-forecast-day-interval"
                        value={forecastDayInterval}
                        onChange={(e) => setForecastDayInterval(Math.max(1, parseInt(e.target.value) || 1))}
                        style={{
                          width: '100%',
                          padding: '8px',
                          borderRadius: '4px',
                          border: '1px solid #ccc',
                          boxSizing: 'border-box'
                        }}
                      />
                      <span style={{ fontSize: '12px', color: '#888', marginTop: '2px', display: 'block' }}>days</span>
                    </div>
                    <div style={{ flex: 1 }}>
                      <label style={{ display: 'block', marginBottom: '4px', fontSize: '14px' }}>
                        Occurrences
                      </label>
                      <input
                        type="number"
                        min="1"
                        max="52"
                        data-testid="input-forecast-day-count"
                        value={forecastDayCount}
                        onChange={(e) => setForecastDayCount(Math.max(1, Math.min(52, parseInt(e.target.value) || 1)))}
                        style={{
                          width: '100%',
                          padding: '8px',
                          borderRadius: '4px',
                          border: '1px solid #ccc',
                          boxSizing: 'border-box'
                        }}
                      />
                    </div>
                  </div>
                )}

                {forecastType === 'monthly' && (
                  <div style={{ marginTop: '16px' }}>
                    <label style={{ display: 'block', marginBottom: '4px', fontSize: '14px' }}>
                      Number of Months
                    </label>
                    <select
                      data-testid="select-forecast-months"
                      value={forecastMonths}
                      onChange={(e) => setForecastMonths(parseInt(e.target.value))}
                      style={{
                        width: '100%',
                        padding: '8px',
                        borderRadius: '4px',
                        border: '1px solid #ccc',
                        boxSizing: 'border-box',
                        backgroundColor: 'white'
                      }}
                    >
                      {Array.from({ length: 12 }, (_, i) => i + 1).map(n => (
                        <option key={n} value={n}>{n} month{n > 1 ? 's' : ''}</option>
                      ))}
                    </select>
                  </div>
                )}
                
                <div style={{ marginTop: '20px', display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                  <button
                    onClick={() => {
                      setModalView('details');
                      setForecastDate('');
                      setForecastAmount('');
                      setForecastType('single');
                      setForecastMonths(12);
                    }}
                    style={{
                      padding: '8px 16px',
                      backgroundColor: '#666',
                      color: 'white',
                      border: 'none',
                      borderRadius: '4px',
                      cursor: 'pointer'
                    }}
                  >
                    Cancel
                  </button>
                  <button
                    data-testid="button-save-forecast"
                    disabled={saving || !forecastDate || !forecastAmount}
                    onClick={async () => {
                      if (!selectedTransaction || !auth.currentUser) return;
                      setSaving(true);
                      try {
                        const merchantName = selectedTransaction.merchant_name || selectedTransaction.counterparty_name;
                        const baseForecast = {
                          user_id: auth.currentUser.uid,
                          name: merchantName,
                          merchant_entity_id: selectedTransaction.merchant_entity_id || null,
                          amount: -parseFloat(forecastAmount),
                          created_at: new Date().toISOString(),
                          account_id: selectedTransaction.account_id || null,
                          logo_url: selectedTransaction.logo_url || null
                        };

                        if (forecastType === 'monthly') {
                          await saveSeriesForecasts(baseForecast, forecastDate, forecastMonths);
                        } else if (forecastType === 'every_x_days') {
                          await saveDayIntervalForecasts(baseForecast, forecastDate, forecastDayInterval, forecastDayCount);
                        } else {
                          await saveForecast({
                            ...baseForecast,
                            date: forecastDate,
                            series_id: null
                          });
                        }

                        const updatedForecasts = await getForecasts(auth.currentUser.uid);
                        setForecasts(updatedForecasts);
                        setSelectedTransaction(null);
                        setModalView('details');
                        setForecastDate('');
                        setForecastAmount('');
                        setForecastType('single');
                        setForecastMonths(12);
                      } catch (error: any) {
                        console.error('Error saving forecast:', error?.code, error?.message, error);
                        alert('Error: ' + (error?.code || '') + ' ' + (error?.message || 'Unknown error'));
                      } finally {
                        setSaving(false);
                      }
                    }}
                    style={{
                      padding: '8px 16px',
                      backgroundColor: '#42A5F5',
                      color: 'white',
                      border: 'none',
                      borderRadius: '4px',
                      cursor: saving || !forecastDate || !forecastAmount ? 'not-allowed' : 'pointer',
                      opacity: saving || !forecastDate || !forecastAmount ? 0.6 : 1
                    }}
                  >
                    {saving ? 'Saving...' : forecastType === 'monthly' ? `Save ${forecastMonths} Forecasts` : forecastType === 'every_x_days' ? `Save ${forecastDayCount} Forecasts` : 'Save'}
                  </button>
                </div>
              </>
            )}

            {modalView === 'editForecast' && editingForecast && (
              <>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                  <h2 style={{ margin: 0 }}>Edit Forecast</h2>
                  <button
                    data-testid="button-close-edit-forecast"
                    onClick={() => {
                      setEditingForecast(null);
                      setModalView('details');
                      setForecastDate('');
                      setForecastAmount('');
                      setForecastType('single');
                      setForecastMonths(12);
                    }}
                    style={{
                      background: 'none',
                      border: 'none',
                      fontSize: '20px',
                      cursor: 'pointer',
                      color: '#666',
                      padding: '4px 8px'
                    }}
                  >
                    X
                  </button>
                </div>

                <p style={{ margin: '0 0 16px 0' }}>
                  <strong>{editingForecast.name}</strong>
                  {editingForecast.series_id && (
                    <span style={{ fontSize: '12px', color: '#42A5F5', marginLeft: '8px', fontWeight: 600 }}>SERIES</span>
                  )}
                </p>

                <div style={{ marginTop: '0' }}>
                  <label style={{ display: 'block', marginBottom: '4px', fontSize: '14px' }}>Date</label>
                  <input 
                    type="date"
                    data-testid="input-edit-forecast-date"
                    value={forecastDate}
                    onChange={(e) => setForecastDate(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '8px',
                      borderRadius: '4px',
                      border: '1px solid #ccc',
                      boxSizing: 'border-box'
                    }}
                  />
                </div>
                
                <div style={{ marginTop: '16px' }}>
                  <label style={{ display: 'block', marginBottom: '4px', fontSize: '14px' }}>Amount</label>
                  <input 
                    type="number" 
                    step="0.01"
                    placeholder="0.00"
                    data-testid="input-edit-forecast-amount"
                    value={forecastAmount}
                    onChange={(e) => setForecastAmount(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '8px',
                      borderRadius: '4px',
                      border: '1px solid #ccc',
                      boxSizing: 'border-box'
                    }}
                  />
                </div>

                <div style={{ marginTop: '20px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <button
                    data-testid="button-save-this-forecast"
                    disabled={saving || !forecastDate || !forecastAmount}
                    onClick={async () => {
                      if (!editingForecast?.id || !auth.currentUser) return;
                      setSaving(true);
                      try {
                        await updateForecast(editingForecast.id, {
                          date: forecastDate,
                          amount: -parseFloat(forecastAmount)
                        });
                        const updatedForecasts = await getForecasts(auth.currentUser.uid);
                        setForecasts(updatedForecasts);
                        setEditingForecast(null);
                        setModalView('details');
                        setForecastDate('');
                        setForecastAmount('');
                      } catch (error: any) {
                        console.error('Error updating forecast:', error);
                        alert('Error: ' + (error?.message || 'Unknown error'));
                      } finally {
                        setSaving(false);
                      }
                    }}
                    style={{
                      padding: '10px 16px',
                      backgroundColor: '#42A5F5',
                      color: 'white',
                      border: 'none',
                      borderRadius: '4px',
                      cursor: saving ? 'not-allowed' : 'pointer',
                      opacity: saving ? 0.6 : 1,
                      fontWeight: 600
                    }}
                  >
                    {saving ? 'Saving...' : 'Save This Forecast'}
                  </button>

                  {editingForecast.series_id && (
                    <button
                      data-testid="button-save-series-forecast"
                      disabled={saving || !forecastAmount}
                      onClick={async () => {
                        if (!editingForecast?.series_id || !auth.currentUser) return;
                        setSaving(true);
                        try {
                          await updateSeriesForecasts(
                            editingForecast.series_id,
                            auth.currentUser.uid,
                            { amount: -parseFloat(forecastAmount) }
                          );
                          const updatedForecasts = await getForecasts(auth.currentUser.uid);
                          setForecasts(updatedForecasts);
                          setEditingForecast(null);
                          setModalView('details');
                          setForecastDate('');
                          setForecastAmount('');
                        } catch (error: any) {
                          console.error('Error updating series:', error);
                          alert('Error: ' + (error?.message || 'Unknown error'));
                        } finally {
                          setSaving(false);
                        }
                      }}
                      style={{
                        padding: '10px 16px',
                        backgroundColor: '#1976d2',
                        color: 'white',
                        border: 'none',
                        borderRadius: '4px',
                        cursor: saving ? 'not-allowed' : 'pointer',
                        opacity: saving ? 0.6 : 1,
                        fontWeight: 600
                      }}
                    >
                      {saving ? 'Saving...' : 'Update Entire Series (Amount)'}
                    </button>
                  )}

                  <div style={{ borderTop: '1px solid #eee', paddingTop: '8px', marginTop: '4px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    <button
                      data-testid="button-delete-this-forecast"
                      disabled={saving}
                      onClick={async () => {
                        if (!editingForecast?.id || !auth.currentUser) return;
                        if (!confirm('Delete this forecast?')) return;
                        setSaving(true);
                        try {
                          await deleteForecast(editingForecast.id);
                          const updatedForecasts = await getForecasts(auth.currentUser.uid);
                          setForecasts(updatedForecasts);
                          setEditingForecast(null);
                          setModalView('details');
                          setForecastDate('');
                          setForecastAmount('');
                          setForecastType('single');
                          setForecastMonths(12);
                        } catch (error: any) {
                          console.error('Error deleting forecast:', error);
                          alert('Error: ' + (error?.message || 'Unknown error'));
                        } finally {
                          setSaving(false);
                        }
                      }}
                      style={{
                        padding: '10px 16px',
                        backgroundColor: '#d32f2f',
                        color: 'white',
                        border: 'none',
                        borderRadius: '4px',
                        cursor: saving ? 'not-allowed' : 'pointer',
                        opacity: saving ? 0.6 : 1,
                        fontWeight: 600
                      }}
                    >
                      {saving ? 'Deleting...' : 'Delete This Forecast'}
                    </button>

                    {editingForecast.series_id && (
                      <button
                        data-testid="button-delete-series-forecast"
                        disabled={saving}
                        onClick={async () => {
                          if (!editingForecast?.series_id || !auth.currentUser) return;
                          if (!confirm('Delete all forecasts in this series?')) return;
                          setSaving(true);
                          try {
                            await deleteSeriesForecasts(editingForecast.series_id, auth.currentUser.uid);
                            const updatedForecasts = await getForecasts(auth.currentUser.uid);
                            setForecasts(updatedForecasts);
                            setEditingForecast(null);
                            setModalView('details');
                            setForecastDate('');
                            setForecastAmount('');
                            setForecastType('single');
                            setForecastMonths(12);
                          } catch (error: any) {
                            console.error('Error deleting series:', error);
                            alert('Error: ' + (error?.message || 'Unknown error'));
                          } finally {
                            setSaving(false);
                          }
                        }}
                        style={{
                          padding: '10px 16px',
                          backgroundColor: '#b71c1c',
                          color: 'white',
                          border: 'none',
                          borderRadius: '4px',
                          cursor: saving ? 'not-allowed' : 'pointer',
                          opacity: saving ? 0.6 : 1,
                          fontWeight: 600
                        }}
                      >
                        {saving ? 'Deleting...' : 'Delete Entire Series'}
                      </button>
                    )}
                  </div>

                  <button
                    onClick={() => {
                      setEditingForecast(null);
                      setModalView('details');
                      setForecastDate('');
                      setForecastAmount('');
                      setForecastType('single');
                      setForecastMonths(12);
                    }}
                    style={{
                      padding: '10px 16px',
                      backgroundColor: '#666',
                      color: 'white',
                      border: 'none',
                      borderRadius: '4px',
                      cursor: 'pointer'
                    }}
                  >
                    Cancel
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default Home;
