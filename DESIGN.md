---
name: Nimiq Pay
description: Self-custody mobile wallet for NIM and USDT, paced like a contactless payment app.
colors:
  plaza-night: "#1F2348"
  signal-blue: "#0582CA"
  vault-green: "#21BCA5"
  tether-verdigris: "#20B29E"
  honey-coin: "#E9B213"
  streetlamp: "#FC8702"
  stop-red: "#D94432"
  fresh-mint: "#2CC78F"
  nimiq-coin: "#F6C430"
  bitcoin-orange: "#F7931A"
  cobble-white: "#F8F8F8"
  cobble-fog: "#F1F1F1"
  cobble-ash: "#E9E9EB"
  paper-white: "#FFFFFF"
  void-ink: "#0D102C"
typography:
  display:
    fontFamily: "Mulish, ui-sans-serif, system-ui, -apple-system, sans-serif"
    fontSize: "4.5rem"
    fontWeight: 300
    lineHeight: 1
    letterSpacing: "-0.025em"
  headline:
    fontFamily: "Mulish, ui-sans-serif, system-ui, -apple-system, sans-serif"
    fontSize: "2.25rem"
    fontWeight: 600
    lineHeight: 1.125
    letterSpacing: "-0.025em"
  title:
    fontFamily: "Mulish, ui-sans-serif, system-ui, -apple-system, sans-serif"
    fontSize: "1.125rem"
    fontWeight: 600
    lineHeight: 1.5
    letterSpacing: "0em"
  body:
    fontFamily: "Mulish, ui-sans-serif, system-ui, -apple-system, sans-serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.5
    letterSpacing: "0em"
  label:
    fontFamily: "Mulish, ui-sans-serif, system-ui, -apple-system, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 700
    lineHeight: 1.25
    letterSpacing: "0.025em"
  numerics:
    fontFamily: "Fira Mono, Fira Code, ui-monospace, monospace"
    fontSize: "1rem"
    fontWeight: 500
    lineHeight: 1.25
    letterSpacing: "0em"
rounded:
  xs: "0.125rem"
  sm: "0.25rem"
  md: "0.375rem"
  lg: "0.5rem"
  xl: "0.75rem"
  full: "9999px"
spacing:
  1: "0.25rem"
  2: "0.5rem"
  3: "0.75rem"
  4: "1rem"
  5: "1.25rem"
  6: "1.5rem"
  8: "2rem"
  10: "2.5rem"
  12: "3rem"
components:
  button-primary:
    backgroundColor: "{colors.signal-blue}"
    textColor: "{colors.paper-white}"
    rounded: "{rounded.full}"
    padding: "1rem 1.5rem"
    typography: "{typography.label}"
  button-primary-hover:
    backgroundColor: "{colors.plaza-night}"
  button-secondary:
    backgroundColor: "{colors.cobble-fog}"
    textColor: "{colors.plaza-night}"
    rounded: "{rounded.full}"
    padding: "0.5rem 1.5rem"
    typography: "{typography.label}"
  button-destructive:
    backgroundColor: "{colors.stop-red}"
    textColor: "{colors.paper-white}"
    rounded: "{rounded.full}"
    padding: "1rem 1.5rem"
    typography: "{typography.label}"
  card:
    backgroundColor: "{colors.paper-white}"
    textColor: "{colors.plaza-night}"
    rounded: "{rounded.md}"
    padding: "1rem"
  input-text:
    backgroundColor: "{colors.paper-white}"
    textColor: "{colors.plaza-night}"
    rounded: "{rounded.xs}"
    padding: "0.28rem 0.875rem"
    typography: "{typography.body}"
  input-amount:
    textColor: "{colors.plaza-night}"
    typography: "{typography.display}"
  pin-dot:
    backgroundColor: "{colors.plaza-night}"
    rounded: "{rounded.full}"
    size: "1rem"
---

# Design System: Nimiq Pay

## 1. Overview

**Creative North Star: "The Pocket Plaza"**

Nimiq Pay is a small, well-lit public square at dusk. The default surface is cobble-white and paper-white, generous and patient; depth comes from a single deep night-blue (`Plaza Night #1F2348`) that anchors text, icons, and quiet UI. The personality lives in the lamps: a small set of radial-gradient cards (Signal Blue for NIM, Tether Verdigris for USDT, Honey Coin for rewards, Streetlamp for warnings, Stop Red for destructive moves) that glow against the cobble surface where, and only where, money is actually moving. Everywhere else, the plaza is calm: soft shadows, rounded-`sm`/`md` corners, type set in Mulish at confident weights, numerics in Fira Mono so balances and addresses always feel measured.

The system rejects the two clichés Nimiq Pay's strategy explicitly names. It is not a generic crypto wallet (no neon-on-black, no hex-first, no "degen" voice, no candle charts on the home screen) and it is not a generic neo-bank (no sterile Revolut blue, no hero-metric balance tile, no identical card grids of features, no marketing tone bleeding into the product). When in doubt, the cobble surface stays cobble; the lamps stay rare. Sending feels like handing someone a coin across a counter, not like operating a trading terminal.

**Key Characteristics:**
- Light theme by default. The plaza is at dusk, not at midnight.
- Single anchor color (Plaza Night) carries 90% of typographic and iconographic weight.
- Asset identity travels by gradient: Signal Blue radial = NIM, Tether Verdigris radial = USDT.
- Numerics always in Fira Mono. Reading a balance, an address, or an amount must feel mechanical, not styled.
- Decoration sits in the cracks (empty states, idle moments, notifications); transactional surfaces stay neutral.
- Soft, low-contrast shadows. Depth whispers; it never announces.

## 2. Colors: The Pocket Plaza Palette

The palette is built around one deep navy anchor, a paired bright blue accent, and a small constellation of asset and status hues. Stitch frontmatter holds canonical sRGB hex; OKLCH below is provided as a perceptual reference for designers tuning new tints.

### Brand Name ↔ Tailwind Token

> **Critical for implementation.** The brand names below ("Plaza Night", "Signal Blue", …) are the *design lexicon*. They are **not** Tailwind class names. The codebase uses `tailwindcss-nimiq-theme` tokens, which use different names. When writing Tailwind classes, **always use the Tailwind Token column**, not the brand name. `bg-plaza-night/[0.06]` produces no rule and renders transparent; the correct class is `bg-space/[0.06]`.

| Brand Name | Hex | Tailwind Token | Example Class |
|---|---|---|---|
| Plaza Night | `#1F2348` | `space` | `text-space`, `bg-space/[0.06]` |
| Signal Blue | `#0582CA` | `sky` | `text-sky`, `bg-sky/10` |
| Tether Verdigris | `#20B29E` | `keppel` | `bg-keppel` |
| Vault Green | `#21BCA5` | `algae` | `text-algae` |
| Fresh Mint | `#2CC78F` | `mint` | `bg-mint` |
| Honey Coin | `#E9B213` | `gold` | `bg-gold`, `text-gold` |
| Streetlamp | `#FC8702` | `pumpkin` | `bg-pumpkin/10`, `text-pumpkin` |
| Stop Red | `#D94432` | `cherry` | `bg-cherry`, `text-cherry` |
| Nimiq Coin | `#F6C430` | `nim` | `text-nim` |
| Bitcoin Orange | `#F7931A` | `btc` | `text-btc` |
| Cobble White | `#F8F8F8` | `snow` | `bg-snow` |
| Cobble Fog | `#F1F1F1` | `fog` | `bg-fog` |
| Cobble Ash | `#E9E9EB` | `ash` | `bg-ash` |
| Paper White | `#FFFFFF` | `white` | `bg-white` |
| Void Ink | `#0D102C` | *(no token — use arbitrary value)* | `bg-[#0D102C]` |

Each of `space` / `sky` / `keppel` / `algae` / `mint` / `gold` / `pumpkin` / `cherry` / `grape` / `soil` / `flamingo` / `ocean` / `honey` / `carrot` / `fire` / `tomato` / `salmon` / `pistachio` is also generated at numbered opacity steps (`-100` … `-800`) by the theme. For ad-hoc opacities prefer Tailwind's `/<n>` slash syntax (`bg-space/[0.06]`, `text-space/70`).

### Primary
- **Plaza Night** (`#1F2348`, `oklch(24.6% 0.05 273)`, Tailwind `space`): The anchor. Body text, primary icons, headings, default nav, dark numerics. Used as a translucent wash (`bg-space/[0.06]`, `bg-space/10`, `bg-space/50`; or `text-space/70`) for secondary buttons, divider tints, and disabled states. Never used as a full-bleed dark background; the plaza is light.
- **Signal Blue** (`#0582CA`, `oklch(54.6% 0.14 234)`, Tailwind `sky`): The lamp. Active links, focused inputs, the NIM identity gradient (paired with `#265DD7` toward the corner). Reserved for elements the user is currently engaging with or that represent NIM specifically.

### Secondary
- **Tether Verdigris** (`#20B29E`, `oklch(67% 0.10 175)`, Tailwind `keppel`): USDT identity. Used inside the green USDT radial gradient (paired with `#008484` and `#009393`) on USDT-specific cards, the receive sheet, and the asset switcher when USDT is active. Never used as a generic "success" color.
- **Vault Green** (`#21BCA5`, `oklch(70% 0.11 175)`, Tailwind `algae`): Success states for *transactions* (confirmation toasts, transaction "completed" badges, atomic-swap "settled" pill). Reads as a brighter sibling of Verdigris on purpose; the user sees green and feels the same family, even though one is identity and one is status.

### Tertiary (rewards and referral)
- **Honey Coin** (`#E9B213`, `oklch(76.6% 0.155 88)`, Tailwind `gold`): Cryptocity Points, referral CTAs, `gradient-orange` cards in onboarding moments. The plaza's lamp-glow. Never used on a money-move screen, only on reward-shaped surfaces.

### Status
- **Streetlamp** (`#FC8702`, `oklch(72.7% 0.18 53)`, Tailwind `pumpkin`): Warning. Pending tx, Polygon network warnings, backup-incomplete reminders. Used as a radial gradient on `BackupNotification.vue`-style banners.
- **Stop Red** (`#D94432`, `oklch(57.5% 0.19 30)`, Tailwind `cherry`): Destructive only. Delete address, log out, irreversible confirms. Never used for "low balance" or "input invalid"; the plaza calls those out with Streetlamp instead.

### Asset Glyphs
- **Nimiq Coin** (`#F6C430`, Tailwind `nim`): Reserved for the NIM logo glyph. Not used in UI chrome.
- **Bitcoin Orange** (`#F7931A`, Tailwind `btc`): Reserved for BTC glyphs (Lightning invoices, BTC swap visualisation). Not used in UI chrome.

### Neutral
- **Cobble White** (`#F8F8F8`, Tailwind `snow`): Default app surface. Body background.
- **Paper White** (`#FFFFFF`, Tailwind `white`): Cards, sheets, modal interiors. The thing that floats on the cobble.
- **Cobble Fog** (`#F1F1F1`, Tailwind `fog`): Recessed surface. Secondary buttons, scroll-track, search field idle.
- **Cobble Ash** (`#E9E9EB`, Tailwind `ash`): Dividers, hairline borders, disabled-input outlines.
- **Void Ink** (`#0D102C`, no Tailwind token — write arbitrary value `bg-[#0D102C]`): The darkest token. Reserved for system contrast (status bar overlays, splash background, full-screen camera "hole" backdrop). Never a UI surface.

### Named Rules

**The One Lamp Rule.** Each screen has exactly one gradient surface lit at a time. NIM screens light Signal Blue. USDT screens light Tether Verdigris. Rewards screens light Honey Coin. If two gradients appear together (a Honey Coin Points card on top of a Signal Blue NIM home), the second one becomes flat (`Cobble White` or `Paper White`) until the user enters its context.

**The Money Is Plaza Night Rule.** Balances, amounts, addresses, fees, exchange rates, and any number that represents value render in `Plaza Night` (or `Signal Blue` only when the input is currently focused, see `AmountInput.vue`). Never colored for emphasis. Never gradient-text. The number is the loudest element by *weight and size*, never by hue.

**The 6% Wash Rule.** Secondary affordances (home Top Up / Withdraw pills, asset switcher, ghost buttons) use `Plaza Night` at 6% opacity on `Paper White` — Tailwind class `bg-space/[0.06]` (renders as `#F3F3F5`). This wash is the system's "available but not asking for attention" signal. Don't substitute a separate gray.

**The Drift Test.** If the screen looks like a 2014 fintech app, the gradient is too saturated and the shadow is too dark. Drop the gradient back into the cobble.

## 3. Typography

**Display Font:** Mulish (with `ui-sans-serif`, `system-ui`, `-apple-system`, `BlinkMacSystemFont`, `Segoe UI`, `Roboto` fallbacks). Variable axis, weights 200 to 1000.
**Numeric Font:** Fira Mono (with `Fira Code`, `ui-monospace` fallbacks). Used for all balances, amounts, addresses, transaction hashes, and short codes (PIN preview, OTP).

**Character.** Mulish carries the friendly half of the brand: it is humanist, slightly soft, comfortable at any weight. Fira Mono carries the secure half: every digit and every character of an address is the same width, so a balance read at a glance is always read correctly. The pairing intentionally separates "voice" (Mulish) from "value" (Fira Mono); the user's eye learns this within the first session.

### Hierarchy

- **Display** (Mulish 300, `4.5rem` / 72px, line-height 1, letter-spacing -0.025em): The amount typography in `AmountInput.vue` and the receive QR amount header. Single use per screen. Always Plaza Night (or Signal Blue when focused). `text-7xl` in the codebase.
- **Headline** (Mulish 600, `2.25rem` / 36px, line-height 1.125): Top-of-flow titles ("Send NIM", "Back up your wallet", "Set up Nimiq Pay"). One per screen. `text-4xl font-semibold` in `@layer base h1`.
- **Title** (Mulish 600, `1.125rem` / 18px, line-height 1.5): Menu items, list-row leads, modal section heads. The "this is what you tap" weight. `text-lg font-semibold`.
- **Body** (Mulish 400, `1rem` / 16px, line-height 1.5): Paragraphs, descriptions, helper text. Cap measure at 65 to 75 characters; on a 390px iPhone width that's roughly the natural line-length, so most screens read correctly without manual `max-width`.
- **Label** (Mulish 700, `0.875rem` / 14px, letter-spacing 0.025em, often UPPERCASE on toggle pills like `PaymentSelector`): Pill-toggle labels, pre-action affordances ("SCAN QR"), category tags. Bold and tight, never longer than two words.
- **Caption** (Mulish 400, `0.75rem` / 12px, line-height 1.333): Microcopy under inputs, fee disclosure, "approx." annotations next to fiat conversions.
- **Numeric** (Fira Mono 500, weight ranges from 400 for body addresses to 700 for "this is the amount" emphasis): Every number representing value. Addresses: monospace, ellipsised in the middle (`MiddleEllipsis.vue`). Balances: monospace, large. Hashes: monospace, small.

### Named Rules

**The Mulish-or-Mono Rule.** Type in this product is Mulish or Fira Mono. There is no third typeface. No system serif for body, no rounded-grotesque for whimsy, no display script for empty-state warmth.

**The Numeric Always Mono Rule.** If the character is a digit that represents a quantity (currency, count, percentage, fee, gas), it renders in Fira Mono. Plain Mulish digits are reserved for non-quantitative numerics (page 2 of 3, step 1 of 4, "1 minute ago").

**The No Gradient Text Rule.** Text never sits on `background-clip: text`. Emphasis is achieved by weight (700 over 400), size (display over body), or position. Color emphasis on text uses one of `Plaza Night`, `Signal Blue`, or `Stop Red`, applied as a flat fill. Nothing else.

## 4. Elevation

The system is **flat by default with a quiet stack of three soft shadows reserved for floating surfaces only.** Most depth is implied by color contrast (Paper White on Cobble White, gradient cards on cobble) rather than by shadow. Where shadows do appear, they are low-spread, blue-tinted (`rgba(31, 35, 72, ...)`), and never crisp. The point is *almost-not-there* lift, not 2014 dropshadow drama.

### Shadow Vocabulary

- **Card Lift** (`box-shadow: 0px 0.34px 2px rgba(0,0,0,0.03), 0px 1.5px 3px rgba(0,0,0,0.05), 0px 4px 16px rgba(0,0,0,0.07);`): The default card shadow (`shadow-card`). Use on `NotificationCard`, mini-app tiles, payment-preview blocks. Reads as "this is a separate surface" without ever announcing itself.
- **Floating Surface** (`box-shadow: 0px 18px 38px rgba(31,35,72,0.07), 0px 7px 8.5px rgba(31,35,72,0.04), 0px 2px 2.5px rgba(31,35,72,0.02);`): The Tailwind theme `boxShadow.DEFAULT`. Used on Ionic action sheets, sticky dropdowns, the keyboard-floating "Continue" button.
- **Around Halo** (`box-shadow: 0px 6px 20px rgba(59,76,106,0.13), 0px 1.34px 4.47px rgba(59,76,106,0.077), 0px 0.4px 1.33px rgba(59,76,106,0.053);`): The `boxShadow.around` token. For elements that float over a busy backdrop (the camera-feed "Continue" pill that sits over the live QR scanner). Cooler hue (closer to `Plaza Night / 13%`) so it reads against any background.
- **Bottom-Bar Aura** (`box-shadow: 0 0 4px rgba(31,35,72,0.03), 0 0 12px rgba(31,35,72,0.05), 0 0 32px rgba(31,35,72,0.06), 0 0 80px rgba(31,35,72,0.07);`): A four-step omni-directional glow, used only on the `PaymentSelector` bottom bar so the toggle reads as anchored to the screen edge while still appearing to lift.

### Named Rules

**The Flat-By-Default Rule.** Surfaces are flat at rest. Shadows appear only on (a) cards that explicitly lift off the cobble, (b) modal sheets while open, (c) the bottom bar that hosts a primary action. A button sitting inline on cobble does not need a shadow.

**The No Crisp Shadow Rule.** Every shadow uses at least three layers of low-alpha rgba; no single-shadow `0 4px 8px rgba(0,0,0,0.5)` quick fixes. If the shadow is visible from across a room, it's wrong.

**The No Glassmorphism Rule.** No `backdrop-filter: blur()` as a decorative card surface. The only legitimate blur in this product is the system status bar on iOS, which Capacitor handles natively. Anything else is forbidden.

## 5. Components

> Component specs below use brand names as design shorthand (e.g. "Plaza Night / 50% background"). Translate to Tailwind via the §2 token table — `Plaza Night / 50%` → `bg-space/50`, `Signal Blue` → `bg-sky` / `text-sky`, `Streetlamp` → `pumpkin`, etc.

### Buttons

Two button shapes coexist deliberately. Pill (`rounded-full`) buttons are for *navigation and toggles* (Top Up, Withdraw, asset switcher, PaymentSelector pills); rectangular `rounded-lg` buttons (Ionic-default `--border-radius`) are for *commit-this-action* on flow steps (Send, Confirm, Back up). The shape itself signals "are we moving inside the app" vs. "are we committing money."

- **Primary, gradient (commit money).** Implemented as `IonButton` with `style="--background: var(--radial-gradient-light-blue);"` for NIM and `--radial-gradient-green-usdt` for USDT. White label, font-weight 700, label typography, `rounded-lg`. Hover and active states darken the gradient by ~8% (no scale, no translate). Used as the bottom-of-flow commit button.
- **Primary, destructive.** Same shape as gradient primary, surface is `--radial-gradient-red`. Used only for *Delete Address*, *Log Out*, *Confirm sign-out*. The label is a verb, never just "Confirm."
- **Secondary, pill ghost.** `Plaza Night / 6%` background, `Plaza Night` text, label typography, `rounded-full`, `0.5rem 1.5rem` padding. The home screen Top Up / Withdraw pair. Reads as "available, not pushing."
- **Tertiary, link.** `QuickButton.vue`. Text-only with optional chevron. `Signal Blue` text, font-weight 700, body typography. Inline within content; never used as a screen-bottom commit.
- **Long-press button.** `LongPressButton.vue`. Used where accidental confirmation is risky, such as card-tap moments. Visualises progress with a circular fill in `Signal Blue`, completes only at full-fill. The hold is the safety.

### Pill Toggle (Signature Component)

`PaymentSelector.vue`. A `rounded-full` capsule on `Plaza Night / 10%`, with two or more pill options separated by an animated sliding background. The slider itself is a `--radial-gradient-light-blue` rounded-full pill that moves on `transition-all duration-[350ms]` when the active step changes. Inactive labels render in `Plaza Night / 50%`, the active label in `Paper White`. Above the toggle on its host screen, the `bottom-bar` four-step shadow anchors it to the bottom of the viewport.

This component is the canonical place where the brand's three-way "friendly / playful / secure" tension shows up at once: friendly (capsule shape), playful (the gradient slider chasing the user's tap), secure (the toggle remains on-screen during a money-flow as a reminder of *which* path the user is on).

### Cards

- **Notification Card** (`NotificationCard.vue`). `Paper White` background, `rounded-md`, `1rem` padding, `Card Lift` shadow. Title in Signal Blue weight 700, subtitle in `Plaza Night / 60%`. Close button at top-right at `Plaza Night / 40%`. No icon by default; the title carries the meaning.
- **Asset / Reward Card** (signature). `Paper White` body, with a `--radial-gradient-X` cover that takes the top portion of the card or the entire surface for emphasis. The gradient *is* the card; nothing else competes inside that gradient region. Numerics within the gradient render in `Paper White` with Fira Mono. Cards never nest; if the design pressure is "two cards inside one", the answer is to flatten one of them.

### Inputs

- **Standard text input** (`.nq-input-box`). Transparent background, `1.5px` outline in `Plaza Night / ~50%` (the `--nq-neutral-500` token). Focus shifts the outline to solid `Signal Blue` and the text color to `Signal Blue`. Invalid state shifts both to `Streetlamp`. `rounded-xs` (`0.125em`).
- **Amount input** (`AmountInput.vue`). The hero of the send flow. Display typography (Mulish 300, 72px), self-sizing width. Idle: `Plaza Night / 50%` (the placeholder "0"). Filled: `Plaza Night`. Focused: `Signal Blue`. The cursor and the suffix (the fiat code) render in their own scale: suffix is `text-3xl` Mulish 700, sitting on the same baseline as the digits.
- **PIN input** (`PinInput.vue`). Six dots, each `1rem` square `rounded-full`. Empty dots are `Plaza Night / 10%`; filled dots flip to solid `Plaza Night` with a `transition-colors` ease. No numeric digits ever shown. The dot is the only feedback.
- **Mnemonic input** (`MnemonicInput.vue`, `BricksInput.vue`). 24-cell grid, each cell its own `.nq-input-box`. Word-validity is colored at the cell level (Verdigris-tinted outline if recognised, Streetlamp if invalid). Never the whole grid red at once; that pattern punishes a single typo.

### Navigation

- **Tab bar / Ionic toolbar.** `Paper White`, no border, system safe-area aware via `env(safe-area-inset-bottom)`. Active item in `Plaza Night` weight 700, inactive in `Plaza Night / 50%`. No bottom-tab currently active in the v2.10 router, but if added: pill-shaped active indicator using the asset's gradient.
- **Modal close (back) button.** Top-left chevron in `Plaza Night`, `2rem` square tap target inside an `IonHeader`. Top-right close (`x`) for dismissable modals only; not present on commit-flow steps.

### Dividers

`ItemDivider.vue`. A `1px` line in `Cobble Ash`. Used between menu rows. Never as a colored accent. (See Don'ts.)

## 6. Do's and Don'ts

### Do:

- **Do** anchor each money-flow screen with one gradient lamp in the asset's identity color (Signal Blue for NIM, Tether Verdigris for USDT). One gradient surface per screen, no more.
- **Do** render every quantity (balance, amount, fee, address, hash) in Fira Mono with `Plaza Night` fill.
- **Do** use the `0.5rem 1.5rem` rounded-full pill on `Plaza Night / 6%` for any "secondary, available, not asking" affordance. That's the system's quiet voice; substitute it for "outline button" patterns from other libraries.
- **Do** keep cards flat-on-cobble unless they need to lift; when they do, use `Card Lift` shadow only. If you find yourself reaching for a fourth shadow vocabulary, the layout is wrong.
- **Do** put personality (Honey Coin glow, friendly microcopy, the wiggle animation, the `slideX-AndFade` 250ms `cubic-bezier(0.16, 1, 0.3, 1)` reveals) in *empty states, idle moments, notifications, and onboarding*. Never in a transaction confirm.
- **Do** respect `prefers-reduced-motion`: the wiggle animation, slide-fade transitions, and the PaymentSelector pill slider must all collapse to opacity-only fades when reduced motion is set.

### Don't:

- **Don't** ship a generic crypto wallet aesthetic. No neon-on-black, no hex-first home screens, no "degen" copy, no candle charts, no token list three screens deep. (PRODUCT.md anti-reference.)
- **Don't** ship a generic neo-bank aesthetic. No sterile Revolut-blue full-bleed, no hero-metric "$12,345.67" balance template, no identical card grids of features, no illustrated diverse-young-people empty states. (PRODUCT.md anti-reference.)
- **Don't** ship gamified-finance patterns. No green confetti on a payment success, no streak counters on sending, no leaderboards. Personality belongs in the cracks, not on a money-move. (PRODUCT.md anti-reference.)
- **Don't** use a `border-left` greater than 1px as a colored accent on a card, list item, or alert. Side-stripes are forbidden. If a notification needs status, use `Streetlamp` background tint at 8 to 12% opacity, or a leading icon, not a stripe.
- **Don't** use `background-clip: text` with a gradient on any text, ever. Especially not on balances. (Money is `Plaza Night`; see The Money Is Plaza Night Rule.)
- **Don't** reach for a modal as the first answer. Inline progressive disclosure, an `IonRouterOutlet` push, or a sheet are usually better. Modals are for *blocking confirms* (PIN, biometric prompt, destructive confirm) and for the Flow system; not for "show me the details."
- **Don't** stack two gradient cards on the same screen. The One Lamp Rule.
- **Don't** introduce a third typeface. Mulish or Fira Mono. If a screen feels too plain, the answer is *more whitespace, less type*, not a new font.
- **Don't** add `backdrop-filter: blur()` as a decorative card surface. Glassmorphism is forbidden. (See The No Glassmorphism Rule.)
- **Don't** use `Plaza Night` as a full-bleed dark background. Dark mode is not a thing in this product. The plaza is at dusk, not at midnight.
- **Don't** use `Vault Green` and `Stop Red` as the *only* signal of state difference; pair every status color with an icon, label, or position cue (see PRODUCT.md accessibility section).
- **Don't** animate `width`, `height`, `top`, `left`, or `margin`. Layout properties are off-limits. Animate `transform` and `opacity` only, with one of the existing easings (`cubic-bezier(0.16, 1, 0.3, 1)` for state reveals, `cubic-bezier(0.25, 0, 0, 1)` for the default ease).
- **Don't** use em dashes in product copy. Commas, semicolons, periods, parentheses. (Yes, this rule is enforced in the visual spec because copy is part of the design.)
