import { useEffect, useEffectEvent, useRef, useState } from "react"
import { DIRECT_INPUT_TTL_MS, DIRECT_SAMPLE_MS } from "@/machine/contract"
import type { SimulatedJogSession } from "@/machine/contract"
import type { MachineHost } from "@/platform/host"
import { useMachineSnapshot } from "@/platform/machine"
import { log } from "@/app/errors/log"
import type { ControllerInput } from "./gamepad-step-input"
import { DirectGesture } from "./gamepad-direct-input"

type Active = {
  token: SimulatedJogSession
  machine: MachineHost
  sequence: number
  inFlight: boolean
  sentAt: number
  pending: {
    vector: readonly [number, number]
    capturedAt: number
    speedScale: number
  } | null
  gesture: DirectGesture
  moving: boolean
  lastLog: number
  zeroAt: number | null
}
export function useGamepadDirectJog(options: {
  machine: MachineHost
  connectionId: string | null
  speed: number
  onFailure: (reason: string) => void
}) {
  const record = useRef<Active | null>(null)
  const generation = useRef(0)
  const working = useRef(false)
  const [pending, setPending] = useState(false)
  const [active, setActive] = useState(false)
  const snapshot = useMachineSnapshot()
  useEffect(() => {
    const current = record.current
    const telemetry = snapshot.telemetry
    if (
      current &&
      current.zeroAt !== null &&
      telemetry &&
      telemetry.receivedAt >= current.zeroAt &&
      telemetry.state === "Idle" &&
      telemetry.feed === 0
    ) {
      log.info("Direct simulator zero confirmed", {
        delayMs: Date.now() - current.zeroAt,
        position: telemetry.machine,
      })
      current.zeroAt = null
    }
  }, [snapshot.telemetry])
  const fail = useEffectEvent((reason: string) => options.onFailure(reason))
  const end = (reason: string, halt = false) => {
    generation.current++
    const current = record.current
    record.current = null
    setActive(false)
    if (!current) return
    log.info("Direct simulator end requested", {
      reason,
      sessionId: current.token.sessionId,
    })
    if (halt) return
    working.current = true
    setPending(true)
    void current.machine
      .endSimulatedJog(current.token)
      .then((result) => {
        log.info("Direct simulator end confirmed", {
          state: result.telemetry?.state,
          position: result.telemetry?.machine,
        })
      })
      .catch((error: Error) => {
        log.warn("Direct simulator end failed", error.message)
      })
      .finally(() => {
        working.current = false
        setPending(false)
      })
  }
  const begin = async () => {
    if (working.current || record.current || !options.connectionId) return false
    working.current = true
    setPending(true)
    const epoch = ++generation.current
    const machine = options.machine
    try {
      const token = await machine.beginSimulatedJog({
        connectionId: options.connectionId,
      })
      if (generation.current !== epoch) {
        await machine.endSimulatedJog(token)
        return false
      }
      record.current = {
        token,
        machine,
        sequence: 0,
        inFlight: false,
        sentAt: 0,
        pending: null,
        gesture: new DirectGesture(),
        moving: false,
        lastLog: 0,
        zeroAt: null,
      }
      setActive(true)
      log.info("Direct simulator armed", { sessionId: token.sessionId })
      return true
    } catch (error) {
      if (generation.current === epoch)
        fail(error instanceof Error ? error.message : "Direct arming failed")
      return false
    } finally {
      working.current = false
      setPending(false)
    }
  }
  const flush = (current: Active) => {
    if (record.current !== current || current.inFlight || !current.pending)
      return
    const sample = current.pending
    current.pending = null
    const now = Date.now()
    if (
      now - sample.capturedAt >= DIRECT_INPUT_TTL_MS ||
      now < sample.capturedAt
    ) {
      end("Direct input delayed")
      fail("Direct input delayed — arm again")
      return
    }
    current.inFlight = true
    current.sentAt = now
    const moving = Math.hypot(...sample.vector) > 0
    if (current.moving && !moving) {
      current.zeroAt = now
      log.info("Direct simulator zero requested", {
        sessionId: current.token.sessionId,
        capturedAt: sample.capturedAt,
      })
    }
    if (moving) current.zeroAt = null
    current.moving = moving
    const input = {
      ...current.token,
      sequence: ++current.sequence,
      capturedAt: sample.capturedAt,
      x: sample.vector[0],
      y: sample.vector[1],
      speedScale: sample.speedScale,
    }
    void current.machine
      .sampleSimulatedJog(input)
      .then((receipt) => {
        if (record.current === current && now - current.lastLog >= 1000) {
          current.lastLog = now
          log.info("Direct simulator input accepted", {
            sequence: receipt.sequence,
            ageMs: Date.now() - sample.capturedAt,
            x: input.x,
            y: input.y,
          })
        }
      })
      .catch((error: Error) => {
        if (record.current === current) {
          end(error.message)
          fail(error.message)
        }
      })
      .finally(() => {
        current.inFlight = false
        // The next controller poll sends only its newest capture, never an older buffered move.
      })
  }
  const sample = (input: ControllerInput, capturedAt: number) => {
    const current = record.current
    if (!current) return
    const vector = current.gesture.take(input)
    current.pending = { vector, capturedAt, speedScale: options.speed / 100 }
    const zero = vector[0] === 0 && vector[1] === 0
    if (
      (zero && current.moving) ||
      capturedAt - current.sentAt >= DIRECT_SAMPLE_MS
    )
      flush(current)
  }
  const closeOnChange = useEffectEvent(() =>
    end("Connection or machine process changed")
  )
  useEffect(
    () => () => closeOnChange(),
    [options.connectionId, options.machine]
  )
  return { pending, active, begin, sample, end }
}
