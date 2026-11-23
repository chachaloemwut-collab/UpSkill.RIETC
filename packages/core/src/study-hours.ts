/** Award only completed hours; precise media and attendance records remain in seconds. */
export function completedHours(seconds: number): number {
  return Number.isFinite(seconds) ? Math.floor(Math.max(0, seconds) / 3600) : 0;
}

export function formatStudyDurationTh(seconds: number): string {
  return `${completedHours(seconds)} ชั่วโมง`;
}
