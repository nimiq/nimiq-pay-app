// TODO: Use https://www.typescript-result.dev?
export type Result<T, E> = {
    ok: true
    value: T
} | {
    ok: false
    error: E
}

export function mapError<O, N>(result: Result<any, O>, fn: (error: O) => N): Result<any, N> {
    if (result.ok) {
        return result
    } else {
        return { ok: false, error: fn(result.error) }
    }
}

export function unwrap<S>(result: Result<S, any>): S {
    if (result.ok) {
        return result.value
    } else {
        throw new Error(`Tried to unwrap an error result: ${typeof result.error === 'string' ? result.error : JSON.stringify(result.error)}`)
    }
}
