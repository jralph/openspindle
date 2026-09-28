import type { z } from "zod"

/** A capability name checked by the serving side's guard before a handler runs. */
export type Requirement = string

export interface MethodSpec<
  TParams extends z.ZodType = z.ZodType,
  TResult extends z.ZodType = z.ZodType,
> {
  readonly params: TParams
  readonly result: TResult
  readonly requires?: Requirement | null
  readonly timeoutMs?: number
  /**
   * The serving side's in-flight budget the call counts against: methods naming the same
   * budget share its `maxInFlight` calls, and methods without one share the default budget,
   * so a full budget refuses only its own methods. `null` is never refused (Stop).
   */
  readonly budget?: string | null
}

export interface EventSpec<
  TParams extends z.ZodType = z.ZodType,
  TData extends z.ZodType = z.ZodType,
> {
  readonly params: TParams
  readonly data: TData
  readonly requires?: Requirement | null
}

/** One side's callable surface: request/response methods and subscribable events. */
export interface Contract {
  readonly methods: Readonly<Record<string, MethodSpec>>
  readonly events: Readonly<Record<string, EventSpec>>
}

export const defineContract = <const TContract extends Contract>(
  contract: TContract
): TContract => contract

export const EMPTY_CONTRACT = defineContract({ methods: {}, events: {} })
export type EmptyContract = typeof EMPTY_CONTRACT

export type MethodName<TContract extends Contract> =
  keyof TContract["methods"] & string
export type EventName<TContract extends Contract> = keyof TContract["events"] &
  string

type MethodOf<
  TContract extends Contract,
  TMethod extends MethodName<TContract>,
> = TContract["methods"][TMethod]
type EventOf<
  TContract extends Contract,
  TEvent extends EventName<TContract>,
> = TContract["events"][TEvent]

export type ParamsIn<
  TContract extends Contract,
  TMethod extends MethodName<TContract>,
> = z.input<MethodOf<TContract, TMethod>["params"]>
export type ParamsOut<
  TContract extends Contract,
  TMethod extends MethodName<TContract>,
> = z.output<MethodOf<TContract, TMethod>["params"]>
export type ResultIn<
  TContract extends Contract,
  TMethod extends MethodName<TContract>,
> = z.input<MethodOf<TContract, TMethod>["result"]>
export type ResultOut<
  TContract extends Contract,
  TMethod extends MethodName<TContract>,
> = z.output<MethodOf<TContract, TMethod>["result"]>
export type EventParamsIn<
  TContract extends Contract,
  TEvent extends EventName<TContract>,
> = z.input<EventOf<TContract, TEvent>["params"]>
export type EventParamsOut<
  TContract extends Contract,
  TEvent extends EventName<TContract>,
> = z.output<EventOf<TContract, TEvent>["params"]>
export type EventDataIn<
  TContract extends Contract,
  TEvent extends EventName<TContract>,
> = z.input<EventOf<TContract, TEvent>["data"]>
export type EventDataOut<
  TContract extends Contract,
  TEvent extends EventName<TContract>,
> = z.output<EventOf<TContract, TEvent>["data"]>

export interface CallContext {
  /** Aborted when the caller cancels, times out or the transport closes. */
  readonly signal: AbortSignal
}

export type Handlers<TContract extends Contract> = {
  readonly methods: {
    readonly [TMethod in MethodName<TContract>]: (
      params: ParamsOut<TContract, TMethod>,
      context: CallContext
    ) => ResultIn<TContract, TMethod> | Promise<ResultIn<TContract, TMethod>>
  }
  readonly events: {
    readonly [TEvent in EventName<TContract>]: (
      params: EventParamsOut<TContract, TEvent>,
      emit: (data: EventDataIn<TContract, TEvent>) => void,
      context: CallContext
    ) => () => void
  }
}

/** Throws a PERMISSION_DENIED RpcError when the requirement is not granted. */
export type Guard = (requires: Requirement | null, name: string) => void
