const CONTENT_GAP = 6;

export function getDashboardContentPadding(fixedHeaderBottom: number) {
  return Math.max(0, Math.ceil(fixedHeaderBottom)) + CONTENT_GAP;
}