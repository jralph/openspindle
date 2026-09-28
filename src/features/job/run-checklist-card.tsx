import { Link } from "@tanstack/react-router"
import {
  ChevronDown,
  CircleCheck,
  CircleDashed,
  CircleX,
  Crosshair,
  TriangleAlert,
} from "lucide-react"
import type { LucideIcon } from "lucide-react"
import { Button, buttonVariants } from "@/components/ui/button"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemMedia,
  ItemTitle,
} from "@/components/ui/item"
import type { MachineAction } from "./job-hooks"
import type {
  RunCheck,
  RunCheckStatus,
  RunChecklist,
  RunFix,
} from "./run-checklist"
import { MachineActionButton, StageCard } from "./stage-card"

const STATUS: Record<RunCheckStatus, { icon: LucideIcon; label: string }> = {
  pass: { icon: CircleCheck, label: "Passes" },
  fail: { icon: CircleX, label: "Fails" },
  pending: { icon: CircleDashed, label: "Waiting" },
}
const WARNING = { icon: TriangleAlert, label: "Passes with a warning" }

/** A fix links to where it is made; a machine action runs right here. */
function RunFixAction({
  fix,
  readAnchors,
}: {
  fix: RunFix
  readAnchors: MachineAction
}) {
  const className = buttonVariants({ variant: "outline", size: "sm" })
  switch (fix.kind) {
    case "prepare":
      return (
        <Link to="/prepare" search={fix.search} className={className}>
          {fix.label}
        </Link>
      )
    case "device":
      return (
        <Link to="/device" className={className}>
          {fix.label}
        </Link>
      )
    case "read-anchors":
      return (
        <MachineActionButton
          action={readAnchors}
          label={fix.label}
          pendingLabel="Reading anchors…"
          size="sm"
          icon={<Crosshair data-icon="inline-start" />}
        />
      )
  }
}

function RunCheckItem({
  check,
  readAnchors,
}: {
  check: RunCheck
  readAnchors: MachineAction
}) {
  const { status, reason, fix, warning } = check.result
  const { icon: Icon, label } = warning ? WARNING : STATUS[status]
  return (
    <Item size="xs" role="listitem">
      <ItemMedia variant="icon">
        <Icon role="img" aria-label={label} />
      </ItemMedia>
      <ItemContent>
        <ItemTitle>{check.label}</ItemTitle>
        {/* What blocks or warns is read in full. */}
        {reason && (
          <ItemDescription className="line-clamp-none">
            {reason}
          </ItemDescription>
        )}
      </ItemContent>
      {fix && (
        <ItemActions>
          <RunFixAction fix={fix} readAnchors={readAnchors} />
        </ItemActions>
      )}
    </Item>
  )
}

/** What Run sends once every check passes, or that it waits for them. */
function preflightDescription(checklist: RunChecklist, parts: number): string {
  if (!checklist.ready) return "Run becomes available once every check passes."
  if (parts > 1)
    return `Run sends the G-code listed on the right in ${parts} parts, split at its tool changes.`
  return "Run sends exactly the G-code listed on the right."
}

/**
 * Before a job: the Run conditions that do not pass yet, each with its quick fix, and the ones
 * that do folded away. Run, in the job's toolbar, waits for all of them.
 */
export function RunChecklistCard({
  checklist,
  readAnchors,
  parts,
}: {
  checklist: RunChecklist
  readAnchors: MachineAction
  /** The files the checked program is sent as. */
  parts: number
}) {
  // A check that passes with a warning stays in view.
  const folds = (check: RunCheck) =>
    check.result.status === "pass" && !check.result.warning
  const open = checklist.checks.filter((check) => !folds(check))
  const passed = checklist.checks.filter(folds)
  const item = (check: RunCheck) => (
    <RunCheckItem key={check.id} check={check} readAnchors={readAnchors} />
  )
  return (
    <StageCard
      title={checklist.ready ? "Preflight: ready to run" : "Preflight"}
      description={preflightDescription(checklist, parts)}
    >
      {open.length > 0 && (
        <ItemGroup aria-label="Run checks to do">{open.map(item)}</ItemGroup>
      )}
      {passed.length > 0 && (
        <Collapsible>
          <CollapsibleTrigger
            render={<Button variant="ghost" size="sm" className="group" />}
          >
            <ChevronDown
              data-icon="inline-start"
              className="transition-transform group-data-[panel-open]:rotate-180"
            />
            {passed.length === checklist.checks.length
              ? `All ${passed.length} checks pass`
              : `${passed.length} more ${passed.length === 1 ? "check passes" : "checks pass"}`}
          </CollapsibleTrigger>
          <CollapsibleContent>
            <ItemGroup aria-label="Run checks that pass">
              {passed.map(item)}
            </ItemGroup>
          </CollapsibleContent>
        </Collapsible>
      )}
    </StageCard>
  )
}
