import { useEffect, useEffectEvent, useRef, useState } from "react"
import type { MachineCommand, MachineSnapshot } from "@/machine/contract"
import { useMachineHost, useMachineSnapshot } from "@/platform/machine"
import { useGamepadDirectJog } from "./use-gamepad-direct-jog"
import { log } from "@/app/errors/log"
import { readController, StepGesture } from "./gamepad-step-input"
import type { ControllerInput } from "./gamepad-step-input"

type Options = {
  connectionId: string | null
  simulator: boolean
  step: number
  speed: number
  adjustStep: (delta: -1 | 1) => void
  allowed: (action: MachineCommand) => boolean
  execute: (action: MachineCommand) => Promise<MachineSnapshot>
  stop: () => Promise<MachineSnapshot>
}

/** Renderer input probe; every simulator command still uses the existing machine gateway. */
export function useGamepadStepJog(options: Options) {
  const [controllers, setControllers] = useState<ControllerInput[]>([])
  const [selection, setSelection] = useState("")
  const [armed, setArmed] = useState(false)
  const [notice, setNotice] = useState("Controller input monitor")
  const [mode, setMode] = useState<"step" | "direct">("step")
  const machine = useMachineHost()
  const snapshot = useMachineSnapshot()
  const armedRef = useRef(false)
  const live = useRef<ControllerInput | null>(null)
  const busy = useRef(false)
  const gesture = useRef(new StepGesture())
  const stepButtonHeld = useRef(false)
  const disarm = (message = "Controller disarmed", halt = false) => {
    if (armedRef.current) log.info(`Gamepad: ${message}`)
    armedRef.current = false
    gesture.current.reset()
    setArmed(false)
    setNotice(message)
    direct.end(message, halt)
  }
  const direct = useGamepadDirectJog({
    machine,
    connectionId: options.connectionId,
    speed: options.speed,
    onFailure: disarm,
  })
  const directSeen = useRef(false)
  const observeSession = useEffectEvent(() => {
    if (!direct.active) {
      directSeen.current = false
      return
    }
    if (snapshot.activity?.label === "Direct simulator jogging")
      directSeen.current = true
    else if (directSeen.current) disarm("Direct session ended — arm again")
  })
  useEffect(() => observeSession(), [direct.active, snapshot.activity])
  const handle = useEffectEvent((input: ControllerInput | null) => {
    live.current = input
    const delta = input?.stepDelta ?? null
    const adjusting = delta !== null && input?.stopHeld === false
    if (
      adjusting &&
      !stepButtonHeld.current &&
      input.supported &&
      options.simulator &&
      document.hasFocus() &&
      !document.hidden
    ) {
      options.adjustStep(delta)
      log.info("Gamepad step-size change", { delta })
      setNotice("Step size changed")
    }
    stepButtonHeld.current = adjusting
    if (!armedRef.current) return
    if (
      !input?.supported ||
      !options.simulator ||
      !document.hasFocus() ||
      document.hidden
    ) {
      disarm("Controller disarmed — connection or focus lost")
      return
    }
    if (input.stopHeld) {
      disarm("Stop requested — controller disarmed", true)
      // Stop bypasses the normal command's busy gate.
      void options
        .stop()
        .then((result) =>
          log.info("Gamepad Stop confirmed", {
            state: result.telemetry?.state,
            position: result.telemetry?.machine,
          })
        )
        .catch((error: Error) => setNotice(error.message))
      return
    }
    if (mode === "direct") {
      direct.sample(input, Date.now())
      return
    }
    const direction = gesture.current.take(input)
    if (!direction) return
    const command: MachineCommand = {
      type: "jog",
      axis: direction.axis,
      distance: options.step * direction.sign,
      speedScale: options.speed / 100,
    }
    if (busy.current || !options.allowed(command)) {
      log.info("Gamepad gesture refused while unavailable", command)
      setNotice("Step refused while unavailable — return to centre")
      return
    }
    busy.current = true
    log.info("Gamepad step requested", command)
    setNotice(`Jog ${direction.axis} ${command.distance} mm…`)
    void options
      .execute(command)
      .then((result) => {
        log.info("Gamepad step confirmed", {
          state: result.telemetry?.state,
          position: result.telemetry?.machine,
        })
        if (armedRef.current) setNotice("Step confirmed — return to centre")
      })
      .catch((error: Error) => disarm(error.message))
      .finally(() => {
        busy.current = false
      })
  })
  useEffect(() => {
    disarm()
    live.current = null
    let previousKey: string | null = null
    let lastFrame = performance.now()
    let lastDisplay = 0
    let previousDisplay = ""
    let previousInput = ""
    let frame = 0
    const poll = (now: number) => {
      if (now - lastFrame > (mode === "direct" ? 150 : 250) && armedRef.current)
        disarm("Controller disarmed — input delayed")
      lastFrame = now
      const inputs = Array.from(navigator.getGamepads())
        .filter((pad): pad is Gamepad => pad !== null && pad.connected)
        .map(readController)
      const input =
        inputs.find((entry) => entry.key === selection) ??
        (selection ? null : (inputs[0] ?? null))
      const key = input?.key ?? null
      if (key !== previousKey) {
        // Invalidate a pending begin too, before its completion can arm this input.
        disarm("Controller changed — arm again")
        gesture.current.reset()
        previousKey = key
      }
      handle(input)
      if (now - lastDisplay >= 100) {
        lastDisplay = now
        const observed = input && {
          x: Math.round(input.x * 10) / 10,
          y: Math.round(input.y * 10) / 10,
          lb: input.enableHeld,
          rb: input.stepModifierHeld,
          b: input.stopHeld,
          direction: input.direction,
          neutral: input.neutral,
          armed: armedRef.current,
        }
        const inputSignature = JSON.stringify(observed)
        if (inputSignature !== previousInput) {
          previousInput = inputSignature
          log.info("Gamepad input", observed)
        }
        const display = JSON.stringify(inputs)
        if (display !== previousDisplay) {
          previousDisplay = display
          setControllers(inputs)
        }
      }
      frame = requestAnimationFrame(poll)
    }
    const loseFocus = () => disarm("Controller disarmed — focus lost")
    const disconnect = () => disarm("Controller disconnected — arm again")
    frame = requestAnimationFrame(poll)
    window.addEventListener("blur", loseFocus)
    window.addEventListener("gamepaddisconnected", disconnect)
    document.addEventListener("visibilitychange", loseFocus)
    return () => {
      cancelAnimationFrame(frame)
      armedRef.current = false
      gesture.current.reset()
      closeInput()
      window.removeEventListener("blur", loseFocus)
      window.removeEventListener("gamepaddisconnected", disconnect)
      document.removeEventListener("visibilitychange", loseFocus)
    }
  }, [options.connectionId, selection, mode])
  const closeInput = useEffectEvent(() => disarm("Controller input ended"))
  const selected =
    controllers.find((entry) => entry.key === selection) ??
    (selection ? null : (controllers[0] ?? null))
  const arm = async () => {
    const input = live.current
    if (
      !options.simulator ||
      !options.connectionId ||
      !document.hasFocus() ||
      busy.current ||
      direct.pending
    )
      return
    if (
      !input?.neutral ||
      input.enableHeld ||
      input.stepModifierHeld ||
      input.stopHeld
    ) {
      setNotice(
        "Centre the stick and release the D-pad, LB, RB and B before arming"
      )
      return
    }
    if (
      !options.allowed({
        type: "jog",
        axis: "X",
        distance: options.step,
        speedScale: options.speed / 100,
      })
    ) {
      setNotice("Simulator is unavailable for arming")
      return
    }
    if (mode === "direct") {
      if (Math.hypot(input.x, input.y) > 0.2) {
        setNotice("Centre the stick before arming Direct")
        return
      }
      setNotice("Arming Direct simulator control…")
      if (!(await direct.begin())) return
    }
    gesture.current.reset()
    gesture.current.take(input)
    armedRef.current = true
    setArmed(true)
    log.info("Gamepad armed", {
      mode,
      step: options.step,
      speed: options.speed,
    })
    setNotice(
      mode === "direct"
        ? "Armed — hold LB to steer"
        : "Armed — hold LB and choose a direction for one step"
    )
  }
  const select = (key: string) => {
    disarm()
    live.current = null
    setSelection(key)
  }
  return {
    mode,
    setMode: (value: "step" | "direct") => {
      disarm("Mode changed — arm again")
      setMode(value)
    },
    pending: direct.pending,
    controllers,
    selected,
    selection: selected?.key ?? "",
    select,
    armed,
    arm,
    disarm,
    notice,
  }
}
