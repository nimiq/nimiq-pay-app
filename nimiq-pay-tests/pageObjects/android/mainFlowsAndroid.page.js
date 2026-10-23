output.launchScreen = {
    getStartedBtn: "Get Started",
    loginBtn: "Login"
};

output.onboarding = {
    choosePinTitle: "Choose a PIN",
    confirmPinTitle: "Confirm your PIN",
    enterPinTitle: "Enter PIN",
    biometricTitle: "Biometric Authentication",
    enableNotificationsTitle: "Enable notifications",
    skipForNowBtn: "Skip for now"
};

// iOS shows a one-time slide-to-type intro over the letter keyboard the first time it opens on
// a device; typing goes nowhere until it is dismissed.
output.iosKeyboard = {
    quickPathIntro: "Speed up your typing.*",
    continueBtn: "Continue"
};

output.home = {
    payTitle: "Pay",
    switchAssetBtn: "Switch asset",
    usdtBtn: "USDT",
    fiatAmount: "\\$",
    usdtAmount: "USDT",
    // Home amount by currency symbol. With animations on, each character is its own text node
    // ("$", "€"); with Reduce Animations it is one node ("$0.00", "0.00 €"), so match both.
    usdSymbol: "\\$.*",
    eurSymbol: ".*€",
    testnetBadge: "TESTNET",
    // The NIM balance under the fiat amount, without its separate "NIM" node. Thousands are
    // grouped with U+202F (not matched by \s) and the node ends with a space. Two or more
    // characters, so the fiat amount's single-digit nodes never match. Transaction rows don't
    // match only because their aria-label "Transaction NIM" hides the amounts (TransactionItem.vue).
    nimBalanceNoDecimals: "[1-9][0-9\u202f]+ ?",
    nimBalanceFiveDecimals: "[0-9][0-9\u202f]*\\.[0-9]{5} ?",
    // "+<amount> NIM pending" under the balance; its amount node has the same format.
    pendingNim: ".*pending"
};

output.navigation = {
    openMenuBtn: "Open menu",
    earnPointsBtn: "Earn Points",
    miniAppsBtn: "Mini Apps",
    recoveryWordsBtn: "Recovery Words",
    closeNotificationCardBtn: "close notification card",
    settingsBtn: "Settings",
    backupAccountBtn: "Backup Account",
    whatsNewBtn: "What's New",
    aboutBtn: "About",
    logoutBtn: "Log Out",
    topUpBtn: "Top Up",
    withdrawBtn: "Withdraw",
    closeFlowModalBtn: "close flow modal",
    // Toolbar back button of stacked modals (Settings): "back" on Android, "Back" on iOS.
    // Used instead of the `back` command, which does nothing on iOS.
    backBtn: "back",
    // A point on the backdrop above a sheet modal; tapping it closes the sheet. The menu and
    // the Log Out confirmation sheets have an unlabelled close button, and `back` does
    // nothing on iOS. The menu sheet's top is the highest: 34% of the screen on the Pixel_8, 31%
    // on the iPhone 17 Pro and about 22% on the Galaxy S26 (scaled from its Settings row); Log Out
    // starts at 50% (Pixel_8).
    sheetBackdrop: "50%,10%"
};

output.settings = {
    title: "Settings",
    language: "Language",
    currency: "Currency",
    minimumNimDecimals: "Minimum NIM Decimals",
    autoDepositThreshold: "Auto-deposit threshold.*",
    pushNotifications: "Receive Push Notifications",
    reduceAnimations: "Reduce Animations",
    changePin: "Change PIN",
    // Ionic select exposes "<label>, <selected value>" as its accessible name.
    currencyEurSelected: "Currency, EUR",
    nimDecimalsFiveSelected: "Minimum NIM Decimals, 5"
};

// Ionic select alert opened from Settings > Minimum NIM Decimals (options None, 2, 5).
output.nimDecimalsAlert = {
    fiveOption: "5",
    okBtn: "OK"
};

// Ionic select alert opened from Settings > Currency.
output.currencyAlert = {
    eurOption: "EUR",
    okBtn: "OK"
};

// Settings > Language. Option names and the alert's OK are never translated; the Settings
// labels are (src/i18n/*.po).
output.languageAlert = {
    okBtn: "OK"
};
output.languages = {
    de: { option: "Deutsch", languageLabel: "Sprache", currencyLabel: "Währung" },
    es: { option: "Español", languageLabel: "Lenguaje", currencyLabel: "Moneda" },
    fr: { option: "Français", languageLabel: "Langue", currencyLabel: "Devise" },
    // selected: the select's accessible name, "<label>, <selected value>".
    pt: { option: "Português", languageLabel: "Língua", currencyLabel: "Moeda", selected: "Língua, Português" }
};

// Dev modal, opened by long-pressing the menu's "Settings" row for 3 s (MenuModal.vue).
output.devModal = {
    reconnectBtn: "Reconnect to Network",
    testnetBtn: "TESTNET",
    switchBtn: "Switch"
};

output.unlock = {
    invalidPinError: "Invalid PIN"
};

// Settings > Change PIN reuses the onboarding "Choose a PIN" / "Confirm your PIN" steps.
output.changePin = {
    currentPinTitle: "Insert PIN to confirm"
};

output.topUp = {
    title: "Top up address",
    addressPrefix: "NQ.*",
    // One text node per address on Android; nine 4-character nodes on iOS. Matches any 4-letter
    // text too (Maestro ignores case), so capture_top_up_address.yaml bounds it to the address.
    addressPart: "NQ.*|[0-9A-Z]{4}",
    copyAddress: "Copy address"
};

output.withdraw = {
    title: "Withdraw",
    usd: "USD",
    nim: ".*NIM",
    selectAddress: "Select an address.*",
    amount25: "$25",
    amount50: "$50",
    amount100: "$100",
    allBtn: "All",
    // Switches the amount to NIM and blurs the input; the empty input then reads " 0 ".
    enterInNimBtn: "Enter amount in NIM",
    emptyAmount: " 0 ",
    // Address picker sheet ("Choose an address"); the list is empty after clearState.
    addAnotherAddressBtn: "Add another address",
    addressTitle: "Send to this address",
    // The address is 9 inputs with HTML ids "0".."8", one group of 4 characters each. Android
    // exposes only the ids; iOS only their aria-labels, "Address segment 0".."8".
    addressSegmentLabel: "Address segment ",
    saveAddressBtn: "Save",
    confirmTitle: "Confirm Withdrawal",
    // The 1 NIM withdraw_nim_testnet sends, as the confirmation and the transaction detail show it.
    // iOS splits it into "1.0" and "NIM".
    oneNimAmount: "1\\.0( NIM)?",
    confirmAndSendBtn: "Confirm and send",
    // Only asked when the last PIN entry is over 5 minutes old (MIN_PIN_INPUT_INTERVAL).
    pinTitle: "Insert PIN to confirm"
};

// Detail modal of a history row. Rows themselves only expose "Transaction NIM" (their
// aria-label hides title, amount and state), so the detail is where a transaction is checked.
output.transaction = {
    row: "Transaction NIM",
    withdrawalTitle: "Withdrawal",
    confirmed: "Confirmed",
    // e.g. "10/9/26, 3:05 PM"; minute precision.
    date: "[0-9]+/[0-9]+/[0-9]+, .*"
};

output.backup = {
    introTitle: 'There is no "Forgot password"',
    introDescription: "Create a backup. It's the only way to recover your account.",
    noOneCanSeeBtn: "No one can see me",
    showWordsTitle: "Write down these words",
    continueBtn: "Continue",
    validateTitle: "Test your backup",
    question: "What's the .* word\\?",
    // Each recovery word is its own text node next to its "01".."12" label. Matching is
    // case-insensitive, so this also matches "CONTINUE" and the toolbar "back" button: use it
    // with `below: showWordsTitle` and an `index` (Maestro orders by top, then left).
    recoveryWord: "[a-z]+",
    // One question by position: questionPrefix + n + questionSuffix ("What's the 3rd word?").
    questionPrefix: "What's the ",
    questionSuffix: "(st|nd|rd|th) word\\?",
    // Shown after a wrong answer; restarts the quiz with new questions.
    tryAgainBtn: "Try again"
};

// Setup > Login: the recovery words step.
output.login = {
    title: "Enter recovery words",
    confirmBtn: "Confirm",
    invalidWordsError: "Invalid recovery words"
};

output.whatsNew = {
    title: "What's New",
    // One header per changelog entry ("Version 2.19.1"). Older entries only render once
    // "Previous versions" is expanded, so a second header proves the expansion without
    // depending on release-specific text.
    versionHeader: "Version [0-9]+\\.[0-9]+\\.[0-9]+",
    previousVersions: "Previous versions",
    closeBtn: "Close"
};

output.about = {
    pageTitle: "Nimiq",
    staySignedOutBtn: "Stay signed out",
    // iOS Safari's address bar reads "nimiq.com" after a leading left-to-right mark (U+200E).
    pageUrl: "\u200E?nimiq\\.com"
};

output.logout = {
    title: "Are you sure you want to log out?",
    instructions: "Log in again with your recovery words.*",
    confirmBtn: "Confirm"
};

output.cryptocityPoints = {
    comingSoonMessage: "Cryptocity Points are coming soon. Stay tuned."
};

output.miniApps = {
    discoverTitle: "Discover",
    // On Android the searchbar exposes neither text nor an accessible label to Maestro (the
    // real <input> sits in Ionic's shadow DOM), so it is targeted by the id on its host
    // element, which Android WebView maps to a resource-id. iOS exposes no HTML ids but
    // labels the input "search text" (see tap_mini_apps_search.yaml).
    searchInputId: "mini-apps-search",
    searchInputIos: "search text",
    closeBtn: "close modal",
    matchingAppsTitle: "Matching Apps",
    noResultsMessage: "No apps found.",
    // Type filter renders role="radio" buttons whose label is uppercased by CSS, so anchor
    // the patterns to avoid also matching app rows ("Runs on EVM") or names ("EVM Mini Wallet").
    filterAllBtn: "^ALL$",
    filterNimiqBtn: "^NIMIQ$",
    filterEvmBtn: "^EVM$",
    // Row renders name + description, so the entry must be matched by prefix.
    nimtrisEntry: "Nimtris.*",
    evmMiniWalletEntry: "EVM Mini Wallet.*",
    // Anchored past the app name on purpose: the soft keyboard's suggestion strip also
    // exposes a clickable "Cinima" chip, so a looser pattern taps the suggestion instead
    // of the row and the Mini App never opens.
    cinimaEntry: "^Cinima Runs on Nimiq.*",
    // Anchored so it matches only the native Mini App browser, not the list row
    // ("Cinima Runs on Nimiq Cinima ..."). Cinima asks for fullscreen at load when the host
    // offers it within 2 s (2.21.0+, #12); the browser then hides its title and shows its own
    // "Exit fullscreen" button, so either can appear.
    cinimaAppTitle: "^(Cinima|Exit fullscreen)$"
};