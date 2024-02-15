export type Result<T, E> = { data: T; error: undefined } | { data: undefined; error: E }
export type AsyncResult<T, E> = Promise<Result<T, E>>

export type Option<T> = T | undefined
export type AsyncOption<T> = Promise<Option<T>>

export type ResultApi<T, E> = { data: T; error: undefined; hasError: false; status: number } | { data: undefined; hasError: true; error: E | undefined; status: number }
export type AsyncResultApi<T, E> = Promise<ResultApi<T, E>>
