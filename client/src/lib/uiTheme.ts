import type { CSSProperties } from "react";

/**
 * Cash Cushion's visual language.
 *
 * The app intentionally keeps inline style objects for its feature-rich
 * dashboard. These values give those objects one source of truth instead of
 * each view inventing a close-but-different shade.
 */
export const ui = {
  color: {
    canvas: "#F3F5F8",
    surface: "#FFFFFF",
    surfaceSubtle: "#F8FAFC",
    surfaceSelected: "#EFF6FF",
    surfaceForecast: "#EFF6FF",
    surfaceMuted: "#F1F5F9",
    text: "#172554",
    textMuted: "#64748B",
    textDisabled: "#94A3B8",
    border: "#E2E8F0",
    borderStrong: "#CBD5E1",
    primary: "#2563EB",
    primaryHover: "#1D4ED8",
    primarySoft: "#DBEAFE",
    success: "#15803D",
    successSoft: "#F0FDF4",
    successBorder: "#BBF7D0",
    danger: "#B91C1C",
    dangerHover: "#991B1B",
    dangerSoft: "#FEF2F2",
    dangerBorder: "#FECACA",
    warning: "#B45309",
    warningSoft: "#FFFBEB",
    warningBorder: "#FDE68A",
    info: "#3B82F6",
    overlay: "rgba(15, 23, 42, 0.52)",
    chartGrid: "#E2E8F0",
    chartZero: "#94A3B8",
    chartSelection: "#60A5FA",
  },
  radius: {
    small: "6px",
    control: "8px",
    card: "12px",
    modal: "16px",
    pill: "999px",
  },
  shadow: {
    card: "0 1px 2px rgba(15, 23, 42, 0.05)",
    raised: "0 4px 14px rgba(15, 23, 42, 0.09)",
    modal: "0 20px 48px rgba(15, 23, 42, 0.22)",
  },
  typography: {
    heading: "#172554",
    body: "#172554",
    muted: "#64748B",
  },
  chartSeries: [
    "#2563EB",
    "#0E7490",
    "#7C3AED",
    "#B45309",
    "#15803D",
    "#DB2777",
    "#475569",
    "#0F766E",
  ],
} as const;

export const sharedStyles: Record<string, CSSProperties> = {
  card: {
    backgroundColor: ui.color.surface,
    border: `1px solid ${ui.color.border}`,
    borderRadius: ui.radius.card,
    boxShadow: ui.shadow.card,
  },
  input: {
    backgroundColor: ui.color.surface,
    border: `1px solid ${ui.color.borderStrong}`,
    borderRadius: ui.radius.control,
    color: ui.color.text,
    outline: "none",
  },
  primaryButton: {
    backgroundColor: ui.color.primary,
    border: "none",
    borderRadius: ui.radius.control,
    color: ui.color.surface,
    cursor: "pointer",
    fontWeight: 600,
  },
  secondaryButton: {
    backgroundColor: ui.color.surface,
    border: `1px solid ${ui.color.borderStrong}`,
    borderRadius: ui.radius.control,
    color: ui.color.textMuted,
    cursor: "pointer",
    fontWeight: 600,
  },
  destructiveButton: {
    backgroundColor: ui.color.danger,
    border: "none",
    borderRadius: ui.radius.control,
    color: ui.color.surface,
    cursor: "pointer",
    fontWeight: 600,
  },
  alertError: {
    backgroundColor: ui.color.dangerSoft,
    border: `1px solid ${ui.color.dangerBorder}`,
    borderRadius: ui.radius.control,
    color: ui.color.danger,
  },
  alertWarning: {
    backgroundColor: ui.color.warningSoft,
    border: `1px solid ${ui.color.warningBorder}`,
    borderRadius: ui.radius.control,
    color: ui.color.warning,
  },
};