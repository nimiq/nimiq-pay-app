# Mini App widgets

A widget is a small card that a Mini App puts on the Nimiq Pay Home screen. You describe what it shows (a label, a value, a chart); Nimiq Pay draws it. No code of yours runs on Home.

This page is the reference for Mini App authors. The code is the authority if the two disagree: the parser is `src/lib/mini-app-widgets.ts`.

## 1. What a widget is

- Nimiq Pay draws every widget itself, so it always looks like Nimiq Pay and can be restyled in one place. You send meaning (text, numbers, a tone), never layout, colours, fonts or images.
- The user picks the size of each widget: `icon`, `small`, `medium` or `large`. You list the sizes your widget supports; the first one is the default.
- The card header (your Mini App's icon and name, and the "⋯" menu) belongs to Nimiq Pay. It shows the catalog name when the widget's folder equals the catalog entry's URL, otherwise the name your widget file declares (see `name` below), otherwise the host and folder (`name.github.io/my-app`). The address always appears in the widget's menu and in the gallery. A widget has no buttons or inputs: tapping the card opens your Mini App.
- A Mini App only runs while it is open, so a widget changes in three ways: your Mini App sends a new state while it is open, Nimiq Pay follows scheduled and on-chain triggers you described earlier, or Nimiq Pay polls a URL on your server (section 5).

## 2. The widget file

Serve a `nimiq-pay-widgets.json` file next to your Mini App. It lists up to 6 widgets (an empty list is valid, see below) and is at most 32 KB; the size is checked after the download, so keep the file small. Nimiq Pay gives the request 15 seconds. The file may redirect within your own origin (up to three times); a redirect to another host is refused.

**Where it may live.** Prefer your Mini App's own folder. Nimiq Pay reads the path of the page your Mini App was opened at (after any redirect on launch) as a folder, then tries its two nearest parent folders, then the site root, and the first valid file wins. For example `/a/b/c/d` tries `/a/b/c/d/`, `/a/b/c/`, `/a/b/` and `/` (the deeper parents are skipped), and `/my-app/index.html` tries `/my-app/index.html/`, `/my-app/` and `/`. A 404, any other 4xx answer, a body that is not JSON or an invalid file moves the search up a folder. A network error, a timeout, a 5xx answer or a 429 stops it, so a parent folder's file is never taken for your Mini App when your own folder could not be reached. The folder where the file was found is the widget's *scope*, and two Mini Apps on one site stay apart by scope.

**Relative URLs** in the file (for example `"path": "./"`) resolve against the folder where the file was found. `path` and `refresh.url` may point anywhere on your site's origin and never off it. Everything must be https; plain http and IP or local hosts only work in development builds of Nimiq Pay.

**Keep each `path` (also on a row) in the widget's folder or at most two levels below it.** A tap opens your Mini App at that page, and the folder search above starts from it: for a widget in `/my-app/`, `/my-app/orders/12` still finds `/my-app/nimiq-pay-widgets.json`, but `/my-app/orders/12/receipt` does not, so the Mini App opened from the widget could not update it.

**Fields.**

| Field | Meaning |
| --- | --- |
| `v` | Always `1`. |
| `name` | Optional. Your Mini App's name, shown on your widgets instead of your site's address; the address stays in each widget's menu and in the gallery. At most 24 characters (longer text is cut, an emoji counts once), not translated. A Mini App in the Nimiq Pay catalog shows its catalog name instead. Like every text, a `name` that is not a non-empty string makes the file invalid. |
| `widgets[].id` | Lower-case letters, digits and dashes, not starting with a dash, at most 32 characters, unique in the file. |
| `widgets[].name` | Shown in the gallery and the consent sheet. At most 32 characters (longer text is cut). |
| `widgets[].description` | Optional, at most 120 characters. |
| `widgets[].sizes` | Non-empty subset of `icon`, `small`, `medium`, `large`. The first is the default. |
| `widgets[].content` | The widget's *resting state*: what it shows when nothing else was sent, and its preview in the gallery (section 3). |
| `widgets[].refresh` | Optional `{ "url", "every" }` so the resting state updates from your server (section 5). |
| `widgets[].translations` | Optional, keyed by two-letter language (`"es"`). Each entry may repeat `name`, `description` and `content`. Nimiq Pay picks the user's language and falls back to the top-level fields. |

Live states you send are not translated by this field: send them in your current language. Refresh URLs get the user's language as `lang`.

**Re-reading and withdrawal.**

- Nimiq Pay reads the file when the gallery opens, and when your Mini App opens unless the folder it opened in was checked in the last day (then on your Mini App's first widget call instead), and keeps the result until Nimiq Pay is restarted. For widgets that are already on Home it re-checks the file about once a day.
- An edit to the file therefore reaches a widget on Home at the next daily re-check, up to a day later, not when the user reopens the Mini App. To see an edit at once while testing, restart Nimiq Pay, then remove the widget and add it again.
- A widget is removed from Home only when a valid file no longer declares it. An empty list, `{ "v": 1, "widgets": [] }`, withdraws every widget of that folder; `add` then fails with "declares no widget".
- A missing or broken file (404, invalid, a network or server error) keeps the widgets on Home as they are.
- **Do not move the file to another folder** once users have added widgets: those widgets stay tied to the old folder, so your Mini App can no longer update or remove them (the user still can, from the "⋯" menu). Adding the widget again picks up the new folder.
- A Mini App hosted in a subfolder shows up in the gallery once the user has opened it.

A widget file for a swap Mini App served at the site root:

```json
{
  "v": 1,
  "widgets": [{
    "id": "swap",
    "name": "Swap status",
    "description": "Follows your current swap, or starts a new one.",
    "sizes": ["small", "medium", "large"],
    "content": { "label": "No swap in progress", "value": { "text": "Start a swap" }, "info": "Any coin, any network", "path": "./" }
  }]
}
```

A Mini App hosted on GitHub Pages in a project folder, `https://name.github.io/my-app/`. Put the file at `https://name.github.io/my-app/nimiq-pay-widgets.json`; the relative `path` below opens `https://name.github.io/my-app/?tab=rewards` (fragments are kept, so a hash-routed Mini App can write `"./#/rewards"`):

```json
{
  "v": 1,
  "widgets": [{
    "id": "rewards",
    "name": "Rewards",
    "sizes": ["small", "medium"],
    "content": { "label": "Rewards", "value": { "text": "Open to collect" }, "path": "./?tab=rewards" }
  }]
}
```

If the file is at `https://name.github.io/nimiq-pay-widgets.json` instead (the site root), every Mini App on `name.github.io` that has no file of its own in a nearer folder would find it.

## 3. Content

Content describes meaning. Every text is trimmed, cut to its cap counted in whole characters (an emoji counts once), and stripped of control, line-separator and bidirectional-control characters. Text that is too long is cut, not refused. A character built from more than 12 code points or 6 combining marks ends the text at that point. A text that is empty (or only invisible characters) after this is refused.

```ts
interface WidgetContent {
  label?: string // small heading, at most 24 characters
  value: WidgetValue // the big line
  info?: string | { live: LiveValue } // the line under the value, at most 40 characters
  tone?: 'neutral' | 'positive' | 'attention' | 'negative' // default 'neutral'
  progress?: number // 0 to 1, a bar on medium and large
  countdown?: { label: string, until: number } // a time in ms; see the rules below
    | { label: string, untilNimiqHeight: number } // a Nimiq block height (one block per second)
  rows?: { label: string, value: WidgetValue, path?: string }[] // at most 3, large only
  chart?: { kind: 'line' | 'bars', points: number[] } // 2 to 48 points, large only
    | { kind: 'line', priceHistory: { asset: Asset, range: '24h' | '7d' | '30d' } }
  path?: string // where a tap opens the Mini App
}

type WidgetValue
  = | { text: string } // at most 28 characters
    | { amount: string, currency: string } // "0.05" + "ETH"; ISO 4217 codes (EUR, USD) format as money
    | { live: LiveValue } // filled in by Nimiq Pay

type LiveValue
  = | { nimiqBalance: string } // a Nimiq address
    | { nimiqStake: { address: string, part: 'active' | 'inactive' } }
    | { usdtBalance: string } // a Polygon address
    | { price: Asset } // in the user's currency
    | { priceChange: { asset: Asset, range: '24h' | '7d' | '30d' } } // coloured by Nimiq Pay

type Asset = 'NIM' | 'BTC' | 'ETH' | 'USDT'
```

**What each size shows.**

| Size | Shows |
| --- | --- |
| `icon` | Your Mini App's icon and name, and a dot in the tone's colour (a neutral tone shows no dot). |
| `small` | Label, value and info. |
| `medium` | The same, plus the countdown on the right and the progress bar. |
| `large` | The same, plus the rows (each can link with its own `path`) or the chart. When a state has both rows and a chart, the rows win. |

**Rules the parser enforces.**

- A value, countdown, chart or trigger that carries two kinds at once (for example `text` and `amount`) is refused.
- `amount` matches `^\d{1,18}(\.\d{1,18})?$`; `currency` matches `^[A-Z0-9]{2,8}$`.
- Chart points are finite numbers within plus or minus 1e15.
- Nimiq addresses must have a valid checksum. Polygon addresses are `0x` plus 40 hex digits, transaction hashes 64 hex digits (Nimiq) or `0x` plus 64 (Polygon).
- A `path` (also on a row) that is not a string refuses the state. A `path` that leaves your site's origin, is not https, carries a user name or password, or does not parse is dropped: the tap then opens the widget's folder.
- Times (`until`, `at`, `since`, `expiresAt`) must be within 30 days of now. Unknown fields are dropped.
- A `countdown` with `until` makes Nimiq Pay refresh once when it reaches 0, but only for a state that has a `refresh`. A countdown with `untilNimiqHeight` does not.
- A `path` keeps its URL fragment (`#...`), so a hash-routed Mini App opens at the right route; only the fragment of `refresh.url` is dropped. Relative URLs in states you push and in refresh answers resolve against the folder where the file was found.

**Live values.** Nimiq Pay looks them up with its own Nimiq and Polygon clients and its own price service (cached at 10-minute checkpoints). Your Mini App never sees the results. A widget whose content uses only live values needs no code (see the example in section 7).

## 4. `window.nimiqPay.widgets`

Nimiq Pay injects this object into your Mini App's top frame (frames your page embeds do not get it). Versions of Nimiq Pay without widgets do not have it, so check first:

```js
if (window.nimiqPay?.widgets) {
  // offer an "Add to Home" button
}
```

| Call | Does |
| --- | --- |
| `add(id)` | Asks the user (a native sheet: "Add Swap status to Home?"). Resolves `true` if the widget is on Home afterwards, `false` if the user said no. Rejects when the file cannot be read or declares no such widget, or when Home already holds 10 widgets. |
| `update(id, state)` | Replaces the widget's state. No prompt, and only for a widget already on Home. Resolves `true` when applied, `false` when it was not (not on Home, the request was refused, or the widget file could not be found). Rejects with `Invalid widget state: <field>: <problem>` when the state is invalid; the widget keeps its last good state. |
| `update(id, null)` | Back to the resting state from the widget file. |
| `remove(id)` | Removes the widget from Home. |
| `list()` | The ids of your Mini App's widgets that are on Home. |

`add` asks the user once per widget while the Mini App stays open; concurrent calls share one sheet, and after a "no" it answers `false` straight away until the Mini App is closed. Nimiq Pay reads the widget file once per run of Nimiq Pay (until it is restarted). The gallery is the other way to add a widget: choosing "Add" there is the consent.

Requests are accepted only from the site the Mini App session belongs to. They are refused while the in-app browser shows another site, while it navigates between sites, while a popup your page opened is open, and after Nimiq Pay reloads behind an open Mini App until the page has loaded again. Refused calls fail quietly: `add` rejects, `update` answers `false`, `remove` does nothing and `list` answers `[]`.

## 5. Keeping a widget current

```ts
interface WidgetState {
  content: WidgetContent
  expiresAt?: number // back to the resting state after this time (ms)
  next?: { on: Trigger, state: WidgetState | null }[] // changes Nimiq Pay applies by itself
  refresh?: { url: string, every: number } // for Mini Apps with a server
}

type Trigger
  = | { at: number } // a time (ms)
    | { nimiqTx: string, status: 'confirmed' | 'failed' } // a Nimiq transaction hash
    | { nimiqPayment: { to: string, minValue: string, since: number } } // NIM amount, `since` in ms
    | { nimiqHeight: number } // a Nimiq block height
    | { polygonTx: string, status: 'confirmed' | 'failed' } // a Polygon transaction hash
```

**Path 1: while the Mini App is open.** Call `update` whenever your own state changes.

**Path 2: after it closes, without a server.** Nimiq Pay follows `next`. The first trigger that fires wins and its `state` replaces the current one (`null` returns to the resting state); that state may carry its own `next`. A `nimiqPayment` fires on one transaction to `to` that is executed successfully, has a value of at least `minValue` NIM (rounded up to the next luna) and a timestamp of `since` or later, found among the address's newest 25 transactions. Split payments do not add up, and on a busy address an older payment can fall out of that window. Chain triggers use Nimiq Pay's own Nimiq client and Polygon connection, and nothing they look up goes back to your Mini App.

**Path 3: after it closes, with a server.** Nimiq Pay calls `refresh.url`, no more often than `every` seconds (clamped to 60 s through 24 h), apart from pull to refresh on Home, the one refresh when an `until` countdown ends, and the first fetch right after a widget with a resting-state `refresh` is added. Pull to refresh and the countdown refresh still wait until a minute has passed since the last request. The answer is a state: JSON `null` returns the widget to its resting state, and an answer without `refresh` stops the polling. Nimiq Pay adds `lang` and `network` (`mainnet` or `testnet`) to the query, replacing any you wrote yourself, and keeps the rest of your query exactly as written. It sends nothing else: no cookies, no wallet data.

The refresh endpoint must:

- answer with `Access-Control-Allow-Origin: *`, because Nimiq Pay fetches it from its own web view without cookies; a CORS refusal looks like a network error, so the widget backs off and shows "Not updated since ...";
- answer HTTP 200 (204 and 304 count as failures) and not redirect (a redirect is an error);
- answer within 15 seconds and with at most 8 KB;
- be https on your site's origin, with no credentials in the URL; and
- identify what to show by something in the URL (for example `?id=XyZ`), since there are no cookies.

A minimal endpoint (Cloudflare Worker style):

```js
export default {
  async fetch(request) {
    const url = new URL(request.url)
    const state = await stateFor(url.searchParams.get('id'), url.searchParams.get('lang'))
    return Response.json(state, {
      headers: { 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'no-store' },
    })
  },
}
```

A failing refresh keeps the last state; the interval doubles per failure up to 30 minutes, and after three failures the card adds "Not updated since 14:05". Pull to refresh on Home refreshes widgets right away, but never more than once a minute per widget.

**Rules.**

- A fired trigger or a refresh answer replaces the whole state, including its own `next` and `refresh`.
- Triggers are evaluated in order and the first that fires wins. A trigger whose lookup cannot answer yet (no consensus right after Nimiq Pay starts, a lookup error or timeout) holds back every trigger after it until it can, so a deadline (`at`) never wins over a payment that could not be checked. A Nimiq transaction (`nimiqTx`) is different: while Nimiq Pay has consensus, any lookup failure counts as not confirmed yet, so a hash that was never sent does not hold back the triggers after it and a later `at` can fire. Only a lookup without consensus, or one that times out, holds them back. Give states with lookup triggers an `expiresAt`.
- A passed `expiresAt` returns the widget to its resting state and ends that state's triggers and refreshes.
- Nimiq Pay checks triggers and refreshes only while Home is on screen and Nimiq Pay is in the foreground; chain lookups at most every 30 seconds, at most 10 per check across all widgets (live balance values count as lookups too). Checks rotate across widgets so each gets a turn, and a state with lookup triggers is checked only when all of its lookups fit in what is left.
- A lookup that fails never fires a trigger.

## 6. Limits and what is refused

| Limit | Value |
| --- | --- |
| Widgets in one file | 6 |
| Widgets on Home, all Mini Apps | 10 |
| Label, value text, info, row label (longer text is cut, not refused) | 24, 28, 40, 20 characters |
| Countdown label | 24 characters |
| Widget name, description | 32, 120 characters |
| State size, widget file size | 8 KB, 32 KB |
| Rows | 3 |
| Chart points | 2 to 48 |
| Price history ranges | 24h, 7d, 30d |
| Triggers per state, depth of `next` | 8, 3 levels |
| Chain lookups per check, all widgets | 10 |
| Refresh interval | 60 s to 24 h |
| Times | within 30 days of now |
| Network timeouts | Widget file: 15 s in all (5 s connect, 10 s read per request). Refresh: 15 s in all |

A state that breaks a rule (a wrong type, two kinds in one value, too many rows, a bad `refresh.url`, a `path` that is not a string, an empty text) is refused whole and `update` rejects with the field named, so you can find the problem:

```text
Invalid widget state: state.refresh.url: must stay on https://swap.example over https, without credentials
Invalid widget state: state.content.value: expected only one of text, amount, live
Invalid widget state: state.content.rows: at most 3 rows
```

An invalid widget file keeps the Mini App out of the gallery, and `add` rejects with a message that names the problem.

## 7. Examples

**A price widget with no code.** The file alone is the whole integration; Nimiq Pay keeps the price and its change current.

```json
{
  "v": 1,
  "widgets": [{
    "id": "nim-price",
    "name": "NIM price",
    "sizes": ["small", "large"],
    "content": {
      "label": "NIM",
      "value": { "live": { "price": "NIM" } },
      "info": { "live": { "priceChange": { "asset": "NIM", "range": "24h" } } },
      "chart": { "kind": "line", "priceHistory": { "asset": "NIM", "range": "24h" } }
    }
  }]
}
```

**Swap status, with all three paths.** The widget file is the one in section 2. When a swap starts, the Mini App pushes its state; the deadline is a trigger, and a server answer keeps it current after the Mini App closes. Times must be within 30 days of now, so build them from the clock:

```js
const deadline = Date.now() + 30 * 60_000

await window.nimiqPay.widgets.update('swap', {
  content: {
    label: 'Waiting for your deposit',
    value: { amount: '0.05', currency: 'ETH' },
    info: 'for about 1,234 NIM',
    tone: 'attention',
    countdown: { label: 'Deposit by', until: deadline },
    path: '/?swap=XyZ',
  },
  next: [{
    on: { at: deadline },
    state: {
      content: { label: 'Expired', value: { amount: '0.05', currency: 'ETH' }, info: 'no deposit arrived' },
      expiresAt: deadline + 3_600_000,
    },
  }],
  refresh: { url: '/api/widget/swap?id=XyZ', every: 60 },
})
```

The `refresh` endpoint (section 5) answers the same shape of state for that swap. A final answer carries no `refresh`, which stops the polling:

```js
Response.json({
  content: { label: 'Done', value: { amount: '1234', currency: 'NIM' }, info: 'from 0.05 ETH', tone: 'positive', path: '/?swap=XyZ' },
  expiresAt: Date.now() + 3_600_000,
}, { headers: { 'Access-Control-Allow-Origin': '*' } })
```

## 8. Trying it

The demo Mini App in `mini-app-sdk/dapp` ships two widgets (`nim-price` and `lab`) in `public/nimiq-pay-widgets.json` and a Widgets tab. Open the demo in a Nimiq Pay build with widgets (a demo served over plain http or from a LAN IP address works only in development builds of Nimiq Pay), then either:

- open the Mini Apps modal, tap Widgets at the top and add them from the gallery (it lists Nimiq Pay's own NIM price widget first, then the Mini Apps you have opened), or
- use the demo's Widgets tab: it adds each widget, pushes a scheduled state that turns green after two minutes, a bar chart, a chain trigger that waits for a 0.00001 NIM payment to yourself (and gives up after 30 minutes), a button that calls `remove`, and a deliberately invalid state to see the error message. The buttons that need your account stay disabled until the demo's provider is ready.

The tab shows the result of every call in its status line. Remove a widget from its "⋯" menu.
