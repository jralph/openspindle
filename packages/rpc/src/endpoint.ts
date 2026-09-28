import { z } from "zod"
import type {
  Contract,
  EmptyContract,
  EventDataOut,
  EventName,
  EventParamsIn,
  EventSpec,
  Guard,
  Handlers,
  MethodName,
  MethodSpec,
  ParamsIn,
  ResultOut,
} from "./contract.ts"
import { RpcError, fromRpcErrorData, toRpcErrorData } from "./errors.ts"
import type { RpcErrorData } from "./errors.ts"
import { isRpcMessage } from "./transport.ts"
import type { RpcMessage, Transport } from "./transport.ts"

export interface CallOptions {
  readonly signal?: AbortSignal
  /** Overrides the method's timeout; 0 waits indefinitely (user dialogs). */
  readonly timeoutMs?: number
}

export interface SubscribeOptions {
  readonly signal?: AbortSignal
  readonly onEnd?: (error?: RpcError) => void
}

/** The typed view of the other side of a transport. */
export interface Peer<TContract extends Contract> {
  call: <TMethod extends MethodName<TContract>>(
    method: TMethod,
    params: ParamsIn<TContract, TMethod>,
    options?: CallOptions
  ) => Promise<ResultOut<TContract, TMethod>>
  subscribe: <TEvent extends EventName<TContract>>(
    event: TEvent,
    params: EventParamsIn<TContract, TEvent>,
    onData: (data: EventDataOut<TContract, TEvent>) => void,
    options?: SubscribeOptions
  ) => () => void
  close: (reason?: string) => void
  readonly closed: boolean
}

/**
 * Where an endpoint records what its peer is never told: data that failed the contract, and
 * handler failures that were not an RpcError (the peer gets only their message).
 */
export interface EndpointLog {
  readonly warn: (message: string, detail?: unknown) => void
  readonly error: (message: string, detail?: unknown) => void
}

export interface EndpointOptions<
  TLocal extends Contract,
  TRemote extends Contract,
> {
  readonly transport: Transport
  /** Handlers served to the peer; incoming params always pass the contract's schema. */
  readonly serve?: {
    readonly contract: TLocal
    readonly handlers: Handlers<TLocal>
    readonly guard?: Guard
  }
  /** Validates results and events from an untrusted peer when provided. */
  readonly remote?: TRemote
  readonly defaultTimeoutMs?: number
  /** Served calls in flight per budget (each method's `budget`); more fail with BUSY. */
  readonly maxInFlight?: number
  readonly onClose?: (reason?: string) => void
  readonly log?: EndpointLog
}

type LooseMethodHandler = (
  params: unknown,
  context: { signal: AbortSignal }
) => unknown
type LooseEventHandler = (
  params: unknown,
  emit: (data: unknown) => void,
  context: { signal: AbortSignal }
) => () => void

type PendingCall = {
  readonly method: string
  readonly resolve: (value: unknown) => void
  readonly reject: (error: RpcError) => void
}
type ClientSubscription = {
  readonly event: string
  readonly onData: (data: unknown) => void
  readonly onEnd?: (error?: RpcError) => void
  /** Its latest event failed the contract; the log has the first of the run. */
  dropping: boolean
}
type ServedCall = {
  readonly controller: AbortController
  readonly budget: MethodSpec["budget"]
}
type ServedSubscription = {
  unsubscribe: () => void
  readonly controller: AbortController
}

const DEFAULT_TIMEOUT_MS = 30_000
const DEFAULT_MAX_IN_FLIGHT = 64

export function createEndpoint<
  TLocal extends Contract = EmptyContract,
  TRemote extends Contract = EmptyContract,
>(options: EndpointOptions<TLocal, TRemote>): Peer<TRemote> {
  const { transport, serve, remote } = options
  const defaultTimeoutMs = options.defaultTimeoutMs ?? DEFAULT_TIMEOUT_MS
  const maxInFlight = options.maxInFlight ?? DEFAULT_MAX_IN_FLIGHT
  const localMethods = serve?.contract.methods as
    Readonly<Record<string, MethodSpec | undefined>> | undefined
  const localEvents = serve?.contract.events as
    Readonly<Record<string, EventSpec | undefined>> | undefined
  const methodHandlers = serve?.handlers.methods as
    Readonly<Record<string, LooseMethodHandler | undefined>> | undefined
  const eventHandlers = serve?.handlers.events as
    Readonly<Record<string, LooseEventHandler | undefined>> | undefined
  const remoteMethods = remote?.methods as
    Readonly<Record<string, MethodSpec | undefined>> | undefined
  const remoteEvents = remote?.events as
    Readonly<Record<string, EventSpec | undefined>> | undefined

  let nextId = 1
  let closed = false
  const pendingCalls = new Map<number, PendingCall>()
  const subscriptions = new Map<number, ClientSubscription>()
  const servedCalls = new Map<number, ServedCall>()
  const servedSubscriptions = new Map<number, ServedSubscription>()
  /** Methods whose latest result failed the contract; the log has the first of the run. */
  const refusing = new Set<string>()

  const send = (message: RpcMessage) => {
    if (!closed) transport.send(message)
  }
  const sendError = (id: number, error: RpcErrorData) =>
    send({ rpc: 1, kind: "error", id, error })

  /** An ID names one served call or subscription until it ends; it cannot name another. */
  const inUse = (id: number) =>
    servedCalls.has(id) || servedSubscriptions.has(id)
  const reused = (id: number): RpcErrorData => ({
    code: "BUSY",
    message: `Request ${id} is still in flight.`,
  })

  /** Served calls in flight against a budget; undefined is the default budget. */
  const callsIn = (budget: string | undefined) => {
    let count = 0
    for (const call of servedCalls.values()) if (call.budget === budget) count++
    return count
  }

  /** A failure other than an RpcError is unexpected: the log gets its stack. */
  const logFailure = (name: string, error: unknown) => {
    if (error instanceof RpcError) return
    if (error instanceof Error && error.name === "AbortError") return
    options.log?.error(`Serving ${name} failed`, error)
  }

  const parse = (schema: z.ZodType, value: unknown, label: string) => {
    const parsed = schema.safeParse(value)
    if (parsed.success) return parsed.data
    throw new RpcError(
      "INVALID_PARAMS",
      `${label}: ${z.prettifyError(parsed.error)}`
    )
  }

  async function serveCall(id: number, method: string, params: unknown) {
    if (inUse(id)) {
      sendError(id, reused(id))
      return
    }
    const spec = localMethods?.[method]
    const handler = methodHandlers?.[method]
    if (!spec || !handler) {
      sendError(id, { code: "NOT_FOUND", message: `Unknown method ${method}.` })
      return
    }
    const budget = spec.budget
    if (budget !== null && callsIn(budget) >= maxInFlight) {
      sendError(id, { code: "BUSY", message: "Too many requests in flight." })
      return
    }
    const call: ServedCall = { controller: new AbortController(), budget }
    servedCalls.set(id, call)
    const current = () => servedCalls.get(id) === call
    try {
      serve?.guard?.(spec.requires ?? null, method)
      const input = parse(spec.params, params, method)
      const result = await handler(input, { signal: call.controller.signal })
      if (current()) send({ rpc: 1, kind: "result", id, result })
    } catch (error) {
      if (current()) {
        logFailure(method, error)
        sendError(id, toRpcErrorData(error))
      }
    } finally {
      if (current()) servedCalls.delete(id)
    }
  }

  function serveSubscription(id: number, event: string, params: unknown) {
    if (inUse(id)) {
      send({ rpc: 1, kind: "end", id, error: reused(id) })
      return
    }
    const spec = localEvents?.[event]
    const handler = eventHandlers?.[event]
    if (!spec || !handler) {
      send({
        rpc: 1,
        kind: "end",
        id,
        error: { code: "NOT_FOUND", message: `Unknown event ${event}.` },
      })
      return
    }
    const entry: ServedSubscription = {
      unsubscribe: () => {},
      controller: new AbortController(),
    }
    // Registered before the handler runs so an immediate replay is delivered.
    servedSubscriptions.set(id, entry)
    try {
      serve?.guard?.(spec.requires ?? null, event)
      const input = parse(spec.params, params, event)
      entry.unsubscribe = handler(
        input,
        (data) => {
          if (servedSubscriptions.get(id) === entry)
            send({ rpc: 1, kind: "event", id, data })
        },
        { signal: entry.controller.signal }
      )
    } catch (error) {
      servedSubscriptions.delete(id)
      logFailure(event, error)
      send({ rpc: 1, kind: "end", id, error: toRpcErrorData(error) })
    }
  }

  function cancelServed(id: number) {
    const call = servedCalls.get(id)
    if (call) {
      servedCalls.delete(id)
      call.controller.abort()
    }
    const subscription = servedSubscriptions.get(id)
    if (subscription) {
      servedSubscriptions.delete(id)
      subscription.controller.abort()
      subscription.unsubscribe()
    }
  }

  function settleCall(id: number, result: unknown) {
    const pending = pendingCalls.get(id)
    if (!pending) return
    const spec = remoteMethods?.[pending.method]
    if (!spec) {
      pending.resolve(result)
      return
    }
    const parsed = spec.result.safeParse(result)
    if (parsed.success) {
      refusing.delete(pending.method)
      pending.resolve(parsed.data)
      return
    }
    // One record per run, as for events; the log's own calls may be among them.
    if (!refusing.has(pending.method))
      options.log?.warn(
        `Refusing ${pending.method} results that do not match the contract`,
        z.prettifyError(parsed.error)
      )
    refusing.add(pending.method)
    pending.reject(
      new RpcError("INTERNAL", `Invalid response from ${pending.method}.`)
    )
  }

  function deliverEvent(id: number, data: unknown) {
    const subscription = subscriptions.get(id)
    if (!subscription) return
    const spec = remoteEvents?.[subscription.event]
    if (!spec) {
      subscription.onData(data)
      return
    }
    const parsed = spec.data.safeParse(data)
    if (parsed.success) {
      subscription.dropping = false
      subscription.onData(parsed.data)
      return
    }
    // One record per run: a schema out of step with the peer drops every event.
    if (!subscription.dropping)
      options.log?.warn(
        `Dropping ${subscription.event} events that do not match the contract`,
        z.prettifyError(parsed.error)
      )
    subscription.dropping = true
  }

  function endSubscription(id: number, error?: RpcErrorData) {
    const subscription = subscriptions.get(id)
    if (!subscription) return
    subscriptions.delete(id)
    subscription.onEnd?.(error ? fromRpcErrorData(error) : undefined)
  }

  function receive(raw: unknown) {
    if (closed || !isRpcMessage(raw)) return
    switch (raw.kind) {
      case "call":
        void serveCall(raw.id, raw.method, raw.params)
        return
      case "subscribe":
        serveSubscription(raw.id, raw.event, raw.params)
        return
      case "cancel":
        cancelServed(raw.id)
        return
      case "result":
        settleCall(raw.id, raw.result)
        return
      case "error":
        pendingCalls.get(raw.id)?.reject(fromRpcErrorData(raw.error))
        return
      case "event":
        deliverEvent(raw.id, raw.data)
        return
      case "end":
        endSubscription(raw.id, raw.error)
    }
  }

  function shutdown(reason = "The connection closed.") {
    if (closed) return
    closed = true
    stopListening()
    const error = new RpcError("CANCELLED", reason)
    for (const pending of [...pendingCalls.values()]) pending.reject(error)
    pendingCalls.clear()
    for (const subscription of [...subscriptions.values()])
      subscription.onEnd?.(error)
    subscriptions.clear()
    for (const call of servedCalls.values()) call.controller.abort()
    servedCalls.clear()
    for (const subscription of servedSubscriptions.values()) {
      subscription.controller.abort()
      subscription.unsubscribe()
    }
    servedSubscriptions.clear()
    options.onClose?.(reason)
  }

  const stopListening = transport.listen(receive, shutdown)

  return {
    get closed() {
      return closed
    },
    call(method, params, callOptions = {}) {
      if (closed)
        return Promise.reject(
          new RpcError("CANCELLED", "The connection is closed.")
        )
      const id = nextId++
      return new Promise((resolve, reject) => {
        const timeoutMs =
          callOptions.timeoutMs ??
          remoteMethods?.[method]?.timeoutMs ??
          defaultTimeoutMs
        let timer: ReturnType<typeof setTimeout> | undefined
        const cleanup = () => {
          clearTimeout(timer)
          callOptions.signal?.removeEventListener("abort", onAbort)
          pendingCalls.delete(id)
        }
        const fail = (error: RpcError) => {
          if (!pendingCalls.has(id)) return
          cleanup()
          reject(error)
        }
        const abandon = (error: RpcError) => {
          fail(error)
          send({ rpc: 1, kind: "cancel", id })
        }
        const onAbort = () =>
          abandon(new RpcError("CANCELLED", "The request was cancelled."))
        pendingCalls.set(id, {
          method,
          resolve: (value) => {
            cleanup()
            resolve(value as ResultOut<TRemote, typeof method>)
          },
          reject: fail,
        })
        if (callOptions.signal?.aborted) {
          fail(new RpcError("CANCELLED", "The request was cancelled."))
          return
        }
        callOptions.signal?.addEventListener("abort", onAbort, { once: true })
        if (timeoutMs > 0)
          timer = setTimeout(
            () =>
              abandon(
                new RpcError("TIMEOUT", `${method} did not respond in time.`)
              ),
            timeoutMs
          )
        send({ rpc: 1, kind: "call", id, method, params })
      })
    },
    subscribe(event, params, onData, subscribeOptions = {}) {
      if (closed) {
        subscribeOptions.onEnd?.(
          new RpcError("CANCELLED", "The connection is closed.")
        )
        return () => {}
      }
      if (subscribeOptions.signal?.aborted) return () => {}
      const id = nextId++
      const unsubscribe = () => {
        subscribeOptions.signal?.removeEventListener("abort", unsubscribe)
        if (!subscriptions.delete(id)) return
        send({ rpc: 1, kind: "cancel", id })
      }
      subscriptions.set(id, {
        event,
        onData: onData as (data: unknown) => void,
        onEnd: (error) => {
          subscribeOptions.signal?.removeEventListener("abort", unsubscribe)
          subscribeOptions.onEnd?.(error)
        },
        dropping: false,
      })
      subscribeOptions.signal?.addEventListener("abort", unsubscribe, {
        once: true,
      })
      send({ rpc: 1, kind: "subscribe", id, event, params })
      return unsubscribe
    },
    close(reason) {
      shutdown(reason)
      transport.close()
    },
  }
}
