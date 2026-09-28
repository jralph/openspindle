import { COMMAND_LABELS } from "../../contract/index.ts"
import type { MachineCommand } from "../../contract/index.ts"
import { MachineError } from "../errors.ts"
import {
  expectAcknowledgement,
  freshStatus,
  remaining,
  requireAdmission,
} from "./context.ts"
import type { OperationContext } from "./context.ts"

/** A late acknowledgement from an unverified command is swallowed for this long. */
const LATE_ACK_DRAIN_MS = 2000

/**
 * Sends one command and proves it took effect. Without a program stream the proof is
 * the acknowledgement and a telemetry post-condition; while a program streams, played
 * lines produce their own acknowledgements, so only telemetry counts.
 */
export async function executeCommand(
  context: OperationContext,
  command: MachineCommand
): Promise<void> {
  const { session, adapter, clock, signal } = context
  const label = COMMAND_LABELS[command.type].toLowerCase()
  const before = await freshStatus(
    context,
    "Timed out waiting for fresh device status. No command was sent."
  )
  requireAdmission(context, { key: command.type, command }, before)
  const plan = adapter.plan(command, before)
  const streaming = context.streaming()
  const deadline = clock.now() + plan.timeoutMs
  const sent = session.store.sequence
  const acknowledgement =
    plan.acknowledged && !streaming
      ? expectAcknowledgement(context, label, plan.timeoutMs)
      : null
  let acknowledged = !acknowledgement
  const releaseBoost = session.boostPolling()
  try {
    session.send(plan.frame)
    session.requestStatus(true)
    if (acknowledgement) {
      await acknowledgement
      acknowledged = true
      session.requestStatus(true)
    }
    await session.store.waitFor((after) => plan.verify(after, before), {
      after: sent,
      timeoutMs: remaining(clock, deadline),
      timeoutMessage: `The machine did not confirm ${label}.`,
      signal,
      failWhen: (after) =>
        after.state === "Alarm" && (acknowledged || !plan.startsFromAlarm)
          ? new MachineError(
              "rejected",
              `The machine entered Alarm during ${label}.`
            )
          : null,
    })
  } catch (error) {
    // The acknowledgement may still be pending when verification fails.
    acknowledgement?.catch(() => {})
    if (!(error instanceof MachineError) || error.code !== "timeout")
      throw error
    if (!acknowledged)
      session.drainFor(
        LATE_ACK_DRAIN_MS,
        (event) => event.kind === "line" && event.line.kind === "ack"
      )
    // Unverified motion leaves the machine in an unknown state: isolate it.
    if (plan.motion) {
      const message = `${error.message} Its outcome is unknown; check the machine before reconnecting. No command was retried.`
      session.close(message)
      throw new MachineError("unverified", message)
    }
    throw new MachineError("unverified", `${error.message} Check the machine.`)
  } finally {
    releaseBoost()
  }
}
