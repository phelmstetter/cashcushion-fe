import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { signOut } from "firebase/auth";
import { auth, getTransactions, Transaction, saveForecast, saveSeriesForecasts, saveDayIntervalForecasts, updateForecast, updateSeriesForecasts, deleteForecast, deleteSeriesForecasts, getForecasts, Forecast, reconcileForecast, unreconcileForecast, getAccounts, Account } from "@/lib/firebase";
import { useLocation } from "wouter";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend, ReferenceLine, ReferenceDot } from 'recharts';

const LONG_PRESS_MS = 500;

const Home = () => {
  const [, setLocation] = useLocation();
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [hasMore, setHasMore] = useState(true);
  const hasMoreRef = useRef(true);
  const [loading, setLoading] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  const [initialError, setInitialError] = useState<string | null>(null);
  const [paginationError, setPaginationError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [selectedTransaction, setSelectedTransaction] = useState<Transaction | null>(null);
  const [modalView, setModalView] = useState<'details' | 'forecast' | 'editForecast'>('details');
  const [forecastDate, setForecastDate] = useState('');
  const [forecastAmount, setForecastAmount] = useState('');
  const [forecastType, setForecastType] = useState<'single' | 'monthly' | 'every_x_days'>('single');
  const [forecastDirection, setForecastDirection] = useState<'expense' | 'income'>('expense');
  const [forecastMonths, setForecastMonths] = useState(12);
  const [forecastDayInterval, setForecastDayInterval] = useState(14);
  const [forecastDayCount, setForecastDayCount] = useState(12);
  const [autoExtend, setAutoExtend] = useState(false);
  const [saving, setSaving] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState<'one' | 'series' | null>(null);
  const [editingForecast, setEditingForecast] = useState<Forecast | null>(null);
  const [addingStandaloneForecast, setAddingStandaloneForecast] = useState(false);
  const [standaloneForecastName, setStandaloneForecastName] = useState('');
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
  const profileMenuButtonRef = useRef<HTMLButtonElement | null>(null);
  const dialogRef = useRef<HTMLDivElement | null>(null);

  const closeModal = useCallback(() => {
    setSelectedTransaction(null);
    setEditingForecast(null);
    setAddingStandaloneForecast(false);
    setStandaloneForecastName('');
    setModalView('details');
    setForecastDate('');
    setForecastAmount('');
    setForecastType('single');
    setForecastDirection('expense');
    setForecastMonths(12);
    setAutoExtend(false);
    setActionError(null);
    setConfirmingDelete(null);
  }, []);

  const isModalOpen = Boolean(selectedTransaction || editingForecast || addingStandaloneForecast);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      if (isModalOpen) {
        event.preventDefault();
        closeModal();
      } else if (profileMenuOpen) {
        setProfileMenuOpen(false);
        profileMenuButtonRef.current?.focus();
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [closeModal, isModalOpen, profileMenuOpen]);

  useEffect(() => {
    if (isModalOpen) {
      dialogRef.current?.focus();
    }
  }, [isModalOpen, modalView]);

  const handleSignOut = async () => {
    await signOut(auth);
    setLocation("/login");
  };

  const loadInitialTransactions = async () => {
    const userId = auth.currentUser?.uid;
    if (!userId) {
      setInitialError('Your session has ended. Please sign in again.');
      setInitialLoading(false);
      return;
    }

    setInitialLoading(true);
    setInitialError(null);
    setPaginationError(null);
    const [transactionsResult, forecastsResult, accountsResult] = await Promise.allSettled([
      getTransactions(userId, null),
      getForecasts(userId),
      getAccounts(userId),
    ]);

    if (transactionsResult.status === 'fulfilled') {
      const result = transactionsResult.value;
      setTransactions(result.transactions);
      if (result.lastDate && result.lastId) {
        cursorRef.current = { date: result.lastDate, id: result.lastId };
      }
      setHasMore(result.hasMore);
      hasMoreRef.current = result.hasMore;
    } else {
      console.error("Error loading transactions:", transactionsResult.reason);
    }

    if (forecastsResult.status === 'fulfilled') {
      setForecasts(forecastsResult.value);
    } else {
      console.error("Error loading forecasts:", forecastsResult.reason);
    }

    if (accountsResult.status === 'fulfilled') {
      setAccounts(accountsResult.value);
    } else {
      console.error("Error loading accounts:", accountsResult.reason);
    }

    if ([transactionsResult, forecastsResult, accountsResult].some((result) => result.status === 'rejected')) {
      setInitialError('Some dashboard data could not be loaded. Check your connection and try again.');
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
    setPaginationError(null);
    try {
      const result = await getTransactions(userId, cursorRef.current);
      if (result.transactions.length > 0) {
        setTransactions(prev => {
          const existingIds = new Set(prev.map((transaction) => transaction.id));
          const nextPage = result.transactions.filter((transaction) => !existingIds.has(transaction.id));
          return nextPage.length ? [...prev, ...nextPage] : prev;
        });
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
      setPaginationError('We couldn’t load older transactions. Try again.');
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
  }, [initialLoading, hasMore]);

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
          setActionError('We couldn’t match that forecast. Please try again.');
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
    const date = /^\d{4}-\d{2}-\d{2}$/.test(dateString)
      ? new Date(`${dateString}T00:00:00`)
      : new Date(dateString);
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

  const signedForecastAmount = () => {
    const enteredAmount = Math.abs(parseFloat(forecastAmount));
    return forecastDirection === 'expense' ? enteredAmount : -enteredAmount;
  };

  const visibleForecasts = useMemo(
    () => forecasts.filter((forecast) => !forecast.matched_transaction_id),
    [forecasts]
  );

  const companyNames = useMemo(() => Array.from(new Set([
    ...transactions.map(t => t.merchant_name || t.counterparty_name),
    ...visibleForecasts.map(f => f.name)
  ])).filter((name): name is string => Boolean(name)).sort((a, b) => a.localeCompare(b)), [transactions, visibleForecasts]);

  const accountOptions = useMemo(() => Array.from(
    new Map(
      accounts
        .filter(a => a.account_id)
        .map(a => [
          a.account_id,
          { label: a.name ? `${a.name} ${a.mask}` : a.mask, value: a.account_id }
        ])
    ).values()
  ), [accounts]);

  const CHART_COLORS = ['#1976d2', '#e53935', '#43a047', '#fb8c00', '#8e24aa', '#00acc1', '#d81b60', '#6d4c41'];

  const chartData = useMemo(() => {
    if (accounts.length === 0) return [];

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const endDate = new Date(today);
    endDate.setMonth(endDate.getMonth() + 12);

    const forecastsByAccount: Record<string, Record<string, number>> = {};
    // Forecasts not tied to any account (e.g. a one-time expense) still
    // affect the overall projected cushion, just not any single account's line.
    const unassignedForecastsByDate: Record<string, number> = {};
    for (const f of visibleForecasts) {
      if (!f.account_id) {
        const dateStr = f.date;
        unassignedForecastsByDate[dateStr] = (unassignedForecastsByDate[dateStr] || 0) - f.amount;
        continue;
      }
      if (!forecastsByAccount[f.account_id]) forecastsByAccount[f.account_id] = {};
      const dateStr = f.date;
      if (!forecastsByAccount[f.account_id][dateStr]) forecastsByAccount[f.account_id][dateStr] = 0;
      forecastsByAccount[f.account_id][dateStr] -= f.amount;
    }

    const data: Record<string, any>[] = [];
    const currentBalances: Record<string, number> = {};
    for (const acct of accounts) {
      currentBalances[acct.account_id] = acct.available_balance ?? 0;
    }
    let unassignedAdjustment = 0;

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
      const dayUnassigned = unassignedForecastsByDate[dateStr] || 0;
      if (dayUnassigned !== 0) {
        unassignedAdjustment += dayUnassigned;
      }

      const point: Record<string, any> = { date: displayDate, fullDate: dateStr };
      let total = unassignedAdjustment;
      for (const acct of accounts) {
        const rounded = Math.round(currentBalances[acct.account_id] * 100) / 100;
        point[acct.account_id] = rounded;
        total += currentBalances[acct.account_id];
      }
      point.__total__ = Math.round(total * 100) / 100;
      data.push(point);

      d.setDate(d.getDate() + 1);
    }

    return data;
  }, [accounts, visibleForecasts]);

  const minBalancePoint = useMemo(() => {
    if (chartData.length === 0) return null;
    let min = chartData[0];
    for (const point of chartData) {
      if (point.__total__ < min.__total__) min = point;
    }
    return min;
  }, [chartData]);

  type MergedItem = 
    | { type: 'transaction'; data: Transaction }
    | { type: 'forecast'; data: Forecast };

  const mergedItems = useMemo<MergedItem[]>(() => [
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
  }), [visibleForecasts, transactions, accountFilter, companyFilter]);

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
            <button
              ref={profileMenuButtonRef}
              data-testid="button-profile-menu"
              onClick={() => setProfileMenuOpen(!profileMenuOpen)}
              aria-label="Open account menu"
              aria-haspopup="menu"
              aria-expanded={profileMenuOpen}
              style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', width: '32px', height: '32px', border: 'none', background: 'transparent', borderRadius: '4px' }}
            >
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="#555" strokeWidth="2" strokeLinecap="round">
                <line x1="3" y1="5" x2="17" y2="5" />
                <line x1="3" y1="10" x2="17" y2="10" />
                <line x1="3" y1="15" x2="17" y2="15" />
              </svg>
            </button>
            {profileMenuOpen && (
              <>
                <div
                  aria-hidden="true"
                  style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 1000 }}
                  onClick={() => setProfileMenuOpen(false)}
                />
                <div role="menu" aria-label="Account menu" style={{
                  position: 'absolute',
                  top: '40px',
                  right: 0,
                  backgroundColor: 'white',
                  border: '1px solid #ddd',
                  borderRadius: '6px',
                  boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
                  zIndex: 1001,
                  minWidth: '200px',
                  overflow: 'hidden'
                }}>
                  <div style={{ padding: '12px 14px', borderBottom: '1px solid #eee', display: 'flex', alignItems: 'center', gap: '10px' }}>
                    {currentUser?.photoURL ? (
                      <img
                        src={currentUser.photoURL}
                        alt="Profile"
                        data-testid="img-profile"
                        style={{ width: '32px', height: '32px', borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }}
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
                        fontWeight: 'bold',
                        flexShrink: 0
                      }}>
                        {currentUser?.email?.[0]?.toUpperCase() || '?'}
                      </div>
                    )}
                    {currentUser?.email && (
                      <span style={{ fontSize: '12px', color: '#666', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {currentUser.email}
                      </span>
                    )}
                  </div>
                  {[
                    { label: 'Linked Accounts', testId: 'menu-linked-accounts', path: '/linked-accounts' },
                    { label: 'Profile (coming soon)', testId: 'menu-profile', path: '', disabled: true },
                    { label: 'Billing (coming soon)', testId: 'menu-billing', path: '', disabled: true },
                    { label: 'Settings (coming soon)', testId: 'menu-settings', path: '', disabled: true }
                  ].map((item) => (
                    <button
                      key={item.testId}
                      data-testid={item.testId}
                      role="menuitem"
                      disabled={item.disabled}
                      onClick={() => {
                        setProfileMenuOpen(false);
                        if (item.path) setLocation(item.path);
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
                        color: item.disabled ? '#999' : '#333'
                      }}
                      onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#f5f5f5')}
                      onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'white')}
                    >
                      {item.label}
                    </button>
                  ))}
                  <div style={{ borderTop: '1px solid #eee' }} />
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
                    onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#f5f5f5')}
                    onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'white')}
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
                          if (name === '__total__') {
                            return [new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value), 'Total Cushion'];
                          }
                          const acct = accounts.find(a => a.account_id === name);
                          const label = acct ? `${acct.name} ${acct.mask}` : name;
                          return [new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value), label];
                        }}
                        labelFormatter={(label: string) => formatDate(label)}
                        contentStyle={{ fontSize: '12px', borderRadius: '6px' }}
                      />
                      <Legend
                        formatter={(value: string) => {
                          if (value === '__total__') return 'Total Cushion';
                          const acct = accounts.find(a => a.account_id === value);
                          return acct ? `${acct.name} ${acct.mask}` : value;
                        }}
                        wrapperStyle={{ fontSize: '11px', paddingTop: '0px' }}
                      />
                      <ReferenceLine
                        y={0}
                        stroke="#999"
                        strokeDasharray="3 3"
                        strokeWidth={1}
                        ifOverflow="extendDomain"
                      />
                      {minBalancePoint && (
                        <>
                          {/* Vertical guide line pinpointing the date of the minimum */}
                          <ReferenceLine
                            x={minBalancePoint.fullDate}
                            stroke="#90a4ae"
                            strokeDasharray="3 3"
                            strokeWidth={1}
                            ifOverflow="extendDomain"
                          />
                          {/* Horizontal guide line at the minimum balance level, carrying
                              the callout. Anchored to a fixed corner (not the exact data
                              point) via Recharts' own supported label positions, so it can
                              never be miscomputed or clipped regardless of screen size or
                              where the minimum falls on the timeline. */}
                          <ReferenceLine
                            y={minBalancePoint.__total__}
                            stroke="#90a4ae"
                            strokeDasharray="4 4"
                            strokeWidth={1.5}
                            ifOverflow="extendDomain"
                            label={{
                              value: `Min: ${new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(minBalancePoint.__total__)} (${minBalancePoint.date})`,
                              position: 'insideTopRight',
                              fontSize: 10,
                              fill: '#546e7a',
                            }}
                          />
                          <ReferenceDot
                            x={minBalancePoint.fullDate}
                            y={minBalancePoint.__total__}
                            r={4}
                            fill="#546e7a"
                            stroke="white"
                            ifOverflow="extendDomain"
                            isFront
                          />
                        </>
                      )}
                      <Line
                        key="__total__"
                        type="stepAfter"
                        dataKey="__total__"
                        stroke="#212121"
                        strokeWidth={2}
                        strokeDasharray="4 2"
                        dot={false}
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
          <div style={{ display: 'flex', alignItems: 'stretch' }}>
            <button
              data-testid="button-toggle-chart"
              onClick={() => setChartOpen(!chartOpen)}
              style={{
                flex: 1,
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
            <button
              data-testid="button-add-expense"
              onClick={() => {
                setAddingStandaloneForecast(true);
                setStandaloneForecastName('');
                setForecastDate('');
                setForecastAmount('');
                setForecastType('single');
                setForecastDirection('expense');
                setModalView('forecast');
              }}
              style={{
                flex: 1,
                padding: '4px',
                fontSize: '12px',
                color: '#42A5F5',
                fontWeight: 600,
                backgroundColor: 'transparent',
                border: 'none',
                borderLeft: '1px solid #eee',
                cursor: 'pointer',
                textAlign: 'center'
              }}
            >
              + Add Expense
            </button>
          </div>
        </div>
      </div>

      {initialLoading ? (
        <div aria-busy="true" style={{ padding: '24px 12px', color: '#666', textAlign: 'center' }}>
          Loading your transactions and forecasts…
        </div>
      ) : initialError && mergedItems.length === 0 ? (
        <div role="alert" style={{ margin: '16px 8px', padding: '16px', borderRadius: '8px', background: '#fff8e1', color: '#6b5300', textAlign: 'center' }}>
          <p style={{ margin: '0 0 10px' }}>{initialError}</p>
          <button onClick={loadInitialTransactions} style={{ padding: '7px 12px', border: '1px solid #b08800', borderRadius: '4px', background: 'white', color: '#6b5300', cursor: 'pointer' }}>
            Retry dashboard load
          </button>
        </div>
      ) : mergedItems.length === 0 ? (
        <div style={{ padding: '32px 18px', textAlign: 'center', color: '#555' }}>
          <p style={{ margin: '0 0 8px', fontWeight: 600 }}>No transactions to show yet.</p>
          <p style={{ margin: 0, fontSize: '14px' }}>Link an account or try refreshing after your bank has synced.</p>
        </div>
      ) : (
        <>
          {initialError && (
            <div role="alert" style={{ margin: '8px', padding: '12px', borderRadius: '8px', background: '#fff8e1', color: '#6b5300', fontSize: '14px' }}>
              <div>{initialError}</div>
              <button onClick={loadInitialTransactions} style={{ marginTop: '8px', padding: '6px 10px', border: '1px solid #b08800', borderRadius: '4px', background: 'white', color: '#6b5300', cursor: 'pointer' }}>
                Retry dashboard load
              </button>
            </div>
          )}
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
                  display: new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(-amount),
                  isPositive: -amount > 0
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
                draggable={isForecast}
                onDragStart={isForecast ? (event) => {
                  const forecast = item.data as Forecast;
                  if (!forecast.id) {
                    event.preventDefault();
                    return;
                  }
                  cancelLongPress();
                  event.dataTransfer.effectAllowed = 'move';
                  event.dataTransfer.setData('text/plain', forecast.id);
                  setDraggingForecast(forecast);
                } : undefined}
                onDragOver={!isForecast ? (event) => {
                  event.preventDefault();
                  event.dataTransfer.dropEffect = 'move';
                  setDropTargetId((item.data as Transaction).id);
                } : undefined}
                onDrop={!isForecast ? async (event) => {
                  event.preventDefault();
                  const forecastId = event.dataTransfer.getData('text/plain');
                  const transactionId = (item.data as Transaction).id;
                  if (!forecastId) return;
                  try {
                    await reconcileForecast(forecastId, transactionId);
                    setForecasts((current) => current.map((forecast) =>
                      forecast.id === forecastId
                        ? { ...forecast, matched_transaction_id: transactionId }
                        : forecast
                    ));
                  } catch (error) {
                    console.error('Error reconciling forecast:', error);
                    setActionError('We couldn’t match that forecast. Please try again.');
                  } finally {
                    setDraggingForecast(null);
                    setDragPos(null);
                    setDropTargetId(null);
                  }
                } : undefined}
                onDragEnd={isForecast ? () => {
                  cancelLongPress();
                  setDraggingForecast(null);
                  setDragPos(null);
                  setDropTargetId(null);
                } : undefined}
                onClick={isForecast && !draggingForecast ? () => {
                  const fc = item.data as Forecast;
                  setEditingForecast(fc);
                  setForecastDate(fc.date);
                  setForecastAmount(Math.abs(fc.amount).toString());
                  setForecastDirection(fc.amount >= 0 ? 'expense' : 'income');
                  setModalView('editForecast');
                } : undefined}
                role={isForecast ? 'button' : undefined}
                tabIndex={isForecast ? 0 : undefined}
                aria-label={isForecast ? `Edit ${displayName} ${amountDisplay} forecast` : undefined}
                onKeyDown={isForecast ? (event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    const fc = item.data as Forecast;
                    setEditingForecast(fc);
                    setForecastDate(fc.date);
                    setForecastAmount(Math.abs(fc.amount).toString());
                    setForecastDirection(fc.amount >= 0 ? 'expense' : 'income');
                    setModalView('editForecast');
                  }
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
                  touchAction: draggingForecast ? 'none' : 'auto',
                  contentVisibility: 'auto',
                  containIntrinsicSize: '64px'
                }}
              >
                {isForecast ? (
                  logoUrl ? (
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
                  )
                ) : transactionForModal && (
                  <button
                    data-testid={`button-details-${(item.data as Transaction).id}`}
                    aria-label={`View details for ${displayName}`}
                    title="View transaction details"
                    onClick={() => {
                      setSelectedTransaction(transactionForModal);
                      setModalView('details');
                    }}
                    style={{
                      width: '44px',
                      height: '44px',
                      padding: '2px',
                      border: '1px solid #d7d7d7',
                      borderRadius: '50%',
                      backgroundColor: '#fff',
                      cursor: 'pointer',
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0
                    }}
                  >
                    {logoUrl ? (
                      <img
                        src={logoUrl}
                        alt=""
                        style={{ width: '36px', height: '36px', borderRadius: '50%', objectFit: 'cover' }}
                      />
                    ) : (
                      <span style={{
                        width: '36px',
                        height: '36px',
                        borderRadius: '50%',
                        backgroundColor: '#e0e0e0',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: '14px',
                        fontWeight: 'bold'
                      }}>
                        {getInitials(displayName)}
                      </span>
                    )}
                  </button>
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
                  {isForecast && <div style={{ fontSize: '11px', color: '#1976d2', fontWeight: 600 }}>FORECAST</div>}
                </div>
                
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontWeight: 600, color: isForecast ? '#42A5F5' : (isPositive ? 'green' : 'inherit') }}>
                    {amountDisplay}
                  </div>
                  <div style={{ fontSize: '12px', color: '#666' }}>
                    {formatDate(date)}
                  </div>
                </div>
                
              </div>
            );
          })}
          
          <div ref={sentinelRef} style={{ textAlign: 'center', padding: '20px' }}>
            {loading && <p aria-live="polite">Loading older transactions…</p>}
            {paginationError && (
              <div role="alert" style={{ color: '#a33' }}>
                <p>{paginationError}</p>
                <button onClick={loadMoreTransactions} style={{ padding: '6px 10px', border: '1px solid #a33', borderRadius: '4px', background: 'white', color: '#a33', cursor: 'pointer' }}>
                  Try again
                </button>
              </div>
            )}
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

      {isModalOpen && (
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
        onMouseDown={(event) => {
          if (event.target === event.currentTarget && !saving) closeModal();
        }}>
          <div
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="forecast-dialog-title"
            tabIndex={-1}
            style={{
            backgroundColor: 'white',
            padding: '24px',
            borderRadius: '8px',
            maxWidth: '400px',
            width: '90%',
            maxHeight: '90vh',
            overflowY: 'auto'
          }}>
            {actionError && (
              <div role="alert" style={{ marginBottom: '16px', padding: '10px 12px', borderRadius: '6px', background: '#fef2f2', color: '#b91c1c', fontSize: '14px' }}>
                {actionError}
              </div>
            )}

            {modalView === 'details' && selectedTransaction && (
              <>
                {(() => {
                  const transactionName = selectedTransaction.merchant_name || selectedTransaction.counterparty_name;
                  const { display: transactionAmount, isPositive } = formatAmount(selectedTransaction.amount);
                  return (
                    <div style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '12px',
                      paddingBottom: '16px',
                      marginBottom: '16px',
                      borderBottom: '1px solid #eee'
                    }}>
                      {selectedTransaction.logo_url ? (
                        <img
                          src={selectedTransaction.logo_url}
                          alt={transactionName}
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
                          fontWeight: 'bold',
                          flexShrink: 0
                        }}>
                          {getInitials(transactionName)}
                        </div>
                      )}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <h2 id="forecast-dialog-title" style={{
                          margin: 0,
                          fontSize: '16px',
                          fontWeight: 600,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap'
                        }}>
                          {transactionName}
                        </h2>
                        {selectedTransaction.merchant_name && selectedTransaction.counterparty_name && selectedTransaction.merchant_name !== selectedTransaction.counterparty_name && (
                          <div style={{ fontSize: '13px', color: '#666', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {selectedTransaction.counterparty_name}
                          </div>
                        )}
                      </div>
                      <div style={{ textAlign: 'right', flexShrink: 0 }}>
                        <div style={{ fontWeight: 600, color: isPositive ? 'green' : 'inherit' }}>
                          {transactionAmount}
                        </div>
                        <div style={{ fontSize: '12px', color: '#666' }}>
                          {formatDate(selectedTransaction.date)}
                        </div>
                      </div>
                      <button
                        data-testid="button-close-modal"
                        aria-label="Close transaction details"
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
                          padding: '4px',
                          lineHeight: 1
                        }}
                      >×</button>
                    </div>
                  );
                })()}

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
                      setForecastAmount(Math.abs(selectedTransaction.amount).toString());
                      setForecastDirection(selectedTransaction.amount >= 0 ? 'expense' : 'income');
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

                <div>
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

            {modalView === 'forecast' && (selectedTransaction || addingStandaloneForecast) && (
              <>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    {selectedTransaction && (
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
                          aria-label="Back to transaction details"
                        >←</button>
                    )}
                    <h2 id="forecast-dialog-title" style={{ margin: 0 }}>Add forecast</h2>
                  </div>
                  <button
                    aria-label="Close forecast form"
                    onClick={() => {
                      closeModal();
                    }}
                    style={{
                      background: 'none',
                      border: 'none',
                      fontSize: '20px',
                      cursor: 'pointer',
                      color: '#666',
                      padding: '4px 8px'
                    }}
                  >×</button>
                </div>

                {selectedTransaction ? (
                  <p style={{ margin: '0 0 16px 0' }}>
                    <strong>{selectedTransaction.merchant_name || selectedTransaction.counterparty_name}</strong>
                  </p>
                ) : (
                  <div style={{ marginBottom: '16px' }}>
                    <label style={{ display: 'block', marginBottom: '4px', fontSize: '14px' }}>Name</label>
                    <input
                      type="text"
                      placeholder="e.g. Holiday gift"
                      data-testid="input-standalone-forecast-name"
                      value={standaloneForecastName}
                      onChange={(e) => setStandaloneForecastName(e.target.value)}
                      style={{
                        width: '100%',
                        padding: '8px',
                        borderRadius: '4px',
                        border: '1px solid #ccc',
                        boxSizing: 'border-box'
                      }}
                    />
                    <span style={{ fontSize: '12px', color: '#888', marginTop: '4px', display: 'block' }}>
                      Not tied to any account — only affects your Total Cushion projection.
                    </span>
                  </div>
                )}

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
                  <label style={{ display: 'block', marginBottom: '6px', fontSize: '14px', fontWeight: 500 }}>Cash-flow direction</label>
                  <div role="group" aria-label="Forecast cash-flow direction" style={{ display: 'flex', marginBottom: '10px' }}>
                    <button
                      type="button"
                      onClick={() => setForecastDirection('expense')}
                      aria-pressed={forecastDirection === 'expense'}
                      style={{
                        flex: 1, padding: '8px', border: '1px solid #ccc', borderRadius: '4px 0 0 4px',
                        background: forecastDirection === 'expense' ? '#37474f' : '#f5f5f5',
                        color: forecastDirection === 'expense' ? 'white' : '#333', cursor: 'pointer'
                      }}
                    >
                      Expense
                    </button>
                    <button
                      type="button"
                      onClick={() => setForecastDirection('income')}
                      aria-pressed={forecastDirection === 'income'}
                      style={{
                        flex: 1, padding: '8px', border: '1px solid #ccc', borderLeft: 'none', borderRadius: '0 4px 4px 0',
                        background: forecastDirection === 'income' ? '#2e7d32' : '#f5f5f5',
                        color: forecastDirection === 'income' ? 'white' : '#333', cursor: 'pointer'
                      }}
                    >
                      Income
                    </button>
                  </div>
                  <label style={{ display: 'block', marginBottom: '4px', fontSize: '14px' }}>
                    Amount (enter a positive number)
                  </label>
                  <input 
                    type="number" 
                    min="0"
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
                  <span style={{ display: 'block', marginTop: '4px', color: '#666', fontSize: '12px' }}>
                    {forecastDirection === 'expense'
                      ? 'This lowers the projected balance on the selected date.'
                      : 'This raises the projected balance on the selected date.'}
                  </span>
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
                
                {forecastType !== 'single' && (
                  <div style={{ marginTop: '16px', display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <label
                      data-testid="toggle-auto-extend"
                      style={{
                        position: 'relative',
                        display: 'inline-block',
                        width: '44px',
                        height: '24px',
                        cursor: 'pointer'
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={autoExtend}
                        onChange={(e) => setAutoExtend(e.target.checked)}
                        style={{ opacity: 0, width: 0, height: 0, position: 'absolute' }}
                      />
                      <span style={{
                        position: 'absolute',
                        top: 0, left: 0, right: 0, bottom: 0,
                        backgroundColor: autoExtend ? '#42A5F5' : '#ccc',
                        borderRadius: '12px',
                        transition: 'background-color 0.2s'
                      }} />
                      <span style={{
                        position: 'absolute',
                        top: '2px',
                        left: autoExtend ? '22px' : '2px',
                        width: '20px',
                        height: '20px',
                        backgroundColor: 'white',
                        borderRadius: '50%',
                        transition: 'left 0.2s',
                        boxShadow: '0 1px 3px rgba(0,0,0,0.2)'
                      }} />
                    </label>
                    <span style={{ fontSize: '14px', color: '#333' }}>
                      Auto-extend forecast 12 months
                    </span>
                  </div>
                )}

                <div style={{ marginTop: '20px', display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                  <button
                    onClick={() => {
                      setAddingStandaloneForecast(false);
                      setStandaloneForecastName('');
                      setModalView('details');
                      setForecastDate('');
                      setForecastAmount('');
                      setForecastType('single');
                      setForecastMonths(12);
                      setAutoExtend(false);
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
                    disabled={saving || !forecastDate || !forecastAmount || (addingStandaloneForecast && !standaloneForecastName.trim())}
                    onClick={async () => {
                      if (!auth.currentUser) return;
                      if (!selectedTransaction && !addingStandaloneForecast) return;
                      setSaving(true);
                      setActionError(null);
                      try {
                        const amount = signedForecastAmount();
                        const baseForecast = selectedTransaction ? {
                          user_id: auth.currentUser.uid,
                          name: selectedTransaction.merchant_name || selectedTransaction.counterparty_name,
                          merchant_entity_id: selectedTransaction.merchant_entity_id || null,
                          amount,
                          created_at: new Date().toISOString(),
                          account_id: selectedTransaction.account_id || null,
                          logo_url: selectedTransaction.logo_url || null,
                          forecast_type: forecastType,
                          forecast_interval: forecastType === 'every_x_days' ? forecastDayInterval : forecastType === 'monthly' ? 1 : null,
                          auto_extend: forecastType !== 'single' ? autoExtend : false
                        } : {
                          user_id: auth.currentUser.uid,
                          name: standaloneForecastName.trim(),
                          merchant_entity_id: null,
                          amount,
                          created_at: new Date().toISOString(),
                          account_id: null,
                          logo_url: null,
                          forecast_type: forecastType,
                          forecast_interval: forecastType === 'every_x_days' ? forecastDayInterval : forecastType === 'monthly' ? 1 : null,
                          auto_extend: forecastType !== 'single' ? autoExtend : false
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
                        setAddingStandaloneForecast(false);
                        setStandaloneForecastName('');
                        setModalView('details');
                        setForecastDate('');
                        setForecastAmount('');
                        setForecastType('single');
                        setForecastMonths(12);
                        setAutoExtend(false);
                      } catch (error: any) {
                        console.error('Error saving forecast:', error?.code, error?.message, error);
                        setActionError('We couldn’t save this forecast. Please check the details and try again.');
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
                  <h2 id="forecast-dialog-title" style={{ margin: 0 }}>Edit Forecast</h2>
                  <button
                    data-testid="button-close-edit-forecast"
                    aria-label="Close forecast editor"
                    onClick={() => {
                      setEditingForecast(null);
                      setModalView('details');
                      setForecastDate('');
                      setForecastAmount('');
                      setForecastType('single');
                      setForecastMonths(12);
                      setAutoExtend(false);
                    }}
                    style={{
                      background: 'none',
                      border: 'none',
                      fontSize: '20px',
                      cursor: 'pointer',
                      color: '#666',
                      padding: '4px 8px'
                    }}
                  >×</button>
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
                      setActionError(null);
                      try {
                        await updateForecast(editingForecast.id, {
                          date: forecastDate,
                          amount: signedForecastAmount()
                        });
                        const updatedForecasts = await getForecasts(auth.currentUser.uid);
                        setForecasts(updatedForecasts);
                        setEditingForecast(null);
                        setModalView('details');
                        setForecastDate('');
                        setForecastAmount('');
                      } catch (error: any) {
                        console.error('Error updating forecast:', error);
                        setActionError('We couldn’t update this forecast. Please try again.');
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
                        setActionError(null);
                        try {
                          await updateSeriesForecasts(
                            editingForecast.series_id,
                            auth.currentUser.uid,
                            { amount: signedForecastAmount() }
                          );
                          const updatedForecasts = await getForecasts(auth.currentUser.uid);
                          setForecasts(updatedForecasts);
                          setEditingForecast(null);
                          setModalView('details');
                          setForecastDate('');
                          setForecastAmount('');
                        } catch (error: any) {
                          console.error('Error updating series:', error);
                          setActionError('We couldn’t update this forecast series. Please try again.');
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
                    {confirmingDelete && (
                      <div role="alert" style={{ padding: '10px', background: '#fef2f2', color: '#991b1b', borderRadius: '6px', fontSize: '13px' }}>
                        {confirmingDelete === 'series'
                          ? 'This will permanently delete every forecast in this series.'
                          : 'This will permanently delete this forecast.'}
                        <button onClick={() => setConfirmingDelete(null)} style={{ marginLeft: '8px', background: 'transparent', border: 'none', color: '#991b1b', textDecoration: 'underline', cursor: 'pointer' }}>
                          Cancel
                        </button>
                      </div>
                    )}
                    <button
                      data-testid="button-delete-this-forecast"
                      disabled={saving}
                      onClick={async () => {
                        if (!editingForecast?.id || !auth.currentUser) return;
                        if (confirmingDelete !== 'one') {
                          setConfirmingDelete('one');
                          return;
                        }
                        setSaving(true);
                        setActionError(null);
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
                          setAutoExtend(false);
                        } catch (error: any) {
                          console.error('Error deleting forecast:', error);
                          setActionError('We couldn’t delete this forecast. Please try again.');
                        } finally {
                          setSaving(false);
                          setConfirmingDelete(null);
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
                      {saving ? 'Deleting...' : confirmingDelete === 'one' ? 'Confirm Delete This Forecast' : 'Delete This Forecast'}
                    </button>

                    {editingForecast.series_id && (
                      <button
                        data-testid="button-delete-series-forecast"
                        disabled={saving}
                        onClick={async () => {
                          if (!editingForecast?.series_id || !auth.currentUser) return;
                          if (confirmingDelete !== 'series') {
                            setConfirmingDelete('series');
                            return;
                          }
                          setSaving(true);
                          setActionError(null);
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
                            setAutoExtend(false);
                          } catch (error: any) {
                            console.error('Error deleting series:', error);
                            setActionError('We couldn’t delete this forecast series. Please try again.');
                          } finally {
                            setSaving(false);
                            setConfirmingDelete(null);
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
                        {saving ? 'Deleting...' : confirmingDelete === 'series' ? 'Confirm Delete Entire Series' : 'Delete Entire Series'}
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
                      setAutoExtend(false);
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
