import { DIRECT_INPUT_TTL_MS, isFresh } from "../contract/index.ts"
import type {
  SimulatedJogSession,
  SimulatedJogSample,
  SimulatedJogReceipt,
} from "../contract/index.ts"
import type { SimulatorJogWireCommand } from "../firmware/makera/simulator-jog.ts"
import { FAILURE_LINES } from "../firmware/adapter.ts"
import { MachineError } from "./errors.ts"
import type { OperationContext } from "./operations/context.ts"
import type { TimerHandle } from "./ports.ts"

/** One connection-bound lease, never a queue of finite movement commands. */
export class SimulatedJogOwner {
  private readonly context: OperationContext
  readonly token: SimulatedJogSession
  private readonly onExpired: (reason: string) => void
  private timer: TimerHandle | null = null
  private sequence = 0
  private active = false
  private pending: Promise<SimulatedJogReceipt> | null = null
  private exchangeAbort: AbortController | null = null
  private ended: Promise<void> | null = null
  constructor(
    context: OperationContext,
    token: SimulatedJogSession,
    onExpired: (reason: string) => void
  ) {
    this.context = context
    this.token = token
    this.onExpired = onExpired
  }
  async start() {
    await this.exchange(
      { kind: "begin", sessionId: this.token.sessionId },
      0,
      3000
    )
    this.active = true
    this.expireAt(this.context.clock.now() + DIRECT_INPUT_TTL_MS)
  }
  sample(input: SimulatedJogSample): Promise<SimulatedJogReceipt> {
    const now = this.context.clock.now()
    let refusal: string | null = null
    if (!this.active) refusal = "Direct session is no longer active"
    else if (
      input.connectionId !== this.token.connectionId ||
      input.sessionId !== this.token.sessionId
    )
      refusal = "Direct input belongs to another session"
    else if (input.sequence <= this.sequence)
      refusal = `Direct input sequence ${input.sequence} did not advance past ${this.sequence}`
    else if (input.capturedAt > now)
      refusal = `Direct input timestamp is ${input.capturedAt - now} ms ahead of the machine clock`
    else if (input.capturedAt + DIRECT_INPUT_TTL_MS <= now)
      refusal = `Direct input expired at ${now - input.capturedAt} ms old`
    if (refusal)
      return Promise.reject(
        new MachineError("refused", `${refusal}. Arm again.`)
      )
    if (this.pending)
      return Promise.reject(
        new MachineError("busy", "Direct input exchange is busy.")
      )
    const telemetry = this.context.session.store.telemetry
    if (
      !isFresh(telemetry, now) ||
      telemetry.estop !== false ||
      telemetry.spindleOn !== false ||
      !["Idle", "Run"].includes(telemetry.state)
    )
      return Promise.reject(
        new MachineError(
          "refused",
          "Simulator is no longer available for Direct steering."
        )
      )
    this.sequence = input.sequence
    this.expireAt(input.capturedAt + DIRECT_INPUT_TTL_MS)
    const promise = this.exchange(
      { kind: "sample", sample: input },
      input.sequence,
      DIRECT_INPUT_TTL_MS
    )
    this.pending = promise
    void promise
      .finally(() => {
        if (this.pending === promise) this.pending = null
      })
      .catch(() => {})
    return promise
  }
  private expireAt(deadline: number) {
    this.context.clock.clearTimeout(this.timer)
    this.timer = this.context.clock.setTimeout(
      () => {
        this.active = false
        this.onExpired("Direct input expired — arm again")
      },
      Math.max(0, deadline - this.context.clock.now())
    )
  }
  end(): Promise<void> {
    if (this.ended) return this.ended
    this.active = false
    this.context.clock.clearTimeout(this.timer)
    this.exchangeAbort?.abort(
      new MachineError("cancelled", "Direct session is ending.")
    )
    this.ended = this.finish()
    return this.ended
  }
  get ending() {
    return this.ended !== null
  }
  private async finish() {
    await this.pending?.catch(() => {})
    const { session } = this.context
    await this.exchange(
      { kind: "end", sessionId: this.token.sessionId },
      0,
      3000
    )
    // An Idle report received before end was acknowledged cannot prove this stop.
    const after = session.store.sequence
    session.requestStatus(true)
    await session.store.waitFor(
      (telemetry) => telemetry.state === "Idle" && telemetry.feed === 0,
      {
        after,
        timeoutMs: 3000,
        timeoutMessage: "Direct simulator stop was not confirmed.",
        signal: this.context.signal,
      }
    )
  }
  invalidate() {
    this.active = false
    this.context.clock.clearTimeout(this.timer)
    this.exchangeAbort?.abort(
      new MachineError("cancelled", "Direct session was invalidated.")
    )
  }
  private async exchange(
    command: SimulatorJogWireCommand,
    sequence: number,
    timeoutMs: number
  ): Promise<SimulatedJogReceipt> {
    const protocol = this.context.adapter.simulatorJog
    if (!protocol)
      throw new MachineError(
        "refused",
        "Direct simulator protocol is unavailable."
      )
    const abort = new AbortController()
    this.exchangeAbort = abort
    const relay = () => abort.abort(this.context.signal.reason)
    if (this.context.signal.aborted) relay()
    this.context.signal.addEventListener("abort", relay, { once: true })
    try {
      return await this.context.session.request<SimulatedJogReceipt>(
        [protocol.frame(command)],
        (event) => {
          if (event.kind !== "line") return "ignored"
          const reply = protocol.reply(event.line.text)
          if (reply) {
            if (
              reply.sessionId !== this.token.sessionId ||
              reply.sequence !== sequence
            )
              return "consumed"
            return reply.ok
              ? {
                  done: {
                    sessionId: reply.sessionId,
                    sequence: reply.sequence,
                  },
                }
              : {
                  fail: new MachineError(
                    "rejected",
                    reply.reason ?? "Direct simulator command was refused."
                  ),
                }
          }
          if (FAILURE_LINES.has(event.line.kind))
            return { fail: new MachineError("rejected", event.line.text) }
          return "ignored"
        },
        {
          timeoutMs,
          timeoutMessage: "Direct simulator acknowledgement was not received.",
          signal: abort.signal,
        }
      )
    } finally {
      this.context.signal.removeEventListener("abort", relay)
      if (this.exchangeAbort === abort) this.exchangeAbort = null
    }
  }
}
