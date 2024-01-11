# Nimiq Pay

## Known issues

### Database encryption on Web

We are not encrypting the database on Web. This is because the library that we use to create a SQL database on the browser does not support
encryption. We are using `sql.js` under the hood, and it does not support encryption. **Android and iOS do support encryption**.

### Camera feed

The camera feed in mobile is weird. The Camera API for both Android and iOS, creates a camera feed that is set behind the WebView.
This creates an interesting challenge, since we need to make a "hole" in the WebView to show the camera feed. You can read more about this
in the [useCameraFeed](./src/composables/useCameraFeed.ts) composable. In web, we just create a video element where we show the camera feed. Ez.

### Mismatch between the prices shown in the Payment Preview and the Transaction Details

This is a known issue, and I will try to explain it here with an example (not sure if this comment should be here or not :P)

Let's say that Pepito wants to pay 10 NIM to Juanito using CPL (or any other rail that DOES NOT uses the default Price API)
When Pepito is about to pay, the price in the Preview will be fetched from the CPL API. We fetch that value when we parse the CPL link.

In the app database, we store the transaction data, but we do not store the fiat price of that moment. We only store the amount of the tx.
 
When Pepito wants to see the transaction details, we will fetch the price from the default Price API (using the timestamp of the tx),
and that price might differ from the one that we fetched when we parsed the CPL link.
 
There is no easy way to fix this.

#### FAQs about prices API mismatch
 
##### Why not store the fiat price within the tx?

For doing that we would need to select a Fiat currency. This will bring problems because the user might change the fiat currency in the future.
That's why we decided to keep the transaction and the prices in two different tables.
 
##### Why not store a reference of the CPL link in the tx?

We could do that, and then we could fetch the price from the CPL API when we want to see the transaction details. But we have to think that we
not only support CPL, but we also support other rails that do not use the default Price API. So we would need to store a reference for each
rail, and that would be a mess.
 
##### Why not store the fiat price of the tx in the database?

We wouldn't have a way of fetching the price of the tx if the user logs out and logs in again. We would have the same issue.
 