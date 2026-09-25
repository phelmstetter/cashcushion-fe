import { useState, useEffect, useLayoutEffect, useRef, useMemo, useCallback, lazy, Suspense } from "react";
import { signOut } from "firebase/auth";
import { auth, getTransactions, Transaction, saveForecast, saveSeriesForecasts, saveDayIntervalForecasts, updateForecast, updateSeriesForecasts, deleteForecast, deleteSeriesForecasts, getForecasts, Forecast, reconcileForecast, unreconcileForecast, getAccounts, Account } from "@/lib/firebase";
import {
  buildActivityItems,
  getForecastBalances,
  getMatchedTransactionIds,
  getTransactionBalances,
  getVisibleForecasts,
  type ActivityItem,
} from "@/lib/activityBalances";
import { getDashboardContentPadding } from "@/lib/dashboardLayout";
import { sharedStyles, ui } from "@/lib/uiTheme";
import { useLocation } from "wouter";
import { Info, Trash2 } from "lucide-react";

const LONG_PRESS_MS = 500;
const CHART_WINDOW_MIN = 33;
const getManualMatchErrorMessage = (error: unknown) => {
  const code = typeof error === 'object' && error !== null && 'code' in error
    ? error.code
    : undefined;
  if (typeof code === 'string' && (code === 'permission-denied' || code.endsWith('/permission-denied'))) {
    return 'Matching was rejected. Confirm you own the transaction and that it’s from the same account as the forecast.';
  }
  return 'We couldn’t match that forecast. Please try again.';
};
const forecastFieldLabelStyle = {
  color: ui.color.textMuted,
  fontFamily: 'inherit',
  fontSize: '15px',
  fontWeight: 600,
  lineHeight: '20px',
} as const;
const forecastControlTextStyle = {
  fontFamily: 'inherit',
  fontSize: '15px',
  lineHeight: '20px',
} as const;
const ProjectionChart = lazy(() => import("@/components/ProjectionChart"));

function ProjectionChartLoading() {
  return (
    <div
      data-testid="chart-container"
      role="status"
      aria-live="polite"
      aria-busy="true"
      style={{
         height: `${CHART_WINDOW_MIN}vh`,
         ...sharedStyles.card,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
         color: ui.color.textMuted,
        fontSize: '14px'
      }}
    >
      Loading projection chart…
    </div>
  );
}

type InfoHintProps = {
  active: boolean;
  label: string;
  onToggle: () => void;
  testId: string;
  text: string;
};

function InfoHint({ active, label, onToggle, testId, text }: InfoHintProps) {
  return (
    <span style={{ display: 'inline-flex', position: 'relative' }}>
      <button
        type="button"
        data-testid={testId}
        aria-label={label}
        aria-expanded={active}
        onClick={onToggle}
        style={{
          alignItems: 'center',
          background: 'none',
          border: 'none',
          color: ui.color.textMuted,
          cursor: 'pointer',
          display: 'inline-flex',
          justifyContent: 'center',
          padding: 0
        }}
      >
        <Info size={16} strokeWidth={2} aria-hidden="true" />
      </button>
      {active && (
        <span
          role="tooltip"
          style={{
            backgroundColor: ui.color.text,
            borderRadius: ui.radius.control,
            boxShadow: ui.shadow.raised,
            color: ui.color.surface,
            fontSize: '12px',
            fontWeight: 400,
            left: '50%',
            lineHeight: 1.4,
            padding: '8px 10px',
            position: 'absolute',
            textAlign: 'left',
            top: 'calc(100% + 8px)',
            transform: 'translateX(-50%)',
            width: '230px',
            zIndex: 20
          }}
        >
          {text}
        </span>
      )}
    </span>
  );
}

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
  const [autoExtend, setAutoExtend] = useState(true);
  const [activeInfoTip, setActiveInfoTip] = useState<'autoExtend' | 'cashFlow' | null>(null);
  const [saving, setSaving] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState<'one' | 'series' | null>(null);
  const [seriesActionPrompt, setSeriesActionPrompt] = useState<'save' | 'delete' | null>(null);
  const [editingForecast, setEditingForecast] = useState<Forecast | null>(null);
  const [addingStandaloneForecast, setAddingStandaloneForecast] = useState(false);
  const [standaloneForecastName, setStandaloneForecastName] = useState('');
  const [standaloneForecastAccountId, setStandaloneForecastAccountId] = useState('');
  const [companyFilter, setCompanyFilter] = useState('');
  const [includedAccountIds, setIncludedAccountIds] = useState<string[]>([]);
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const [activeChartDate, setActiveChartDate] = useState<string | null>(null);
  const [chartNavigationTarget, setChartNavigationTarget] = useState<{ date: string; requestId: number } | null>(null);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [forecasts, setForecasts] = useState<Forecast[]>([]);
  const [draggingForecast, setDraggingForecast] = useState<Forecast | null>(null);
  const [dragPos, setDragPos] = useState<{ x: number; y: number } | null>(null);
  const [dropTargetId, setDropTargetId] = useState<string | null>(null);
  const cursorRef = useRef<{ date: string; id: string } | null>(null);
  const loadingRef = useRef(false);
  const observerRef = useRef<IntersectionObserver | null>(null);
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const activityDateRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const orderedActivityDateHeadersRef = useRef<Array<{ date: string; element: HTMLDivElement }>>([]);
  const chartNavigationRequestRef = useRef(0);
  const chartNavigationInProgressRef = useRef<number | null>(null);
  const accountSelectionInitializedRef = useRef(false);
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const transactionRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const dragStartPosRef = useRef<{ x: number; y: number } | null>(null);
  const scrollAnchorRef = useRef<HTMLDivElement | null>(null);
  const hasAutoScrolled = useRef(false);
  const chartHeaderRef = useRef<HTMLDivElement | null>(null);
  const profileMenuButtonRef = useRef<HTMLButtonElement | null>(null);
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const [fixedHeaderBottom, setFixedHeaderBottom] = useState(0);

  const closeModal = useCallback(() => {
    setSelectedTransaction(null);
    setEditingForecast(null);
    setAddingStandaloneForecast(false);
    setStandaloneForecastName('');
    setStandaloneForecastAccountId('');
    setModalView('details');
    setForecastDate('');
    setForecastAmount('');
    setForecastType('single');
    setForecastDirection('expense');
    setForecastMonths(12);
    setAutoExtend(true);
    setActiveInfoTip(null);
    setActionError(null);
    setConfirmingDelete(null);
    setSeriesActionPrompt(null);
  }, []);

  const openStandaloneForecast = (date = '') => {
    setAddingStandaloneForecast(true);
    setStandaloneForecastName('');
    setStandaloneForecastAccountId('');
    setForecastDate(date);
    setForecastAmount('');
    setForecastType('single');
    setForecastDirection('expense');
    setAutoExtend(true);
    setActiveInfoTip(null);
    setModalView('forecast');
  };

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

  useLayoutEffect(() => {
    const header = chartHeaderRef.current;
    if (!header) return;

    const updateHeaderOffset = () => {
      const nextBottom = Math.ceil(header.getBoundingClientRect().bottom);
      setFixedHeaderBottom((currentBottom) => currentBottom === nextBottom ? currentBottom : nextBottom);
    };

    updateHeaderOffset();
    window.addEventListener('resize', updateHeaderOffset);

    const resizeObserver = typeof ResizeObserver === 'undefined'
      ? null
      : new ResizeObserver(updateHeaderOffset);
    resizeObserver?.observe(header);

    return () => {
      window.removeEventListener('resize', updateHeaderOffset);
      resizeObserver?.disconnect();
    };
  }, []);

  const handleSignOut = async () => {
    await signOut(auth);
    setLocation("/login");
  };

  const toggleAccountInclusion = (accountId: string) => {
    setIncludedAccountIds((currentIds) => (
      currentIds.includes(accountId)
        ? currentIds.filter((id) => id !== accountId)
        : [...currentIds, accountId]
    ));
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

  const loadMoreTransactions = async (): Promise<boolean> => {
    if (loadingRef.current || !hasMoreRef.current) return false;
    
    const userId = auth.currentUser?.uid;
    if (!userId) return false;
    
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
        return true;
      } else {
        hasMoreRef.current = false;
        setHasMore(false);
        return false;
      }
    } catch (error) {
      console.error("Error loading more:", error);
      setPaginationError('We couldn’t load older transactions. Try again.');
      return false;
    } finally {
      loadingRef.current = false;
      setLoading(false);
      setTimeout(() => reobserveSentinel(), 100);
    }
  };

  const handleChartDateSelect = async (date: string) => {
    const requestId = ++chartNavigationRequestRef.current;
    chartNavigationInProgressRef.current = requestId;
    setActiveChartDate(date);

    while (
      hasMoreRef.current &&
      cursorRef.current?.date &&
      cursorRef.current.date > date
    ) {
      const cursorBeforeLoad = `${cursorRef.current.date}:${cursorRef.current.id}`;
      const loadedMore = await loadMoreTransactions();
      if (
        !loadedMore ||
        requestId !== chartNavigationRequestRef.current ||
        `${cursorRef.current?.date}:${cursorRef.current?.id}` === cursorBeforeLoad
      ) {
        break;
      }
    }

    if (requestId === chartNavigationRequestRef.current) {
      setChartNavigationTarget({ date, requestId });
    } else if (chartNavigationInProgressRef.current === requestId) {
      chartNavigationInProgressRef.current = null;
    }
  };

  useEffect(() => {
    loadInitialTransactions();
  }, []);

  useEffect(() => {
    if (accountSelectionInitializedRef.current || accounts.length === 0) return;

    accountSelectionInitializedRef.current = true;
    setIncludedAccountIds(accounts.map((account) => account.account_id));
  }, [accounts]);

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

  const matchForecastToTransaction = useCallback(async (
    forecastId: string,
    transactionId: string
  ) => {
    await reconcileForecast(forecastId, transactionId);
    setForecasts((current) => current.map((forecast) =>
      forecast.id === forecastId
        ? { ...forecast, matched_transaction_id: transactionId }
        : forecast
    ));
  }, []);

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
          await matchForecastToTransaction(draggingForecast.id, target);
        } catch (error: any) {
          console.error('Error reconciling forecast:', error);
          setActionError(getManualMatchErrorMessage(error));
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
  }, [draggingForecast, matchForecastToTransaction]);

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

  const formatCurrency = (amount: number) => new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);

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

  const formatForecastInputAmount = (value: string) => {
    if (!value) return '';
    const normalized = value.replace(/,/g, '');
    const [integerPart, decimalPart] = normalized.split('.');
    const groupedInteger = (integerPart || '0').replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    return decimalPart === undefined ? groupedInteger : `${groupedInteger}.${decimalPart}`;
  };

  const resetEditingForecast = () => {
    setEditingForecast(null);
    setModalView('details');
    setForecastDate('');
    setForecastAmount('');
    setForecastType('single');
    setForecastMonths(12);
    setAutoExtend(true);
    setConfirmingDelete(null);
    setSeriesActionPrompt(null);
  };

  const saveEditedForecast = async (scope: 'individual' | 'series') => {
    if (!editingForecast?.id || !auth.currentUser) return;
    if (scope === 'series' && !editingForecast.series_id) return;

    setSaving(true);
    setActionError(null);
    try {
      if (scope === 'series' && editingForecast.series_id) {
        await updateSeriesForecasts(
          editingForecast.series_id,
          auth.currentUser.uid,
          { amount: signedForecastAmount() }
        );
      } else {
        await updateForecast(editingForecast.id, {
          date: forecastDate,
          amount: signedForecastAmount()
        });
      }
      const updatedForecasts = await getForecasts(auth.currentUser.uid);
      setForecasts(updatedForecasts);
      resetEditingForecast();
    } catch (error: any) {
      console.error(`Error updating ${scope === 'series' ? 'series' : 'forecast'}:`, error);
      setActionError(
        scope === 'series'
          ? 'We couldn’t update this forecast series. Please try again.'
          : 'We couldn’t update this forecast. Please try again.'
      );
    } finally {
      setSaving(false);
      setSeriesActionPrompt(null);
    }
  };

  const deleteEditedForecast = async (scope: 'individual' | 'series') => {
    if (!editingForecast?.id || !auth.currentUser) return;
    if (scope === 'series' && !editingForecast.series_id) return;

    setSaving(true);
    setActionError(null);
    try {
      if (scope === 'series' && editingForecast.series_id) {
        await deleteSeriesForecasts(editingForecast.series_id, auth.currentUser.uid);
      } else {
        await deleteForecast(editingForecast.id);
      }
      const updatedForecasts = await getForecasts(auth.currentUser.uid);
      setForecasts(updatedForecasts);
      resetEditingForecast();
    } catch (error: any) {
      console.error(`Error deleting ${scope === 'series' ? 'series' : 'forecast'}:`, error);
      setActionError(
        scope === 'series'
          ? 'We couldn’t delete this forecast series. Please try again.'
          : 'We couldn’t delete this forecast. Please try again.'
      );
    } finally {
      setSaving(false);
      setConfirmingDelete(null);
      setSeriesActionPrompt(null);
    }
  };

  const handleDeleteEditedForecast = () => {
    if (saving || !editingForecast) return;
    if (confirmingDelete) return;
    if (editingForecast.series_id) {
      setSeriesActionPrompt('delete');
    } else {
      setConfirmingDelete('one');
    }
  };

  const visibleForecasts = useMemo(
    () => getVisibleForecasts(forecasts),
    [forecasts]
  );

  const companyNames = useMemo(() => Array.from(new Set([
    ...transactions.map(t => t.merchant_name || t.counterparty_name),
    ...visibleForecasts.map(f => f.name)
  ])).filter((name): name is string => Boolean(name)).sort((a, b) => a.localeCompare(b)), [transactions, visibleForecasts]);

  const accountOptions = useMemo(() => Array.from(
    new Map(
      accounts
        .filter((account) => account.account_id)
        .map((account) => [
          account.account_id,
          {
            label: account.name ? `${account.name} ${account.mask}` : account.mask,
            value: account.account_id,
          },
        ])
    ).values()
  ), [accounts]);

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
      forecastsByAccount[f.account_id][dateStr] -= f.amount;
    }

    const data: Record<string, string | number | null>[] = [];
    const currentBalances: Record<string, number | null> = {};
    for (const acct of accounts) {
      currentBalances[acct.account_id] = acct.available_balance ?? null;
    }

    const d = new Date(today);
    while (d <= endDate) {
      const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      const displayDate = `${d.getMonth() + 1}/${d.getDate()}`;

      for (const acct of accounts) {
        const dayForecast = forecastsByAccount[acct.account_id]?.[dateStr] || 0;
        const currentBalance = currentBalances[acct.account_id];
        if (currentBalance != null && dayForecast !== 0) {
          currentBalances[acct.account_id] = currentBalance + dayForecast;
        }
      }

      const point: Record<string, string | number | null> = { date: displayDate, fullDate: dateStr };
      for (const acct of accounts) {
        const balance = currentBalances[acct.account_id];
        point[acct.account_id] = balance == null
          ? null
          : Math.round(balance * 100) / 100;
      }
      data.push(point);

      d.setDate(d.getDate() + 1);
    }

    return data;
  }, [accounts, visibleForecasts]);

  const chartDateSet = useMemo(
    () => new Set(chartData.map((point) => point.fullDate).filter((date): date is string => typeof date === 'string')),
    [chartData]
  );

  const allActivityItems = useMemo<ActivityItem[]>(
    () => buildActivityItems(transactions, forecasts),
    [transactions, forecasts]
  );

  const mergedItems = useMemo(
    () => allActivityItems.filter((item) => {
      const accountId = item.data.account_id;
      if (
        accountSelectionInitializedRef.current &&
        accountId &&
        !includedAccountIds.includes(accountId)
      ) {
        return false;
      }
      if (!companyFilter) return true;
      if (item.type === 'forecast') {
        return item.data.name === companyFilter;
      }
      return (item.data.merchant_name || item.data.counterparty_name) === companyFilter;
    }),
    [allActivityItems, includedAccountIds, companyFilter]
  );

  const activityDates = useMemo(
    () => Array.from(new Set(mergedItems.map((item) => item.data.date))),
    [mergedItems]
  );

  useLayoutEffect(() => {
    const headers = Array.from(activityDateRefs.current.entries()).map(([key, element]) => ({
      date: key.slice(key.indexOf(':') + 1),
      element,
    }));

    headers.sort((first, second) => {
      if (first.element === second.element) return 0;
      return first.element.compareDocumentPosition(second.element) & Node.DOCUMENT_POSITION_FOLLOWING
        ? -1
        : 1;
    });

    orderedActivityDateHeadersRef.current = headers;
  }, [activityDates]);

  const matchedTransactionIds = useMemo(
    () => getMatchedTransactionIds(forecasts),
    [forecasts]
  );

  const transactionBalances = useMemo(
    () => getTransactionBalances(accounts, allActivityItems),
    [accounts, allActivityItems]
  );

  const forecastBalances = useMemo(() => {
    const chartPointsByDate = new Map(
      chartData.map((point) => [point.fullDate as string, point])
    );
    return getForecastBalances(allActivityItems, (forecast) => {
      if (!forecast.account_id) return null;
      const chartPoint = chartPointsByDate.get(forecast.date);
      const endingBalance = chartPoint?.[forecast.account_id];
      return typeof endingBalance === 'number' && Number.isFinite(endingBalance)
        ? endingBalance
        : null;
    });
  }, [chartData, allActivityItems]);

  const scrollAnchorIndex = useMemo(() => {
    const firstTxIndex = mergedItems.findIndex(item => item.type === 'transaction');
    if (firstTxIndex <= 0) return 0;
    return Math.max(0, firstTxIndex - 3);
  }, [mergedItems]);

  const forecastDividerIndex = useMemo(() => {
    const firstTxIndex = mergedItems.findIndex(item => item.type === 'transaction');
    return firstTxIndex > 0 ? firstTxIndex : -1;
  }, [mergedItems]);

  useEffect(() => {
    let frame: number | null = null;

    const syncChartCursorToActivity = () => {
      frame = null;
      if (chartNavigationInProgressRef.current !== null) return;

      const chartContentTop = getDashboardContentPadding(fixedHeaderBottom);
      const dateHeaders = orderedActivityDateHeadersRef.current;

      if (dateHeaders.length === 0) {
        setActiveChartDate((currentDate) => currentDate === null ? currentDate : null);
        return;
      }

      let lowerBound = 0;
      let upperBound = dateHeaders.length - 1;
      let lastHeaderBeforeContent = -1;

      while (lowerBound <= upperBound) {
        const midpoint = Math.floor((lowerBound + upperBound) / 2);
        const headerTop = dateHeaders[midpoint].element.getBoundingClientRect().top;

        if (headerTop <= chartContentTop) {
          lastHeaderBeforeContent = midpoint;
          lowerBound = midpoint + 1;
        } else {
          upperBound = midpoint - 1;
        }
      }

      const activeHeader = dateHeaders[Math.max(0, lastHeaderBeforeContent)];
      const nextDate = chartDateSet.has(activeHeader.date) ? activeHeader.date : null;

      setActiveChartDate((currentDate) => currentDate === nextDate ? currentDate : nextDate);
    };

    const scheduleSync = () => {
      if (frame != null) return;
      frame = requestAnimationFrame(syncChartCursorToActivity);
    };

    scheduleSync();
    window.addEventListener('scroll', scheduleSync, { passive: true });

    return () => {
      window.removeEventListener('scroll', scheduleSync);
      if (frame != null) cancelAnimationFrame(frame);
    };
  }, [activityDates, chartDateSet, fixedHeaderBottom]);

  useEffect(() => {
    if (!initialLoading && !hasAutoScrolled.current && scrollAnchorRef.current && fixedHeaderBottom > 0) {
      hasAutoScrolled.current = true;
      requestAnimationFrame(() => {
        if (!scrollAnchorRef.current) return;
        const rect = scrollAnchorRef.current.getBoundingClientRect();
        const scrollTarget = window.scrollY + rect.top - getDashboardContentPadding(fixedHeaderBottom);
        window.scrollTo({ top: Math.max(0, scrollTarget), behavior: 'auto' });
      });
    }
  }, [fixedHeaderBottom, initialLoading, mergedItems.length]);

  useEffect(() => {
    if (!chartNavigationTarget) return;

    if (activityDates.length === 0) {
      if (chartNavigationInProgressRef.current === chartNavigationTarget.requestId) {
        chartNavigationInProgressRef.current = null;
      }
      setChartNavigationTarget(null);
      return;
    }

    const selectedTimestamp = new Date(`${chartNavigationTarget.date}T00:00:00`).getTime();
    const destinationDate = activityDates.reduce((closestDate, candidateDate) => {
      const closestDistance = Math.abs(new Date(`${closestDate}T00:00:00`).getTime() - selectedTimestamp);
      const candidateDistance = Math.abs(new Date(`${candidateDate}T00:00:00`).getTime() - selectedTimestamp);
      return candidateDistance < closestDistance ? candidateDate : closestDate;
    });

    let fallbackTimer: number | null = null;
    let finishNavigation: (() => void) | null = null;
    const frame = requestAnimationFrame(() => {
      const destination = activityDateRefs.current.get(`transaction:${destinationDate}`)
        ?? activityDateRefs.current.get(`forecast:${destinationDate}`);
      if (!destination) {
        if (chartNavigationInProgressRef.current === chartNavigationTarget.requestId) {
          chartNavigationInProgressRef.current = null;
        }
        setChartNavigationTarget((target) =>
          target?.requestId === chartNavigationTarget.requestId ? null : target
        );
        return;
      }

      const rect = destination.getBoundingClientRect();
      const scrollTarget = window.scrollY + rect.top - getDashboardContentPadding(fixedHeaderBottom);
      window.scrollTo({ top: Math.max(0, scrollTarget), behavior: 'smooth' });

      finishNavigation = () => {
        if (chartNavigationInProgressRef.current !== chartNavigationTarget.requestId) return;
        chartNavigationInProgressRef.current = null;
        setActiveChartDate(chartDateSet.has(destinationDate) ? destinationDate : null);
        setChartNavigationTarget((target) =>
          target?.requestId === chartNavigationTarget.requestId ? null : target
        );
      };
      fallbackTimer = window.setTimeout(finishNavigation, 1200);
      window.addEventListener('scrollend', finishNavigation, { once: true });
    });

    return () => {
      cancelAnimationFrame(frame);
      if (fallbackTimer !== null) window.clearTimeout(fallbackTimer);
      if (finishNavigation) window.removeEventListener('scrollend', finishNavigation);
    };
  }, [activityDates, chartDateSet, chartNavigationTarget, fixedHeaderBottom]);

  const currentUser = auth.currentUser;

  return (
    <div style={{ maxWidth: '600px', margin: '0 auto', paddingTop: fixedHeaderBottom > 0 ? `${getDashboardContentPadding(fixedHeaderBottom)}px` : 'calc(56px + 33svh + 6px)', paddingLeft: '2px', paddingRight: '2px', paddingBottom: '2px' }}>
      <div style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        backgroundColor: ui.color.surface,
        zIndex: 999,
        borderBottom: `1px solid ${ui.color.border}`,
        boxShadow: ui.shadow.card
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
          <h1 style={{ color: ui.color.text, fontSize: '20px', fontWeight: 800, letterSpacing: '-0.03em', margin: 0, whiteSpace: 'nowrap' }}>CashCushion</h1>
          <select
            data-testid="select-company-filter"
            value={companyFilter}
            onChange={(e) => setCompanyFilter(e.target.value)}
            style={{
              flex: 1,
              minWidth: '0',
              padding: '6px 8px',
              fontSize: '13px',
              ...sharedStyles.input,
              borderRadius: ui.radius.control,
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
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke={ui.color.textMuted} strokeWidth="2" strokeLinecap="round">
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
                  ...sharedStyles.card,
                  borderRadius: ui.radius.control,
                  boxShadow: ui.shadow.raised,
                  zIndex: 1001,
                  minWidth: '200px',
                  overflow: 'hidden'
                }}>
                  <div style={{ padding: '12px 14px', borderBottom: `1px solid ${ui.color.border}`, display: 'flex', alignItems: 'center', gap: '10px' }}>
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
                        backgroundColor: ui.color.surfaceMuted,
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
                      <span style={{ fontSize: '12px', color: ui.color.textMuted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
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
                        backgroundColor: ui.color.surface,
                        border: 'none',
                        cursor: 'pointer',
                        color: item.disabled ? ui.color.textDisabled : ui.color.text
                      }}
                      onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = ui.color.surfaceMuted)}
                      onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = ui.color.surface)}
                    >
                      {item.label}
                    </button>
                  ))}
                  <div style={{ borderTop: `1px solid ${ui.color.border}` }} />
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
                      backgroundColor: ui.color.surface,
                      border: 'none',
                      cursor: 'pointer',
                      color: ui.color.danger
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = ui.color.dangerSoft)}
                    onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = ui.color.surface)}
                  >
                    Sign Out
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      <div ref={chartHeaderRef} style={{
        position: 'fixed',
        top: '44px',
        left: 0,
        right: 0,
        zIndex: 998,
        backgroundColor: ui.color.canvas,
        borderBottom: `1px solid ${ui.color.border}`,
        boxShadow: ui.shadow.raised,
      }}>
        <div style={{ maxWidth: '600px', margin: '0 auto', padding: '2px 2px 6px' }}>
          <Suspense fallback={<ProjectionChartLoading />}>
            <ProjectionChart
              chartData={chartData}
              accounts={accounts}
              includedAccountIds={accountSelectionInitializedRef.current
                ? includedAccountIds
                : accounts.map((account) => account.account_id)}
              activeDate={activeChartDate}
              formatDate={formatDate}
               windowHeight={CHART_WINDOW_MIN}
              onDateHover={(date) => {
                setActiveChartDate((currentDate) => currentDate === date ? currentDate : date);
              }}
              onDateSelect={handleChartDateSelect}
              onAccountToggle={toggleAccountInclusion}
            />
           </Suspense>
        </div>
      </div>

      {initialLoading ? (
        <div aria-busy="true" style={{ padding: '24px 12px', color: ui.color.textMuted, textAlign: 'center' }}>
          Loading your transactions and forecasts…
        </div>
      ) : initialError && mergedItems.length === 0 ? (
        <div role="alert" style={{ ...sharedStyles.alertWarning, margin: '16px 8px', padding: '16px', textAlign: 'center' }}>
          <p style={{ margin: '0 0 10px' }}>{initialError}</p>
          <button onClick={loadInitialTransactions} style={{ padding: '7px 12px', border: `1px solid ${ui.color.warning}`, borderRadius: ui.radius.small, background: ui.color.surface, color: ui.color.warning, cursor: 'pointer' }}>
            Retry dashboard load
          </button>
        </div>
      ) : mergedItems.length === 0 ? (
        <div style={{ padding: '32px 18px', textAlign: 'center', color: ui.color.textMuted }}>
          <p style={{ margin: '0 0 8px', fontWeight: 600 }}>No transactions to show yet.</p>
          <p style={{ margin: 0, fontSize: '14px' }}>Link an account or try refreshing after your bank has synced.</p>
        </div>
      ) : (
        <>
          {initialError && (
            <div role="alert" style={{ ...sharedStyles.alertWarning, margin: '8px', padding: '12px', fontSize: '14px' }}>
              <div>{initialError}</div>
              <button onClick={loadInitialTransactions} style={{ marginTop: '8px', padding: '6px 10px', border: `1px solid ${ui.color.warning}`, borderRadius: ui.radius.small, background: ui.color.surface, color: ui.color.warning, cursor: 'pointer' }}>
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
            const canOpenTransactionDetails = !isForecast && Boolean(transactionForModal);
            const openTransactionDetails = () => {
              if (!transactionForModal) return;
              setSelectedTransaction(transactionForModal);
              setModalView('details');
            };

            const isMatched = !isForecast && matchedTransactionIds.has((item.data as Transaction).id);
            const isForecasted = !isForecast && !isMatched && (() => {
              const tx = item.data as Transaction;
              const merchantId = tx.merchant_entity_id;
              const txName = tx.merchant_name || tx.counterparty_name;
              return visibleForecasts.some(f =>
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
            const transactionBalance = !isForecast
              ? transactionBalances.get((item.data as Transaction).id) ?? null
              : null;
            const forecastId = isForecast ? (item.data as Forecast).id : undefined;
            const forecastBalance = isForecast
              ? (forecastId ? forecastBalances.get(forecastId) ?? null : null)
              : null;
            const previousItem = mergedItems[idx - 1];
            const showDateHeader = (
              !previousItem ||
              previousItem.type !== item.type ||
              previousItem.data.date !== date
            );

            return (
              <div
                key={itemKey}
              >
                {idx === forecastDividerIndex && (
                  <div
                    role="separator"
                    aria-label="Forecasts begin above"
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      margin: '12px 4px 6px',
                      color: ui.color.textMuted,
                      fontSize: '10px',
                      fontWeight: 600,
                      letterSpacing: '0.08em'
                    }}
                  >
                    <span style={{ height: '1px', backgroundColor: ui.color.border, flex: 1 }} />
                    ↑ ↑ FORECAST ↑ ↑
                    <span style={{ height: '1px', backgroundColor: ui.color.border, flex: 1 }} />
                  </div>
                )}
                {showDateHeader && (
                  <div
                    aria-label={`${isForecast ? 'Forecasts' : 'Transactions'} on ${formatDate(date)}`}
                    ref={(element) => {
                      const key = `${isForecast ? 'forecast' : 'transaction'}:${date}`;
                      if (element) {
                        activityDateRefs.current.set(key, element);
                      } else {
                        activityDateRefs.current.delete(key);
                      }
                    }}
                    style={{
                      backgroundColor: ui.color.surfaceMuted,
                      color: ui.color.textMuted,
                      display: 'flex',
                      fontSize: '12px',
                      fontWeight: 600,
                      justifyContent: 'space-between',
                      letterSpacing: '0.02em',
                      margin: '8px -2px 4px',
                      padding: '6px 10px',
                    }}
                  >
                    <time dateTime={date}>{formatDate(date)}</time>
                    {isForecast && (
                      <button
                        data-testid={`button-add-forecast-${date}`}
                        onClick={() => openStandaloneForecast(date)}
                        style={{
                          background: 'transparent',
                          border: 'none',
                          color: ui.color.primary,
                          cursor: 'pointer',
                          fontSize: '12px',
                          fontWeight: 600,
                          padding: 0,
                        }}
                      >
                        + Forecast
                      </button>
                    )}
                  </div>
                )}
                <div
                ref={(el) => {
                  if (idx === scrollAnchorIndex && el) {
                    scrollAnchorRef.current = el;
                  }
                  if (!isForecast && el) {
                    transactionRefs.current.set((item.data as Transaction).id, el);
                  } else if (!isForecast) {
                    transactionRefs.current.delete((item.data as Transaction).id);
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
                    await matchForecastToTransaction(forecastId, transactionId);
                  } catch (error) {
                    console.error('Error reconciling forecast:', error);
                    setActionError(getManualMatchErrorMessage(error));
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
                onClick={
                  isForecast && !draggingForecast
                    ? () => {
                      const fc = item.data as Forecast;
                      setEditingForecast(fc);
                      setConfirmingDelete(null);
                      setSeriesActionPrompt(null);
                      setForecastDate(fc.date);
                      setForecastAmount(Math.abs(fc.amount).toString());
                      setForecastDirection(fc.amount >= 0 ? 'expense' : 'income');
                      setModalView('editForecast');
                    }
                    : canOpenTransactionDetails
                      ? openTransactionDetails
                      : undefined
                }
                role={isForecast || canOpenTransactionDetails ? 'button' : undefined}
                tabIndex={isForecast || canOpenTransactionDetails ? 0 : undefined}
                aria-label={
                  isForecast
                    ? `Edit ${displayName} ${amountDisplay} forecast`
                    : canOpenTransactionDetails
                      ? `View details for ${displayName}`
                      : undefined
                }
                onKeyDown={
                  isForecast
                    ? (event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        const fc = item.data as Forecast;
                        setEditingForecast(fc);
                        setConfirmingDelete(null);
                        setSeriesActionPrompt(null);
                        setForecastDate(fc.date);
                        setForecastAmount(Math.abs(fc.amount).toString());
                        setForecastDirection(fc.amount >= 0 ? 'expense' : 'income');
                        setModalView('editForecast');
                      }
                    }
                    : canOpenTransactionDetails
                      ? (event) => {
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault();
                          openTransactionDetails();
                        }
                      }
                      : undefined
                }
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px',
                  minHeight: '68px',
                  boxSizing: 'border-box',
                  padding: '8px',
                  marginBottom: '2px',
                  backgroundColor: isDropTarget ? ui.color.primarySoft : isForecast ? ui.color.surfaceForecast : ui.color.surface,
                  borderRadius: ui.radius.card,
                  boxShadow: isDropTarget ? `0 0 0 3px ${ui.color.primary}` : ui.shadow.card,
                  border: `1px solid ${ui.color.border}`,
                  borderLeft: isForecast ? `1px solid ${ui.color.primarySoft}` : (isMatched ? `4px solid ${ui.color.success}` : isForecasted ? `4px solid ${ui.color.info}` : `4px solid ${ui.color.warning}`),
                  opacity: isDragging ? 0.4 : 1,
                  cursor: isForecast ? 'grab' : canOpenTransactionDetails ? 'pointer' : 'default',
                  userSelect: 'none',
                  transition: 'background-color 0.15s, box-shadow 0.15s',
                  touchAction: draggingForecast ? 'none' : 'auto'
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
                      backgroundColor: ui.color.surfaceMuted,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '14px',
                      fontWeight: 'bold'
                    }}>
                      {getInitials(displayName)}
                    </div>
                  )
                ) : transactionForModal ? (
                  logoUrl ? (
                    <img
                      data-testid={`transaction-icon-${(item.data as Transaction).id}`}
                      src={logoUrl}
                      alt={displayName}
                      style={{ width: '40px', height: '40px', borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }}
                    />
                  ) : (
                    <div
                      data-testid={`transaction-icon-${(item.data as Transaction).id}`}
                      style={{
                        width: '40px',
                        height: '40px',
                        borderRadius: '50%',
                        backgroundColor: ui.color.surfaceMuted,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: '14px',
                        fontWeight: 'bold',
                        flexShrink: 0
                      }}
                    >
                      {getInitials(displayName)}
                    </div>
                  )
                ) : null}
                
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
                  {isMatched && (
                    <span
                      className="sr-only"
                      data-testid={`transaction-matched-${(item.data as Transaction).id}`}
                      role="status"
                    >
                      Transaction matched
                    </span>
                  )}
                </div>
                
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontWeight: 700, color: isForecast ? ui.color.primary : (isPositive ? ui.color.success : ui.color.danger) }}>
                    {amountDisplay}
                  </div>
                  <div style={{ fontSize: '12px', color: ui.color.textMuted }}>
                    {isForecast
                      ? (forecastBalance != null
                        ? <span aria-label={`Projected balance on ${formatDate(date)}: ${formatCurrency(forecastBalance)}`}>{formatCurrency(forecastBalance)}</span>
                        : <span aria-label="Projected balance unavailable">—</span>)
                      : (transactionBalance != null
                        ? <span aria-label={`Balance after transaction: ${formatCurrency(transactionBalance)}`}>{formatCurrency(transactionBalance)}</span>
                        : <span aria-label="Balance unavailable">—</span>)}
                  </div>
                </div>
                
              </div>
              </div>
            );
          })}
          
          <div ref={sentinelRef} style={{ textAlign: 'center', padding: '20px' }}>
            {loading && <p aria-live="polite">Loading older transactions…</p>}
            {paginationError && (
              <div role="alert" style={{ color: ui.color.danger }}>
                <p>{paginationError}</p>
                <button onClick={loadMoreTransactions} style={{ padding: '6px 10px', border: `1px solid ${ui.color.danger}`, borderRadius: ui.radius.small, background: ui.color.surface, color: ui.color.danger, cursor: 'pointer' }}>
                  Try again
                </button>
              </div>
            )}
            {!hasMore && <p style={{ color: ui.color.textMuted }}>No more transactions</p>}
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
          backgroundColor: ui.color.primary,
          color: ui.color.surface,
          borderRadius: ui.radius.control,
          boxShadow: ui.shadow.raised,
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
          backgroundColor: ui.color.overlay,
          display: 'flex',
           alignItems: 'flex-start',
          justifyContent: 'center',
           overflowY: 'auto',
           padding: '12px 0',
           zIndex: 1000,
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
              ...sharedStyles.card,
              borderRadius: ui.radius.modal,
              boxShadow: ui.shadow.modal,
             boxSizing: 'border-box',
             margin: 'auto 0',
             maxWidth: '640px',
             padding: '20px',
             width: 'calc(100% - 24px)',
          }}>
            {actionError && (
              <div role="alert" style={{ ...sharedStyles.alertError, marginBottom: '16px', padding: '10px 12px', fontSize: '14px' }}>
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
                       backgroundColor: ui.color.surfaceSelected,
                        border: `1px solid ${ui.color.primarySoft}`,
                        borderRadius: ui.radius.card,
                      display: 'flex',
                      alignItems: 'center',
                      gap: '12px',
                       marginBottom: '14px',
                       padding: '14px',
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
                          backgroundColor: ui.color.surfaceMuted,
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
                          color: ui.color.text,
                          margin: 0,
                          fontSize: '18px',
                          fontWeight: 700,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap'
                        }}>
                          {transactionName}
                        </h2>
                        {selectedTransaction.merchant_name && selectedTransaction.counterparty_name && selectedTransaction.merchant_name !== selectedTransaction.counterparty_name && (
                          <div style={{ fontSize: '13px', color: ui.color.textMuted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {selectedTransaction.counterparty_name}
                          </div>
                        )}
                      </div>
                      <div style={{ textAlign: 'right', flexShrink: 0 }}>
                        <div style={{ fontWeight: 700, color: isPositive ? ui.color.success : ui.color.danger }}>
                          {transactionAmount}
                        </div>
                        <div style={{ fontSize: '14px', color: ui.color.textMuted }}>
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
                          color: ui.color.textMuted,
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
                    setAutoExtend(true);
                    setActiveInfoTip(null);
                    setModalView('forecast');
                  }}
                  style={{
                    width: '100%',
                    padding: '11px 14px',
                    background: ui.color.primary,
                    color: ui.color.surface,
                    border: 'none',
                    borderRadius: ui.radius.control,
                    boxShadow: ui.shadow.card,
                    cursor: 'pointer',
                    fontWeight: 700,
                    fontSize: '14px',
                    marginBottom: '14px'
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
                          <span style={forecastFieldLabelStyle}>Account</span>
                          <span style={{ ...forecastControlTextStyle, color: ui.color.text, fontWeight: 500 }}>{acct.name} {acct.mask}</span>
                        </div>
                      );
                    }
                    return null;
                  })()}
                  {(() => {
                    const merchantId = selectedTransaction.merchant_entity_id;
                    const txName = selectedTransaction.merchant_name || selectedTransaction.counterparty_name;
                    const hasForecast = visibleForecasts.some(f =>
                      (merchantId && f.merchant_entity_id === merchantId) ||
                      (txName && f.name === txName)
                    );
                    return (
                      <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0' }}>
                        <span style={forecastFieldLabelStyle}>Forecasted</span>
                        <span style={{ ...forecastControlTextStyle, color: hasForecast ? ui.color.success : ui.color.textDisabled, fontWeight: 500 }}>
                          {hasForecast ? 'True' : 'False'}
                        </span>
                      </div>
                    );
                  })()}
                  {(() => {
                    const matchedForecast = forecasts.find(f => f.matched_transaction_id === selectedTransaction.id);
                    const isMatched = Boolean(matchedForecast);
                    return (
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0' }}>
                        <span style={{ ...forecastFieldLabelStyle, color: isMatched ? ui.color.success : ui.color.textMuted }}>
                          Matched
                        </span>
                        <div style={{ alignItems: 'center', display: 'flex', gap: '12px' }}>
                          <span style={{ ...forecastControlTextStyle, color: isMatched ? ui.color.success : ui.color.textDisabled, fontWeight: 500 }}>
                            {isMatched ? 'True' : 'False'}
                          </span>
                          {matchedForecast && (
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
                                color: ui.color.danger,
                                border: `1px solid ${ui.color.danger}`,
                                borderRadius: ui.radius.small,
                                cursor: 'pointer',
                                fontWeight: 500
                              }}
                            >
                              Undo
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })()}
                </div>
              </>
            )}

            {modalView === 'forecast' && (selectedTransaction || addingStandaloneForecast) && (
              <>
                <div style={{ alignItems: 'center', display: 'flex', justifyContent: 'space-between', margin: '0 0 14px', padding: '0 2px' }}>
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
                          color: ui.color.textMuted,
                          padding: '4px'
                        }}
                        aria-label="Back to transaction details"
                      >←</button>
                    )}
                    <h2 id="forecast-dialog-title" style={{ color: ui.color.text, fontSize: '18px', fontWeight: 600, margin: 0 }}>Add Forecast</h2>
                  </div>
                  <button
                    aria-label="Close forecast form"
                    onClick={() => {
                      closeModal();
                    }}
                    style={{
                      alignItems: 'center',
                      background: 'none',
                      border: 'none',
                      display: 'inline-flex',
                      fontSize: '25px',
                      cursor: 'pointer',
                      color: ui.color.textMuted,
                      height: '40px',
                      justifyContent: 'center',
                      lineHeight: 1,
                      padding: 0,
                      width: '40px'
                    }}
                  >×</button>
                </div>

                {selectedTransaction ? (
                  (() => {
                    const transactionName = selectedTransaction.merchant_name || selectedTransaction.counterparty_name;
                    const { display: transactionAmount, isPositive } = formatAmount(selectedTransaction.amount);
                    return (
                      <div style={{
                        alignItems: 'center',
                        backgroundColor: ui.color.surfaceForecast,
                        border: `1px solid ${ui.color.primarySoft}`,
                        borderRadius: ui.radius.card,
                        boxShadow: ui.shadow.card,
                        display: 'flex',
                        gap: '12px',
                        minHeight: '68px',
                        marginBottom: '14px',
                        padding: '8px'
                      }}>
                        {selectedTransaction.logo_url ? (
                          <img
                            src={selectedTransaction.logo_url}
                            alt={transactionName}
                            style={{ width: '40px', height: '40px', borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }}
                          />
                        ) : (
                          <div style={{
                            width: '40px',
                            height: '40px',
                            borderRadius: '50%',
                            backgroundColor: ui.color.surfaceMuted,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontSize: '14px',
                            fontWeight: 'bold',
                            flexShrink: 0
                          }}>
                            {getInitials(transactionName)}
                          </div>
                        )}
                        <div style={{
                          flex: 1,
                          minWidth: 0,
                          fontWeight: 500,
                          display: '-webkit-box',
                          WebkitLineClamp: 2,
                          WebkitBoxOrient: 'vertical',
                          overflow: 'hidden'
                        }}>
                          {transactionName}
                        </div>
                        <div style={{ flexShrink: 0, textAlign: 'right' }}>
                          <div style={{ color: isPositive ? ui.color.success : ui.color.danger, fontSize: '16px', fontWeight: 700 }}>
                            {transactionAmount}
                          </div>
                          <div style={{ color: ui.color.textMuted, fontSize: '14px' }}>
                            {formatDate(selectedTransaction.date)}
                          </div>
                        </div>
                      </div>
                    );
                  })()
                ) : (
                  <div style={{ marginBottom: '16px' }}>
                    <label style={{ ...forecastFieldLabelStyle, display: 'block', marginBottom: '6px' }}>
                      Name <span aria-hidden="true">*</span>
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. Holiday gift"
                      data-testid="input-standalone-forecast-name"
                      value={standaloneForecastName}
                      onChange={(e) => setStandaloneForecastName(e.target.value)}
                      required
                      style={{
                        width: '100%',
                        padding: '8px',
                        ...sharedStyles.input,
                        borderRadius: ui.radius.control,
                        boxSizing: 'border-box',
                        ...forecastControlTextStyle
                      }}
                    />
                    <div style={{ marginTop: '16px' }}>
                      <label style={{ ...forecastFieldLabelStyle, display: 'block', marginBottom: '6px' }}>
                        Account <span aria-hidden="true">*</span>
                      </label>
                      <select
                        data-testid="select-standalone-forecast-account"
                        value={standaloneForecastAccountId}
                        onChange={(e) => setStandaloneForecastAccountId(e.target.value)}
                        required
                        style={{
                          width: '100%',
                          padding: '8px',
                          ...sharedStyles.input,
                          borderRadius: ui.radius.control,
                          boxSizing: 'border-box',
                          backgroundColor: ui.color.surface,
                          ...forecastControlTextStyle
                        }}
                      >
                        <option value="" disabled>Select an account</option>
                        {accountOptions.map((account) => (
                          <option key={account.value} value={account.value}>
                            {account.label}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                )}

                <div style={{ marginBottom: '16px' }}>
                  <label style={{ color: ui.color.textMuted, display: 'block', fontSize: '15px', fontWeight: 600, marginBottom: '6px' }}>Type</label>
                  <div
                    role="group"
                    aria-label="Forecast type"
                    style={{
                      alignItems: 'center',
                      backgroundColor: ui.color.surfaceMuted,
                      border: `1px solid ${ui.color.border}`,
                      borderRadius: '999px',
                      boxSizing: 'border-box',
                      display: 'flex',
                      gap: '3px',
                      height: '38px',
                      padding: '3px'
                    }}
                  >
                    <button
                      type="button"
                      data-testid="button-forecast-single"
                      onClick={() => setForecastType('single')}
                      style={{
                        ...forecastControlTextStyle,
                        alignItems: 'center',
                        backgroundColor: forecastType === 'single' ? ui.color.primary : 'transparent',
                        border: 'none',
                        borderRadius: '999px',
                        color: forecastType === 'single' ? ui.color.surface : ui.color.textMuted,
                        cursor: 'pointer',
                        display: 'flex',
                        flex: 1,
                        height: '30px',
                        justifyContent: 'center',
                        fontWeight: forecastType === 'single' ? 600 : 400,
                        padding: '0 10px'
                      }}
                    >
                      Single
                    </button>
                    <button
                      type="button"
                      data-testid="button-forecast-monthly"
                      onClick={() => setForecastType('monthly')}
                      style={{
                        ...forecastControlTextStyle,
                        alignItems: 'center',
                        backgroundColor: forecastType === 'monthly' ? ui.color.primary : 'transparent',
                        border: 'none',
                        borderRadius: '999px',
                        color: forecastType === 'monthly' ? ui.color.surface : ui.color.textMuted,
                        cursor: 'pointer',
                        display: 'flex',
                        flex: 1,
                        height: '30px',
                        justifyContent: 'center',
                        fontWeight: forecastType === 'monthly' ? 600 : 400,
                        padding: '0 10px'
                      }}
                    >
                      Monthly
                    </button>
                    <button
                      type="button"
                      data-testid="button-forecast-every-x-days"
                      onClick={() => setForecastType('every_x_days')}
                      style={{
                        ...forecastControlTextStyle,
                        alignItems: 'center',
                        backgroundColor: forecastType === 'every_x_days' ? ui.color.primary : 'transparent',
                        border: 'none',
                        borderRadius: '999px',
                        color: forecastType === 'every_x_days' ? ui.color.surface : ui.color.textMuted,
                        cursor: 'pointer',
                        display: 'flex',
                        flex: 1,
                        height: '30px',
                        justifyContent: 'center',
                        fontWeight: forecastType === 'every_x_days' ? 600 : 400,
                        padding: '0 10px'
                      }}
                    >
                      Days
                    </button>
                  </div>
                </div>

                {forecastType === 'every_x_days' && (
                  <div style={{ alignItems: 'center', color: ui.color.textMuted, display: 'flex', flexWrap: 'wrap', fontSize: '15px', fontWeight: 600, gap: '6px', marginTop: '10px' }}>
                    <span>Every</span>
                    <span style={{ display: 'inline-flex', flex: '0 0 calc(2ch + 16px)', maxWidth: 'calc(2ch + 16px)', minWidth: 'calc(2ch + 16px)' }}>
                      <input
                        type="number"
                        min="1"
                        data-testid="input-forecast-day-interval"
                        value={forecastDayInterval}
                        onChange={(e) => setForecastDayInterval(Math.max(1, parseInt(e.target.value) || 1))}
                        style={{
                          width: '100%',
                          height: '38px',
                          padding: '6px 4px',
                          ...sharedStyles.input,
                          boxSizing: 'border-box',
                          ...forecastControlTextStyle,
                          textAlign: 'center'
                        }}
                      />
                    </span>
                    <span>days</span>
                    <span style={{ alignItems: 'center', display: 'inline-flex', gap: '6px', whiteSpace: 'nowrap' }}>
                      <span>for</span>
                      <span style={{ display: 'inline-flex', flex: '0 0 calc(2ch + 16px)', maxWidth: 'calc(2ch + 16px)', minWidth: 'calc(2ch + 16px)' }}>
                        <input
                          type="number"
                          min="1"
                          max="52"
                          data-testid="input-forecast-day-count"
                          value={forecastDayCount}
                          onChange={(e) => setForecastDayCount(Math.max(1, Math.min(52, parseInt(e.target.value) || 1)))}
                          style={{
                            width: '100%',
                            height: '38px',
                            padding: '6px 4px',
                            ...sharedStyles.input,
                            boxSizing: 'border-box',
                            ...forecastControlTextStyle,
                            textAlign: 'center'
                          }}
                        />
                      </span>
                      <span>occurrences.</span>
                    </span>
                  </div>
                )}

                {forecastType === 'monthly' && (
                  <div style={{ marginTop: '10px' }}>
                    <label style={{ color: ui.color.textMuted, display: 'block', fontSize: '15px', fontWeight: 600, marginBottom: '6px' }}>
                      Number of Months
                    </label>
                    <select
                      data-testid="select-forecast-months"
                      value={forecastMonths}
                      onChange={(e) => setForecastMonths(parseInt(e.target.value))}
                      style={{
                        width: '100%',
                        height: '38px',
                        padding: '8px 10px',
                        ...sharedStyles.input,
                        boxSizing: 'border-box',
                        ...forecastControlTextStyle
                      }}
                    >
                      {Array.from({ length: 12 }, (_, i) => i + 1).map(n => (
                        <option key={n} value={n}>{n} month{n > 1 ? 's' : ''}</option>
                      ))}
                    </select>
                  </div>
                )}

                <div style={{ alignItems: 'center', display: 'grid', gap: '12px', gridTemplateColumns: '96px minmax(0, 280px)', marginTop: '14px', minWidth: 0 }}>
                  <label htmlFor="input-forecast-date" style={{ color: ui.color.textMuted, fontSize: '15px', fontWeight: 600 }}>
                    {forecastType === 'single' ? 'Date' : 'Starting Date'}
                  </label>
                  <div style={{
                    ...sharedStyles.input,
                    boxSizing: 'border-box',
                    minWidth: 0,
                    padding: '8px 10px 8px 26px',
                    width: '100%'
                  }}>
                    <input
                      id="input-forecast-date"
                      type="date"
                      data-testid="input-forecast-date"
                      value={forecastDate}
                      onChange={(e) => setForecastDate(e.target.value)}
                      required
                      style={{
                        width: '100%',
                        minWidth: 0,
                        height: '20px',
                        padding: 0,
                        border: 'none',
                        backgroundColor: 'transparent',
                        boxSizing: 'border-box',
                        color: ui.color.text,
                        ...forecastControlTextStyle
                      }}
                    />
                  </div>
                </div>
                
                <div style={{ alignItems: 'center', display: 'grid', gap: '12px', gridTemplateColumns: '96px minmax(0, 280px)', marginTop: '14px', minWidth: 0 }}>
                  <span style={{ alignItems: 'center', color: ui.color.textMuted, display: 'inline-flex', fontSize: '15px', fontWeight: 600, gap: '5px' }}>
                    Cash flow
                    <InfoHint
                      active={activeInfoTip === 'cashFlow'}
                      label="Explain cash flow direction"
                      onToggle={() => setActiveInfoTip(activeInfoTip === 'cashFlow' ? null : 'cashFlow')}
                      testId="info-cash-flow"
                      text="Expense lowers the projected balance on the selected date. Income raises it."
                    />
                  </span>
                  <div
                    role="group"
                    aria-label="Forecast cash-flow direction"
                    style={{
                      alignItems: 'center',
                      backgroundColor: ui.color.surfaceMuted,
                      border: `1px solid ${ui.color.border}`,
                      borderRadius: '999px',
                      boxSizing: 'border-box',
                      display: 'flex',
                      gap: '3px',
                      height: '38px',
                      padding: '3px'
                    }}
                  >
                    <button
                      type="button"
                      onClick={() => setForecastDirection('expense')}
                      aria-pressed={forecastDirection === 'expense'}
                      style={{
                        ...forecastControlTextStyle,
                        alignItems: 'center',
                        backgroundColor: forecastDirection === 'expense' ? ui.color.danger : 'transparent',
                        border: 'none',
                        borderRadius: '999px',
                        color: forecastDirection === 'expense' ? ui.color.surface : ui.color.textMuted,
                        cursor: 'pointer',
                        display: 'flex',
                        flex: 1,
                        fontWeight: 600,
                        height: '30px',
                        justifyContent: 'center',
                        lineHeight: '20px',
                        padding: '0 10px'
                      }}
                    >
                      Expense
                    </button>
                    <button
                      type="button"
                      onClick={() => setForecastDirection('income')}
                      aria-pressed={forecastDirection === 'income'}
                      style={{
                        ...forecastControlTextStyle,
                        alignItems: 'center',
                        backgroundColor: forecastDirection === 'income' ? ui.color.success : 'transparent',
                        border: 'none',
                        borderRadius: '999px',
                        color: forecastDirection === 'income' ? ui.color.surface : ui.color.textMuted,
                        cursor: 'pointer',
                        display: 'flex',
                        flex: 1,
                        fontWeight: 600,
                        height: '30px',
                        justifyContent: 'center',
                        lineHeight: '20px',
                        padding: '0 10px'
                      }}
                    >
                      Income
                    </button>
                  </div>
                </div>

                <div style={{ alignItems: 'center', display: 'grid', gap: '12px', gridTemplateColumns: '96px minmax(0, 280px)', marginTop: '14px', minWidth: 0 }}>
                  <label htmlFor="input-forecast-amount" style={forecastFieldLabelStyle}>
                    Amount <span aria-hidden="true">*</span>
                  </label>
                  <div style={{ minWidth: 0, width: '100%' }}>
                    <input
                      id="input-forecast-amount"
                      type="text"
                      inputMode="decimal"
                      placeholder="$ --"
                      data-testid="input-forecast-amount"
                      value={forecastAmount ? `$${formatForecastInputAmount(forecastAmount)}` : ''}
                      onChange={(e) => setForecastAmount(e.target.value.replace(/[$,]/g, ''))}
                      required
                      style={{
                        width: '100%',
                        minWidth: 0,
                        height: '38px',
                        padding: '8px 10px',
                        ...sharedStyles.input,
                        boxSizing: 'border-box',
                        ...forecastControlTextStyle,
                        textAlign: 'center'
                      }}
                    />
                  </div>
                </div>

                {forecastType !== 'single' && (
                  <div style={{ alignItems: 'center', display: 'flex', gap: '10px', marginTop: '10px' }}>
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
                        backgroundColor: autoExtend ? ui.color.primary : ui.color.borderStrong,
                        borderRadius: '12px',
                        transition: 'background-color 0.2s'
                      }} />
                      <span style={{
                        position: 'absolute',
                        top: '2px',
                        left: autoExtend ? '22px' : '2px',
                        width: '20px',
                        height: '20px',
                        backgroundColor: ui.color.surface,
                        borderRadius: '50%',
                        transition: 'left 0.2s',
                        boxShadow: ui.shadow.card
                      }} />
                    </label>
                    <span style={{ alignItems: 'center', color: ui.color.textMuted, display: 'inline-flex', fontSize: '14px', gap: '5px' }}>
                      Auto extend
                      <InfoHint
                        active={activeInfoTip === 'autoExtend'}
                        label="Explain auto extend"
                        onToggle={() => setActiveInfoTip(activeInfoTip === 'autoExtend' ? null : 'autoExtend')}
                        testId="info-auto-extend"
                        text="Keeps recurring forecasts extending into future months."
                      />
                    </span>
                  </div>
                )}

                <div style={{ marginTop: '20px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  <div style={{ display: 'flex', gap: '10px' }}>
                  <button
                    data-testid="button-save-forecast"
                    disabled={saving || !forecastDate || !forecastAmount || (addingStandaloneForecast && (!standaloneForecastName.trim() || !standaloneForecastAccountId))}
                    onClick={async () => {
                      if (!auth.currentUser) return;
                      if (!selectedTransaction && !addingStandaloneForecast) return;
                      if (addingStandaloneForecast && !standaloneForecastAccountId) return;
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
                          account_id: standaloneForecastAccountId,
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
                        setStandaloneForecastAccountId('');
                        setModalView('details');
                        setForecastDate('');
                        setForecastAmount('');
                        setForecastType('single');
                        setForecastMonths(12);
                        setAutoExtend(true);
                        setActiveInfoTip(null);
                      } catch (error: any) {
                        console.error('Error saving forecast:', error?.code, error?.message, error);
                        setActionError('We couldn’t save this forecast. Please check the details and try again.');
                      } finally {
                        setSaving(false);
                      }
                    }}
                    style={{
                      flex: 1,
                      padding: '10px 16px',
                      ...sharedStyles.primaryButton,
                      border: 'none',
                      borderRadius: '6px',
                      cursor: saving ? 'not-allowed' : 'pointer',
                      opacity: saving ? 0.6 : 1,
                      fontWeight: 600
                    }}
                  >
                    {saving ? 'Saving...' : forecastType === 'monthly' ? `Save ${forecastMonths} Forecasts` : forecastType === 'every_x_days' ? `Save ${forecastDayCount} Forecasts` : 'Save'}
                  </button>
                  </div>
                </div>
              </>
            )}

            {modalView === 'editForecast' && editingForecast && (
              <>
                <div style={{ alignItems: 'center', display: 'flex', justifyContent: 'space-between', margin: '0 0 14px', padding: '0 2px' }}>
                  <div style={{ alignItems: 'center', display: 'flex', gap: '8px' }}>
                    <button
                      data-testid="button-delete-this-forecast"
                      aria-label="Delete forecast"
                      title="Delete forecast"
                      disabled={saving || Boolean(confirmingDelete)}
                      onClick={handleDeleteEditedForecast}
                      style={{
                        alignItems: 'center',
                        backgroundColor: ui.color.surfaceMuted,
                        border: `1px solid ${ui.color.borderStrong}`,
                        borderRadius: ui.radius.control,
                        color: ui.color.textMuted,
                        cursor: saving || confirmingDelete ? 'not-allowed' : 'pointer',
                        display: 'inline-flex',
                        height: '34px',
                        justifyContent: 'center',
                        opacity: saving || confirmingDelete ? 0.6 : 1,
                        padding: 0,
                        width: '34px'
                      }}
                    >
                      <Trash2 size={17} strokeWidth={2} aria-hidden="true" />
                    </button>
                    <h2 id="forecast-dialog-title" style={{ color: ui.color.text, fontSize: '18px', fontWeight: 600, margin: 0 }}>Edit Forecast</h2>
                  </div>
                  <button
                    data-testid="button-close-edit-forecast"
                    aria-label="Close forecast editor"
                    onClick={resetEditingForecast}
                    style={{
                      alignItems: 'center',
                      background: 'none',
                      border: 'none',
                      display: 'inline-flex',
                      fontSize: '25px',
                      height: '40px',
                      justifyContent: 'center',
                      lineHeight: 1,
                      cursor: 'pointer',
                      color: ui.color.textMuted,
                      padding: 0,
                      width: '40px'
                    }}
                  >×</button>
                </div>

                {(() => {
                  const { display: forecastAmountDisplay } = formatAmount(editingForecast.amount);
                  const projectedBalance = editingForecast.id
                    ? forecastBalances.get(editingForecast.id) ?? null
                    : null;

                  return (
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '12px',
                        minHeight: '68px',
                        boxSizing: 'border-box',
                        padding: '8px',
                        marginBottom: '14px',
                        backgroundColor: ui.color.surfaceForecast,
                        border: `1px solid ${ui.color.primarySoft}`,
                        borderRadius: ui.radius.card,
                        boxShadow: ui.shadow.card,
                        cursor: 'default',
                        userSelect: 'none'
                      }}
                    >
                      {editingForecast.logo_url ? (
                        <img
                          src={editingForecast.logo_url}
                          alt={editingForecast.name}
                          style={{ width: '40px', height: '40px', borderRadius: '50%', objectFit: 'cover' }}
                        />
                      ) : (
                        <div style={{
                          width: '40px',
                          height: '40px',
                          borderRadius: '50%',
                          backgroundColor: ui.color.surfaceMuted,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontSize: '14px',
                          fontWeight: 'bold'
                        }}>
                          {getInitials(editingForecast.name)}
                        </div>
                      )}

                      <div style={{
                        flex: 1,
                        minWidth: 0,
                        fontWeight: 500,
                        display: '-webkit-box',
                        WebkitLineClamp: 2,
                        WebkitBoxOrient: 'vertical',
                        overflow: 'hidden'
                      }}>
                        {editingForecast.name}
                      </div>

                      <div style={{ textAlign: 'right', flexShrink: 0 }}>
                        <div style={{ fontWeight: 700, color: ui.color.primary }}>
                          {forecastAmountDisplay}
                        </div>
                        <div style={{ fontSize: '12px', color: ui.color.textMuted }}>
                          {projectedBalance != null
                            ? <span aria-label={`Projected balance on ${formatDate(editingForecast.date)}: ${formatCurrency(projectedBalance)}`}>{formatCurrency(projectedBalance)}</span>
                            : <span aria-label="Projected balance unavailable">—</span>}
                        </div>
                      </div>
                    </div>
                  );
                })()}

                <div style={{ alignItems: 'center', display: 'grid', gap: '12px', gridTemplateColumns: '96px minmax(0, 280px)', marginTop: '0', minWidth: 0 }}>
                  <label htmlFor="input-edit-forecast-date" style={{ color: ui.color.textMuted, fontSize: '15px', fontWeight: 600 }}>Date</label>
                  <div
                    style={{
                      width: '100%',
                      minWidth: 0,
                      maxWidth: '100%',
                      height: '38px',
                      padding: '8px 10px 8px 26px',
                      ...sharedStyles.input,
                      boxSizing: 'border-box',
                      display: 'flex',
                      alignItems: 'center'
                    }}
                  >
                    <input
                      id="input-edit-forecast-date"
                      type="date"
                      data-testid="input-edit-forecast-date"
                      value={forecastDate}
                      onChange={(e) => setForecastDate(e.target.value)}
                      style={{
                        width: '100%',
                        minWidth: 0,
                        height: '20px',
                        padding: 0,
                        border: 'none',
                        backgroundColor: 'transparent',
                        boxSizing: 'border-box',
                        color: ui.color.text,
                        fontFamily: 'inherit',
                        fontSize: '16px'
                      }}
                    />
                  </div>
                </div>
                
                <div style={{ alignItems: 'center', display: 'grid', gap: '12px', gridTemplateColumns: '96px minmax(0, 280px)', marginTop: '14px', minWidth: 0 }}>
                  <label htmlFor="input-edit-forecast-amount" style={{ color: ui.color.textMuted, fontSize: '15px', fontWeight: 600 }}>Amount</label>
                  <div style={{ minWidth: 0, width: '100%' }}>
                    <input
                      id="input-edit-forecast-amount"
                      type="text"
                      inputMode="decimal"
                      step="0.01"
                      placeholder="$ --"
                      data-testid="input-edit-forecast-amount"
                      value={forecastAmount ? `$${formatForecastInputAmount(forecastAmount)}` : ''}
                      onChange={(e) => setForecastAmount(e.target.value.replace(/[$,]/g, ''))}
                      style={{
                        width: '100%',
                        minWidth: 0,
                        height: '38px',
                        padding: '8px 10px',
                        ...sharedStyles.input,
                        boxSizing: 'border-box',
                        fontFamily: 'inherit',
                        fontSize: '16px',
                        textAlign: 'center'
                      }}
                    />
                  </div>
                </div>

                <div style={{ alignItems: 'center', display: 'grid', gap: '12px', gridTemplateColumns: '96px minmax(0, 280px)', marginTop: '14px', minWidth: 0 }}>
                  <span style={{ color: ui.color.textMuted, fontSize: '15px', fontWeight: 600 }}>Cash flow</span>
                  <div
                    role="group"
                    aria-label="Forecast cash-flow direction"
                    style={{
                      backgroundColor: ui.color.surfaceMuted,
                      border: `1px solid ${ui.color.border}`,
                      borderRadius: '999px',
                      display: 'flex',
                      gap: '3px',
                      height: '38px',
                      alignItems: 'center',
                      boxSizing: 'border-box',
                      padding: '3px'
                    }}
                  >
                    <button
                      type="button"
                      onClick={() => setForecastDirection('expense')}
                      aria-pressed={forecastDirection === 'expense'}
                      style={{
                        backgroundColor: forecastDirection === 'expense' ? ui.color.danger : 'transparent',
                        border: 'none',
                        borderRadius: '999px',
                        boxShadow: forecastDirection === 'expense' ? ui.shadow.card : 'none',
                        color: forecastDirection === 'expense' ? ui.color.surface : ui.color.textMuted,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flex: 1,
                        fontSize: '15px',
                        fontWeight: 600,
                        height: '30px',
                        lineHeight: '20px',
                        padding: '0 10px',
                        transition: 'background-color 0.15s, color 0.15s'
                      }}
                    >
                      Expense
                    </button>
                    <button
                      type="button"
                      onClick={() => setForecastDirection('income')}
                      aria-pressed={forecastDirection === 'income'}
                      style={{
                        backgroundColor: forecastDirection === 'income' ? ui.color.success : 'transparent',
                        border: 'none',
                        borderRadius: '999px',
                        boxShadow: forecastDirection === 'income' ? ui.shadow.card : 'none',
                        color: forecastDirection === 'income' ? ui.color.surface : ui.color.textMuted,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flex: 1,
                        fontSize: '15px',
                        fontWeight: 600,
                        height: '30px',
                        lineHeight: '20px',
                        padding: '0 10px',
                        transition: 'background-color 0.15s, color 0.15s'
                      }}
                    >
                      Income
                    </button>
                  </div>
                </div>

                <div style={{ marginTop: '20px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  <div style={{ display: 'flex', gap: '10px' }}>
                    <button
                      data-testid="button-save-this-forecast"
                      disabled={saving || !forecastDate || !forecastAmount}
                      onClick={() => {
                        setConfirmingDelete(null);
                        if (editingForecast.series_id) {
                          setSeriesActionPrompt('save');
                        } else {
                          void saveEditedForecast('individual');
                        }
                      }}
                      style={{
                        flex: 1,
                        padding: '10px 16px',
                        ...sharedStyles.primaryButton,
                        border: 'none',
                        borderRadius: '6px',
                        cursor: saving ? 'not-allowed' : 'pointer',
                        opacity: saving ? 0.6 : 1,
                        fontWeight: 600
                      }}
                    >
                      {saving ? 'Saving...' : 'Save Forecast'}
                    </button>
                  </div>

                  {seriesActionPrompt && editingForecast.series_id && (
                    <div
                      role="group"
                      aria-label={`${seriesActionPrompt === 'save' ? 'Save' : 'Delete'} forecast scope`}
                      style={{
                        backgroundColor: seriesActionPrompt === 'delete' ? ui.color.dangerSoft : ui.color.surfaceSelected,
                        border: `1px solid ${seriesActionPrompt === 'delete' ? ui.color.dangerBorder : ui.color.primarySoft}`,
                        borderRadius: ui.radius.control,
                        padding: '10px'
                      }}
                    >
                      <div style={{ color: ui.color.text, fontSize: '13px', fontWeight: 600, marginBottom: '8px' }}>
                        {seriesActionPrompt === 'save' ? 'Where should these changes apply?' : 'What do you want to delete?'}
                      </div>
                      <div style={{ display: 'grid', gap: '8px', gridTemplateColumns: '1fr 1fr' }}>
                        <button
                          data-testid={`${seriesActionPrompt === 'save' ? 'button-save' : 'button-delete'}-individual-option`}
                          onClick={() => {
                            if (seriesActionPrompt === 'save') {
                              void saveEditedForecast('individual');
                            } else {
                              setSeriesActionPrompt(null);
                              setConfirmingDelete('one');
                            }
                          }}
                          style={{
                            ...sharedStyles.secondaryButton,
                            cursor: 'pointer',
                            fontWeight: 600,
                            padding: '9px 10px'
                          }}
                        >
                          This Forecast
                        </button>
                        <button
                          data-testid={`${seriesActionPrompt === 'save' ? 'button-save' : 'button-delete'}-series-forecast`}
                          onClick={() => {
                            if (seriesActionPrompt === 'save') {
                              void saveEditedForecast('series');
                            } else {
                              setSeriesActionPrompt(null);
                              setConfirmingDelete('series');
                            }
                          }}
                          style={{
                            backgroundColor: seriesActionPrompt === 'delete' ? ui.color.danger : ui.color.primary,
                            border: 'none',
                            borderRadius: ui.radius.control,
                            color: ui.color.surface,
                            cursor: 'pointer',
                            fontWeight: 600,
                            padding: '9px 10px'
                          }}
                        >
                          Entire Series
                        </button>
                      </div>
                    </div>
                  )}

                  {confirmingDelete && (
                    <div
                      role="alert"
                      data-testid="forecast-delete-confirmation"
                      style={{ ...sharedStyles.alertError, padding: '10px', fontSize: '13px' }}
                    >
                      <div>
                        {confirmingDelete === 'series'
                          ? 'This will permanently delete every forecast in this series.'
                          : 'This will permanently delete this forecast.'}
                      </div>
                      <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', marginTop: '10px' }}>
                        <button
                          type="button"
                          data-testid="button-cancel-delete"
                          disabled={saving}
                          onClick={() => setConfirmingDelete(null)}
                          style={{
                            ...sharedStyles.secondaryButton,
                            cursor: saving ? 'not-allowed' : 'pointer',
                            fontWeight: 600,
                            padding: '7px 12px',
                          }}
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          data-testid="button-confirm-delete"
                          disabled={saving}
                          onClick={() => {
                            void deleteEditedForecast(confirmingDelete === 'series' ? 'series' : 'individual');
                          }}
                          style={{
                            backgroundColor: ui.color.danger,
                            border: 'none',
                            borderRadius: ui.radius.control,
                            color: ui.color.surface,
                            cursor: saving ? 'not-allowed' : 'pointer',
                            fontWeight: 600,
                            opacity: saving ? 0.6 : 1,
                            padding: '7px 12px',
                          }}
                        >
                          {saving ? 'Deleting…' : 'Delete'}
                        </button>
                      </div>
                    </div>
                  )}

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
