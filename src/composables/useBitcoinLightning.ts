export async function parseBitcoinLightningInvoice(url: string) {
  const { decode } = await import('light-bolt11-decoder')
  return decode(url)
}
