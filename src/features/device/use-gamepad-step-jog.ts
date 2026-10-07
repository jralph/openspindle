import { useEffect, useEffectEvent, useRef, useState } from "react"
import type { MachineCommand } from "@/machine/contract"
import { readController, StepGesture } from "./gamepad-step-input"
import type { ControllerInput } from "./gamepad-step-input"

type Options = {
  connectionId: string | null
  simulator: boolean
  step: number
  speed: number
  allowed: (action: MachineCommand) => boolean
  execute: (action: MachineCommand) => Promise<unknown>
  stop: () => Promise<unknown>
}

/** Renderer input probe; every simulator command still uses the existing machine gateway. */
export function useGamepadStepJog(options: Options) {
  const [controllers, setControllers] = useState<ControllerInput[]>([])
  const [selection, setSelection] = useState("")
  const [armed, setArmed] = useState(false)
  const [notice, setNotice] = useState("Controller input monitor")
  const armedRef = useRef(false)
  const live = useRef<ControllerInput | null>(null)
  const busy = useRef(false)
  const gesture = useRef(new StepGesture())
  const disarm = (message = "Controller disarmed") => {
    armedRef.current = false
    gesture.current.reset()
    setArmed(false)
    setNotice(message)
  }
  const handle = useEffectEvent((input: ControllerInput | null) => {
    live.current = input
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
      disarm("Stop requested — controller disarmed")
      // Stop bypasses the normal command's busy gate.
      void options.stop().catch((error: Error) => setNotice(error.message))
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
      setNotice("Step refused while unavailable — return to centre")
      return
    }
    busy.current = true
    setNotice(`Jog ${direction.axis} ${command.distance} mm…`)
    void options
      .execute(command)
      .then(() => {
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
    let frame = 0
    const poll = (now: number) => {
      if (now - lastFrame > 250 && armedRef.current)
        disarm("Controller disarmed — input delayed")
      lastFrame = now
      const inputs = Array.from(navigator.getGamepads())
        .filter((pad): pad is Gamepad => pad !== null && pad.connected)
        .map(readController)
      const input =
        inputs.find((entry) => entry.key === selection) ??
        (selection ? null : (inputs[0] ?? null))
      if (input?.key !== previousKey) {
        if (armedRef.current) disarm("Controller changed — arm again")
        gesture.current.reset()
        previousKey = input?.key ?? null
      }
      handle(input)
      if (now - lastDisplay >= 100) {
        lastDisplay = now
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
      window.removeEventListener("blur", loseFocus)
      window.removeEventListener("gamepaddisconnected", disconnect)
      document.removeEventListener("visibilitychange", loseFocus)
    }
  }, [options.connectionId, selection])
  const selected =
    controllers.find((entry) => entry.key === selection) ??
    (selection ? null : (controllers[0] ?? null))
  const arm = () => {
    const input = live.current
    if (
      !options.simulator ||
      !options.connectionId ||
      !document.hasFocus() ||
      busy.current
    )
      return
    if (!input?.neutral || input.enableHeld || input.stopHeld) {
      setNotice(
        "Centre the stick and release the D-pad, LB and B before arming"
      )
      return
    }
    gesture.current.reset()
    gesture.current.take(input)
    armedRef.current = true
    setArmed(true)
    setNotice("Armed — hold LB and choose a direction for one step")
  }
  const select = (key: string) => {
    disarm()
    live.current = null
    setSelection(key)
  }
  return {
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
