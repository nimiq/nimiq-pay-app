export type Result<T, E> = { data: T; error: undefined } | { data: undefined; error: E }
export type AsyncResult<T, E> = Promise<Result<T, E>>

export type Option<T> = T | undefined
export type AsyncOption<T> = Promise<Option<T>>

export type ResultApi<T, E> = { data: T; error: undefined; hasError: false; status: number } | { data: undefined; hasError: true; error: E | undefined; status: number }
export type AsyncResultApi<T, E> = Promise<ResultApi<T, E>>

// https://github.com/lnurl/luds/blob/901e3830e8def3cd2590de3e7e543db2c49313d8/06.md?plain=1#L96-L99
export interface LNServiceResponse {
  pr: string // bech32-serialized lightning invoice
  routes: [] // an empty array
}
