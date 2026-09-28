import { dialog, powerSaveBlocker } from "electron"
import type { BrowserWindow } from "electron"
import { isJobActive } from "../../../src/machine/contract/index.ts"
import type { MachineSnapshot } from "../../../src/machine/contract/index.ts"
import { MachineController } from "../../../src/machine/core/controller.ts"
import { MachineGateway } from "../../../src/machine/core/gateway.ts"
import { formatTrace } from "../../../src/machine/core/protocol-trace.ts"
import { showErrorMessage } from "../diagnostics/diagnostics.ts"
import { log } from "../diagnostics/log.ts"
import type { FileService } from "../services/file-service.ts"
import type { LastDevice } from "./last-device.ts"
import { nodeMachinePorts } from "./node-ports.ts"

/**
 * The machine domain hosted in the main process: one controller, a gateway per
 * principal, and the desktop duties around it (no app suspension while connected, and the
 * last used device remembered for the next launch).
 */
export class MachineHost {
  /** What the core cannot tell the user, such as a snapshot it had to repair, goes to the log. */
  readonly controller = new MachineController({ ...nodeMachinePorts, log })
  /** The app renderer. */
  readonly app = new MachineGateway(this.controller, { kind: "app" })
  /** Native menus: Stop works even when the renderer is unresponsive. */
  readonly system = new MachineGateway(this.controller, { kind: "system" })
  private blocker: number | null = null
  private readonly lastDevice: LastDevice
  private readonly unsubscribe: () => void
  /** What the log last recorded of the connection and the job; a launch starts disconnected. */
  private logged = { connection: "Machine disconnected", job: "" }

  constructor(
    onChange: (snapshot: MachineSnapshot) => void,
    lastDevice: LastDevice
  ) {
    this.lastDevice = lastDevice
    this.unsubscribe = this.controller.subscribe((snapshot) => {
      this.logChanges(snapshot)
      const { status, device } = snapshot.connection
      this.keepAwake(status === "connected")
      if (status === "connected" && device) lastDevice.remember(device)
      onChange(snapshot)
    })
  }

  /**
   * At launch: one attempt to connect to the device the app last connected to. A device that
   * is off or unreachable fails within the handshake timeout, and the snapshot says why.
   */
  async reconnect() {
    const target = await this.lastDevice.read()
    if (!target) return
    // The app's own connection, restored for it: the app principal connects.
    await this.app.connect(target).catch(() => undefined)
  }

  /** Quitting disconnects but never stops the machine, so a running job needs consent. */
  get jobRunning(): boolean {
    return isJobActive(this.controller.snapshot().job)
  }

  /**
   * Whether to quit with a job running. It asks in a sheet on the window, which leaves the
   * main process, and the connection's polling and Stop on it, running.
   */
  async confirmQuit(window: BrowserWindow): Promise<boolean> {
    if (!this.jobRunning) return true
    const { response } = await dialog.showMessageBox(window, {
      type: "warning",
      buttons: ["Quit", "Cancel"],
      defaultId: 1,
      cancelId: 1,
      message: "A job is running on the machine.",
      detail:
        "Quitting disconnects OpenSpindle, but the machine keeps running the program. Use Stop first to end it.",
    })
    return response === 0
  }

  /** Help › Export Protocol Trace: saves the recent exchange with the machine as text. */
  async exportTrace(files: FileService) {
    const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-")
    try {
      await files.save({
        kind: "trace",
        suggestedName: `openspindle-protocol-${stamp}.txt`,
        contents: formatTrace(this.controller.protocolTrace()),
      })
    } catch (error) {
      showErrorMessage(
        "The protocol trace was not exported",
        error instanceof Error ? error.message : String(error)
      )
    }
  }

  dispose() {
    this.unsubscribe()
    this.controller.dispose()
    this.keepAwake(false)
  }

  /** Records the connection's and the job's changes in the app's log. */
  private logChanges({ connection, job }: MachineSnapshot) {
    const { status, device, error } = connection
    const place = device
      ? ` ${device.name} (${device.model}) at ${device.host}:${device.port}`
      : ""
    const connectionLine = `Machine ${status}${place}${error ? `: ${error}` : ""}`
    if (connectionLine !== this.logged.connection) {
      if (error) log.warn(connectionLine)
      else log.info(connectionLine)
      this.logged.connection = connectionLine
    }
    const jobLine = job
      ? `Job ${job.id} "${job.name}" ${job.phase}${job.error ? `: ${job.error}` : ""}`
      : ""
    if (jobLine && jobLine !== this.logged.job) {
      if (job?.error) log.warn(jobLine)
      else log.info(jobLine)
    }
    this.logged.job = jobLine
  }

  private keepAwake(connected: boolean) {
    if (connected && this.blocker === null)
      this.blocker = powerSaveBlocker.start("prevent-app-suspension")
    else if (!connected && this.blocker !== null) {
      powerSaveBlocker.stop(this.blocker)
      this.blocker = null
    }
  }
}
