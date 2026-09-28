import type { ReactNode } from "react"
import { Radio } from "lucide-react"
import { Button } from "@/components/ui/button"
import { PreviewTimelineBar } from "./timeline-bar"
import type { JobTimeline } from "./use-job-timeline"

function timelineTitle({ following, target }: JobTimeline): string {
  if (!following || !target) return "Toolpath preview"
  return target.active ? "Live position" : "End of job"
}

/** The timeline under the viewer: preview playback, or this window's job position. */
export function JobTimelineBar({
  timeline,
  details,
}: {
  timeline: JobTimeline
  /** What the cursor shows in detail, under the scrubber. */
  details?: ReactNode
}) {
  const { target, following } = timeline
  return (
    <PreviewTimelineBar
      timeline={timeline.timeline}
      cursor={timeline.cursor}
      playing={timeline.playing}
      onSeek={timeline.seek}
      onPlay={timeline.togglePlay}
      speed={timeline.speed}
      onSpeed={timeline.setSpeed}
      title={timelineTitle(timeline)}
      details={details}
      actions={
        target &&
        !following && (
          <Button variant="outline" size="sm" onClick={timeline.follow}>
            <Radio data-icon="inline-start" />
            {target.active ? "Back to live" : "Back to job position"}
          </Button>
        )
      }
    />
  )
}
