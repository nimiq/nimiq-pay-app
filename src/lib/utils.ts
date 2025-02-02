/**
 * Execute a promise or throw an error if it takes longer than the specified timeout.
 */
export function promiseWithTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  let timeoutId: number

  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(new Error(`Operation timed out after ${timeoutMs} milliseconds`))
    }, timeoutMs)
  })

  return Promise.race([promise, timeoutPromise])
    .finally(() => clearTimeout(timeoutId))
}

export function base64ToImageData(base64Str: string): Promise<ImageData> {
  return new Promise((resolve, reject) => {
    // If the base64 string is missing the prefix, assume it's a PNG.
    const dataURL = base64Str.startsWith('data:')
      ? base64Str
      : `data:image/png;base64,${base64Str}`

    const img = new Image()

    img.onload = () => {
      const canvas: HTMLCanvasElement = document.createElement('canvas')
      canvas.width = img.width
      canvas.height = img.height

      const ctx = canvas.getContext('2d')
      if (!ctx) {
        reject(new Error('Unable to get 2D context'))
        return
      }

      ctx.drawImage(img, 0, 0)

      try {
        const imageData: ImageData = ctx.getImageData(0, 0, canvas.width, canvas.height)
        resolve(imageData)
      }
      catch (err) {
        reject(err)
      }
    }

    img.onerror = (err) => {
      reject(err)
    }

    img.src = dataURL
  })
}
