/** "45 s", "2 min 0 s" or "1 h 5 min". */
export function formatDuration(seconds: number) {
  // Round once so 119.5 s reads "2 min 0 s", not "1 min 60 s".
  const total = Math.round(seconds)
  if (total < 60) return `${total} s`
  const minutes = Math.floor(total / 60)
  return minutes < 60
    ? `${minutes} min ${total % 60} s`
    : `${Math.floor(minutes / 60)} h ${minutes % 60} min`
}
