# Product

## Register

product

## Users

Two intersecting groups, both **non-technical everyday users**:

- **Crypto-native senders** moving NIM or USDT between wallets and paying merchants. They have used a wallet before but they are not power users; they want fewer steps, not more controls. (Swaps happen behind the scenes during certain payments; the user never triggers one directly.)
- **Newcomers** receiving NIM for the first time (often through a merchant, a friend, or an onboarding promotion). Their mental model is closer to a payment app than a crypto wallet. They have never seen a seed phrase before opening this app.

Context: mobile only (Ionic + Capacitor on iOS and Android). Used both at the point of sale (glance-and-tap at checkout, sometimes one-handed, sometimes outdoors in bright light) and at home (calmer, deliberate transfers, backup setup, account recovery). Single screen at a time, always.

Job to be done: hold, send, and receive NIM and USDT with the least possible friction; back up the wallet without panic; recover when the device is lost. Self-custody must feel invisible right up until the moment it matters, then be unmissable. The app does not expose KYC, asset conversion, or user-triggered swaps; if a swap is needed to settle a payment, it is performed silently as part of the send flow.

## Product Purpose

A self-custody mobile wallet that makes crypto payments feel like contactless payments. The app exists to compress the gap between *deciding to pay with crypto* and *the receiver having the funds*, while keeping users in control of their keys.

Success looks like:
- A first-time user receives NIM, sees a balance, and understands what to do next without a tutorial
- A returning user sends a payment in fewer taps than opening a banking app
- A user who loses their device can recover their balance without contacting support
- Backup, biometrics, and PIN are completed by users who would normally bounce off any of those flows in a competing wallet

## Brand Personality

**Friendly. Playful. Secure.** In that order, with secure as the floor under the other two, never the surface.

- **Friendly**: warm tone, plain language, no jargon by default. Crypto vocabulary appears only when the user is already inside a context that requires it (e.g. "address" on a receive screen, never on a home screen).
- **Playful**: small rewards in low-stakes moments. Subtle motion, friendly empty states, Nimiq's existing radial-gradient cards. Personality through microcopy and animation, never through stickers, mascots, emojis, or confetti on a transaction confirm.
- **Secure**: high-stakes actions slow down, become quieter and more deliberate. Money moves get full attention, no decoration, no celebratory motion. Trust comes from restraint, not from padlocks or shields.

These three are sequenced by stake: friendly on entry, playful on idle, secure on commit.

## Anti-references

Explicitly NOT this app:

- **Generic crypto wallet aesthetics**: dark backgrounds with neon accents, hex addresses front-and-centre, "degen" copy, gas / network / chain / RPC vocabulary leaked into the UI, candle charts on the home screen, token lists three screens deep.
- **Generic neo-bank aesthetics**: Revolut / N26 / Monzo sterile blue, identical card grids of features, hero-metric balance templates, illustrated avatars of diverse young people on every empty state, "✨ Your money, smarter" marketing tone bleeding into the product.
- **Enterprise crypto dashboards**: Coinbase Pro / Kraken executive look, dense data tables, multi-column layouts, dropdowns within dropdowns.
- **Gamified finance**: Robinhood-style green confetti on success, leaderboards on payments, streak counters on sending, lottery-style reward language.

If a screen could be reskinned and shipped as either a generic crypto wallet or a generic neo-bank, the screen has failed.

## Design Principles

Five strategic principles, derived from users and tone:

1. **Newcomer-first vocabulary.** Default to plain language. "Address" only appears when the user is on a receive screen. "Seed phrase" only appears inside the backup flow. The home screen never assumes the user knows what a blockchain is.

2. **Quiet on money moves.** Send, receive, backup, and recovery screens slow the rhythm down: tighter copy, less decoration, more whitespace, fewer simultaneous affordances. Confidence is communicated by restraint, not by reassurance copy.

3. **Personality lives in the cracks.** Empty states, loading states, confirmation toasts, and idle moments carry the friendly/playful tone. Transactional surfaces stay neutral. Never the other way round.

4. **Self-custody is invisible until it is unmissable.** Mnemonic, keys, and chain details are absent from the default product surface. When they do appear (backup flow, recovery, advanced settings), they take over the screen and become the only thing on it.

5. **Glanceable on every step.** Each screen must be parseable in under two seconds at a checkout counter. One primary action per screen. No competing emphasis. Numbers (balances, amounts, fees) are the loudest element; everything else recedes around them.

## Accessibility & Inclusion

Default target **WCAG 2.2 AA**, with money-handling specifics:

- **Color is never the only signal.** Send vs. receive, success vs. error, and asset distinction (NIM vs. USDT) must each carry a non-color cue (icon, label, position). The existing palette has a red `#D94432` and a green `#21BCA5` close enough on some color-vision deficiencies that they cannot be relied on alone.
- **Reduced motion respected.** All page-transition slides, the wiggle animation, and decorative motion must honour `prefers-reduced-motion`. Critical confirmations must not depend on motion to be understood.
- **Contrast on outdoor surfaces.** Checkout screens (QR, amount, confirm) target AAA contrast where possible; the app is used in direct sunlight at points of sale.
- **Tap targets** at minimum 44×44 pt; primary money-action buttons larger.
- **Screen-reader friendly.** Addresses, amounts, and transaction status are announced in human form, never as raw character-by-character hex.
- **One-handed reach.** Primary actions stay within the bottom 60% of the screen. Anything destructive sits above the fold so it cannot be triggered by accident with the thumb.
