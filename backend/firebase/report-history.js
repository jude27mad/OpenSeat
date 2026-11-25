// A cycle is three alternating observations at one seat. Record its endpoints
// first, so the one-minute test always uses acknowledged server timestamps.
function lastRapidReversal(report) {
  if (Number.isFinite(report.cycleStart) && Number.isFinite(report.cycleEnd)
      && report.cycleEnd - report.cycleStart <= 60_000)
    return report.cycleEnd
  return report.holdAt
}

export function reportHistory(previous, value, at, resetAt = 0) {
  if (!previous || previous.at <= resetAt) return {}
  if (previous.value === value) {
    // A confirmation updates the evidence age, but never starts a new reversal.
    const history = {}
    for (const key of ['oppositeAt', 'cycleStart', 'cycleEnd', 'holdAt']) {
      if (previous[key] !== undefined) history[key] = previous[key]
    }
    return history
  }
  const history = { oppositeAt: previous.at }
  if (previous.oppositeAt !== undefined) {
    history.cycleStart = previous.oppositeAt
    history.cycleEnd = at
  }
  // A later, slower cycle must not cut an existing 15-minute pause short.
  const reversal = lastRapidReversal(previous)
  if (reversal !== undefined) history.holdAt = reversal
  return history
}

export function recommendationPaused(report, now) {
  if (report.source !== 'report' || report.lasting) return false
  const reversal = lastRapidReversal(report)
  return Number.isFinite(reversal) && now < reversal + 15 * 60_000
}
