import type {
  ApiArgs,
  ApiErrorPayload,
  ApiEvent,
  ApiEvents,
  ApiMethod,
  ApiResponse,
  ApiResult,
  ErrorCode
} from '@shared/api'

export class ApiError extends Error {
  code: ErrorCode
  detail?: string
  constructor(p: ApiErrorPayload) {
    super(p.message)
    this.code = p.code
    this.detail = p.detail
  }
}

export async function call<M extends ApiMethod>(
  method: M,
  args: ApiArgs<M>
): Promise<ApiResult<M>> {
  const res = (await window.spoon.invoke(method, args)) as ApiResponse<ApiResult<M>>
  if (!res.ok) throw new ApiError(res.error)
  return res.value
}

export function on<E extends ApiEvent>(
  event: E,
  listener: (payload: ApiEvents[E]) => void
): () => void {
  return window.spoon.on(event, listener as (p: unknown) => void)
}

let seq = 0
export const newOpId = (): string => `op-${Date.now()}-${++seq}`

export const isMac = (): boolean => window.spoon.platform === 'darwin'
