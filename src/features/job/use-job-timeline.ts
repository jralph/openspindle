import { useEffect, useState } from "react"
import { kitForPlate } from "@/domain/fixtures/catalog"
import type { GCodeProgram } from "@/domain/nc/gcode"
import {
  buildPreviewTimeline,
  previewAt,
  stepForLine,
} from "./preview-timeline"
import type { PreviewTimeline } from "./preview-timeline"
import type { FollowTarget, JobSubject } from "./job-view"

const EMPTY_TIMELINE: PreviewTimeline = { steps: [], ticks: [], probePoints: 0 }
const TICK_MS = 60

type Playback = {
  /** The program the position belongs to; another program starts over, fully shown. */
  readonly program: GCodeProgram | null
  /** Fractional timeline step; null shows the whole program. */
  readonly position: number | null
  readonly playing: boolean
  /** The job the user scrubbed away from; any other job is followed again. */
  readonly detachedFrom: string | null
}

const initialPlayback = (program: GCodeProgram | null): Playback => ({
  program,
  position: null,
  playing: false,
  detachedFrom: null,
})

const clampStep = (step: number, count: number) =>
  Math.max(0, Math.min(count, Number.isNaN(step) ? 0 : step))

/** What the 3D viewer draws at the cursor. */
export type TimelinePreview = ReturnType<typeof previewAt>

export type JobTimeline = {
  readonly timeline: PreviewTimeline
  /** Timeline step on show. */
  readonly cursor: number
  /** The program line on show: the machine's own line while following, 0 for none. */
  readonly line: number
  readonly preview: TimelinePreview
  readonly playing: boolean
  readonly speed: number
  /** This window's job position, while it has one. */
  readonly target: FollowTarget | null
  /** The cursor follows the target; false once the user scrubs away from it. */
  readonly following: boolean
  seek: (step: number) => void
  seekLine: (line: number) => void
  togglePlay: () => void
  setSpeed: (speed: number) => void
  /** Back to live: the cursor follows the machine again. */
  follow: () => void
}

/**
 * The preview cursor of the Job tab over the subject's program. Without a job it scrubs and
 * plays the program; while this window's job reports progress it follows the machine's line
 * until the user scrubs.
 */
export function useJobTimeline(
  subject: Pick<JobSubject, "plate" | "compiled"> | null,
  target: FollowTarget | null
): JobTimeline {
  const program = subject?.compiled.program ?? null
  // Built once per compiled program, from its sections and pause points.
  const timeline = subject
    ? buildPreviewTimeline(
        subject.compiled,
        subject.plate.operations,
        kitForPlate(subject.plate)
      )
    : EMPTY_TIMELINE
  const count = timeline.steps.length
  const [speed, setSpeed] = useState(1)
  const [stored, setPlayback] = useState(() => initialPlayback(program))
  const playback =
    stored.program === program ? stored : initialPlayback(program)
  const following = target !== null && playback.detachedFrom !== target.jobId
  // Following the machine ends preview playback, so it cannot resume on its own afterwards.
  if (following && stored.playing) setPlayback({ ...stored, playing: false })
  const cursor = following
    ? stepForLine(timeline, target.line)
    : Math.floor(clampStep(playback.position ?? count, count))
  const preview: TimelinePreview = program
    ? previewAt(timeline, cursor, program)
    : { line: 0, probePoint: undefined, segmentProgress: 0 }
  const playing = playback.playing && !following
  // The whole program on show has no line of its own until the user moves the cursor.
  let line = preview.line
  if (following) line = target.line
  else if (playback.position === null) line = 0

  const update = (patch: Partial<Omit<Playback, "program">>) =>
    setPlayback((current) => ({
      ...(current.program === program ? current : initialPlayback(program)),
      ...patch,
    }))
  const seek = (step: number) =>
    update({
      position: clampStep(step, count),
      playing: false,
      detachedFrom: target?.jobId ?? null,
    })

  useEffect(() => {
    if (!playing) return
    const increment = Math.max(1, count / 400) * speed
    const timer = setInterval(
      () =>
        setPlayback((current) => {
          if (current.program !== program || !current.playing) return current
          const position = Math.min(
            count,
            (current.position ?? count) + increment
          )
          return { ...current, position, playing: position < count }
        }),
      TICK_MS
    )
    return () => clearInterval(timer)
  }, [playing, program, count, speed])

  return {
    timeline,
    cursor,
    line,
    preview,
    playing,
    speed,
    target,
    following,
    seek,
    seekLine: (programLine) => seek(stepForLine(timeline, programLine)),
    togglePlay: () => {
      if (playing) update({ playing: false })
      else
        update({
          position: cursor >= count ? 0 : cursor,
          playing: count > 0,
          detachedFrom: target?.jobId ?? null,
        })
    },
    setSpeed,
    follow: () => update({ playing: false, detachedFrom: null }),
  }
}
