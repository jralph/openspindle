import { useId, useState } from "react"
import { useForm } from "@tanstack/react-form"
import { useQuery } from "@tanstack/react-query"
import { Cpu, LoaderCircle, RefreshCw } from "lucide-react"
import { z } from "zod"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import {
  Card,
  CardAction,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { isLocalIPv4 } from "@/machine/contract"
import type { ConnectTarget } from "@/machine/contract"
import { useHost } from "@/platform/host-context"
import {
  machineErrorCode,
  machineKeys,
  useConnectMachine,
  useDisconnectMachine,
  useMachineSnapshot,
} from "@/platform/machine"

const ManualTargetSchema = z.object({
  host: z.string().trim().refine(isLocalIPv4, "Enter a local IPv4 address."),
  port: z
    .string()
    .refine(
      (port) =>
        /^\d{1,5}$/.test(port) && Number(port) >= 1 && Number(port) <= 65535,
      "Enter a port from 1 to 65535."
    ),
})

const targetId = (target: Pick<ConnectTarget, "host" | "port">) =>
  `${target.host}:${target.port}`

/** The controller refused the request until the user confirms it: the picker asks. */
const needsConfirmation = (error: Error | null) =>
  machineErrorCode(error) === "confirmation-required"

/** The error to show under the picker: a refusal waiting for confirmation asks instead. */
const failure = (error: Error | null) =>
  needsConfirmation(error) ? null : error

/**
 * A disconnect, or a connect to another device, that the controller refused while a job runs:
 * the question, the controller's reason, and the request to send again, confirmed.
 */
type LeavingJob = {
  readonly title: string
  readonly reason: string
  readonly action: string
  readonly confirm: () => void
}

/** Asks before leaving a running job, as quitting does. */
function LeavingJobDialog({
  leaving,
  onClose,
}: {
  leaving: LeavingJob
  onClose: () => void
}) {
  return (
    <AlertDialog
      open
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{leaving.title}</AlertDialogTitle>
          <AlertDialogDescription>{leaving.reason}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            onClick={() => {
              onClose()
              leaving.confirm()
            }}
          >
            {leaving.action}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

export function DevicePicker({ close }: { close: () => void }) {
  const machine = useHost().machine
  const fieldId = useId()
  const snapshot = useMachineSnapshot()
  const device = snapshot.connection.device
  // Discovery is passive and shared by the main process; "Search again" simply refetches.
  const discovery = useQuery({
    queryKey: machineKeys.discovery,
    queryFn: () => machine.discover(),
    staleTime: 0,
    gcTime: 0,
    refetchOnWindowFocus: false,
  })
  const connect = useConnectMachine()
  const disconnect = useDisconnectMachine()
  const [leaving, setLeaving] = useState<LeavingJob | null>(null)
  const busy = connect.isPending || disconnect.isPending
  const askToLeave = (error: Error, ask: Omit<LeavingJob, "reason">) => {
    if (needsConfirmation(error)) setLeaving({ ...ask, reason: error.message })
  }
  const connectTo = (target: ConnectTarget, confirmed = false) =>
    connect.mutate(
      { ...target, confirmed },
      {
        onSuccess: close,
        onError: (error) =>
          askToLeave(error, {
            title: `Connect to ${target.name ?? target.host}?`,
            action: "Connect",
            confirm: () => connectTo(target, true),
          }),
      }
    )
  const disconnectFrom = (name: string, confirmed = false) =>
    disconnect.mutate(
      { confirmed },
      {
        onError: (error) =>
          askToLeave(error, {
            title: `Disconnect from ${name}?`,
            action: "Disconnect",
            confirm: () => disconnectFrom(name, true),
          }),
      }
    )
  const form = useForm({
    defaultValues: { host: "", port: "2222" },
    validators: { onSubmit: ManualTargetSchema },
    onSubmit: ({ value }) =>
      connectTo({ host: value.host.trim(), port: Number(value.port) }),
  })
  const devices = discovery.data ?? []
  const pendingId = connect.isPending ? targetId(connect.variables) : null
  const manualPending =
    pendingId !== null &&
    !devices.some((found) => targetId(found) === pendingId)
  const scanning = discovery.isFetching
  const error =
    failure(connect.error) ?? failure(disconnect.error) ?? discovery.error

  return (
    <FieldGroup>
      {device && (
        <Card size="sm">
          <CardHeader>
            <CardTitle className="flex min-w-0 items-center gap-2">
              <Cpu aria-hidden="true" />
              <span className="truncate">{device.name}</span>
            </CardTitle>
            <CardDescription>{device.host} · Connected</CardDescription>
            <CardAction>
              <Button
                variant="outline"
                disabled={busy}
                onClick={() => disconnectFrom(device.name)}
              >
                {disconnect.isPending ? "Disconnecting…" : "Disconnect"}
              </Button>
            </CardAction>
          </CardHeader>
        </Card>
      )}
      <FieldSet>
        <FieldLegend
          variant="label"
          className="flex w-full items-center justify-between gap-3"
        >
          <span>On your network</span>
          <Button
            variant="ghost"
            size="sm"
            disabled={scanning || busy}
            onClick={() => void discovery.refetch()}
          >
            {scanning ? (
              <LoaderCircle data-icon="inline-start" className="animate-spin" />
            ) : (
              <RefreshCw data-icon="inline-start" />
            )}
            {scanning ? "Searching…" : "Search again"}
          </Button>
        </FieldLegend>
        <div
          className="flex max-h-64 flex-col gap-2 overflow-auto"
          aria-live="polite"
        >
          {!devices.length && (
            <FieldDescription className="py-6 text-center">
              {scanning ? "Searching for devices…" : "No devices found"}
            </FieldDescription>
          )}
          {devices.map((found) => {
            const id = targetId(found)
            const connected = device !== null && targetId(device) === id
            let label = "Connect"
            if (connected) label = "Connected"
            if (pendingId === id) label = "Connecting…"
            return (
              <Card key={id} size="sm">
                <CardHeader>
                  <CardTitle className="flex min-w-0 items-center gap-2">
                    <Cpu aria-hidden="true" />
                    <span className="truncate">{found.name}</span>
                  </CardTitle>
                  <CardDescription>
                    {id}
                    {found.busy && !connected ? " · In use" : ""}
                  </CardDescription>
                  <CardAction>
                    <Button
                      variant="outline"
                      disabled={busy || found.busy || connected}
                      onClick={() =>
                        connectTo({
                          host: found.host,
                          port: found.port,
                          name: found.name,
                        })
                      }
                    >
                      {label}
                    </Button>
                  </CardAction>
                </CardHeader>
              </Card>
            )
          })}
        </div>
      </FieldSet>
      <form
        onSubmit={(event) => {
          event.preventDefault()
          void form.handleSubmit()
        }}
      >
        <FieldSet>
          <FieldLegend variant="label">Connect by IP address</FieldLegend>
          <FieldGroup className="grid grid-cols-[minmax(0,1fr)_6rem] items-start gap-3 sm:grid-cols-[minmax(0,1fr)_6rem_auto]">
            <form.Field name="host">
              {(field) => (
                <Field
                  className="min-w-0"
                  data-invalid={!field.state.meta.isValid}
                >
                  <FieldLabel htmlFor={`${fieldId}-host`}>
                    IP address
                  </FieldLabel>
                  <Input
                    id={`${fieldId}-host`}
                    autoComplete="off"
                    spellCheck={false}
                    placeholder="192.168.1.100"
                    value={field.state.value}
                    onBlur={field.handleBlur}
                    onChange={(event) => field.handleChange(event.target.value)}
                    aria-invalid={!field.state.meta.isValid}
                    disabled={busy}
                  />
                  <FieldError errors={field.state.meta.errors} />
                </Field>
              )}
            </form.Field>
            <form.Field name="port">
              {(field) => (
                <Field data-invalid={!field.state.meta.isValid}>
                  <FieldLabel htmlFor={`${fieldId}-port`}>Port</FieldLabel>
                  <Input
                    id={`${fieldId}-port`}
                    type="number"
                    className="font-numeric"
                    min="1"
                    max="65535"
                    value={field.state.value}
                    onBlur={field.handleBlur}
                    onChange={(event) => field.handleChange(event.target.value)}
                    aria-invalid={!field.state.meta.isValid}
                    disabled={busy}
                  />
                  <FieldError errors={field.state.meta.errors} />
                </Field>
              )}
            </form.Field>
            <form.Subscribe
              selector={(state) => state.values.host.trim().length > 0}
            >
              {(hasHost) => (
                <Button
                  type="submit"
                  className="col-span-2 sm:col-span-1 sm:mt-6"
                  disabled={busy || !hasHost}
                >
                  {manualPending ? "Connecting…" : "Connect"}
                </Button>
              )}
            </form.Subscribe>
          </FieldGroup>
        </FieldSet>
      </form>
      {error && <FieldError>{error.message}</FieldError>}
      {leaving && (
        <LeavingJobDialog leaving={leaving} onClose={() => setLeaving(null)} />
      )}
    </FieldGroup>
  )
}
