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
    skipForNowBtn: "Skip for now",
    // Confirm PIN step, when the second PIN differs from the first.
    pinMismatchError: "PIN did not match"
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
    fiatAmount: "\\$",
    usdtAmount: "USDT",
    // Home amount by currency symbol. With animations on, each character is its own text node
    // ("$", "€"); with Reduce Animations it is one node ("$0.00", "0.00 €"), so match both.
    usdSymbol: "\\$.*",
    eurSymbol: ".*€",
    // A zero balance with Reduce Animations, as one node (CRC has no decimals; GMD is followed by
    // a no-break space). With animations each character is its own node, so these don't match.
    crcZeroReduced: "₡0",
    gmdZeroReduced: "GMD.0",
    testnetBadge: "TESTNET",
    // The NIM balance under the fiat amount, without its separate "NIM" node. Thousands are
    // grouped with U+202F (not matched by \s) and the node ends with a space. Two or more
    // characters, so the fiat amount's single-digit nodes never match. Transaction rows don't
    // match only because their aria-label "Transaction NIM" hides the amounts (TransactionItem.vue).
    nimBalanceNoDecimals: "[1-9][0-9\u202f]+ ?",
    nimBalanceFiveDecimals: "[0-9][0-9\u202f]*\\.[0-9]{5} ?",
    nimBalanceTwoDecimals: "[0-9][0-9\u202f]*\\.[0-9]{2} ?",
    // "+<amount> NIM pending" under the balance; its amount node has the same format.
    pendingNim: ".*pending",
    // Testnet only, NIM active, no balance and no history (TheHomeTransactions.vue showFaucet).
    testnetEmptyMessage: "Your testnet account is empty.",
    // Testnet faucet button, on the empty home and on Top Up. Each tap spends one of the
    // faucet's ~3 taps per 12 h, so flows only check it is offered.
    faucetBtn: "Get free NIM"
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
    // On by default; Mini Apps builds only.
    reopenMiniAppOnUnlock: "Reopen Mini App on unlock",
    changePin: "Change PIN",
    // Ionic select exposes "<label>, <selected value>" as its accessible name.
    currencyEurSelected: "Currency, EUR",
    currencyCrcSelected: "Currency, CRC",
    nimDecimalsFiveSelected: "Minimum NIM Decimals, 5",
    nimDecimalsTwoSelected: "Minimum NIM Decimals, 2",
    // The row reads "Auto-deposit threshold <n> NIM": autoDepositThresholdPrefix + n + " NIM".
    autoDepositThresholdPrefix: "Auto-deposit threshold "
};

// Sheet opened from Settings > Auto-deposit threshold. Its close button has no label: close it
// without saving with a tap on navigation.sheetBackdrop.
output.autoDepositSheet = {
    description: "Incoming funds accumulate.*",
    saveBtn: "Save"
};

// Ionic select alert opened from Settings > Minimum NIM Decimals (options None, 2, 5).
output.nimDecimalsAlert = {
    twoOption: "2",
    fiveOption: "5",
    okBtn: "OK"
};

// Ionic select alert opened from Settings > Currency.
output.currencyAlert = {
    eurOption: "EUR",
    crcOption: "CRC",
    gmdOption: "GMD",
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
    currentPinTitle: "Insert PIN to confirm",
    // Wrong current PIN. The unlock screen says "Invalid PIN" instead (unlock.invalidPinError).
    invalidPinError: "Invalid PIN code"
};

output.topUp = {
    title: "Top up address",
    addressPrefix: "NQ.*",
    // One text node per address on Android; on iOS nine 4-character nodes (NIM) or three
    // 14-character nodes (USDT, AddressDisplay.vue). Matches any 4-letter text too (Maestro
    // ignores case), so capture_top_up_address.yaml bounds it to the address.
    addressPart: "NQ.*|0x.*|[0-9A-Z]{4}|[0-9A-F]{14}",
    copyAddress: "Copy address",
    // USDT only: subtitle and the warning under the address.
    usdtSubtitle: "Send USDT on Polygon to the address below.",
    polygonWarning: "Make sure you are sending from a Polygon address.*"
};

output.withdraw = {
    title: "Withdraw",
    usd: "USD",
    nim: ".*NIM",
    selectAddress: "Select an address.*",
    amount25: "$25",
    amount50: "$50",
    amount100: "$100",
    // The fiat amount the $25 preset fills in (with the amount in USD).
    amount25Value: "25",
    allBtn: "All",
    // Switches the amount to NIM and blurs the input; the empty input then reads " 0 ".
    enterInNimBtn: "Enter amount in NIM",
    // Shown instead of enterInNimBtn while the amount is in NIM; the unit is kept across opens.
    enterInUsdBtn: "Enter amount in USD",
    emptyAmount: " 0 ",
    // Address picker sheet ("Choose an address"); the list is empty after clearState.
    addAnotherAddressBtn: "Add another address",
    addressTitle: "Send to this address",
    // The address is 9 inputs with HTML ids "0".."8", one group of 4 characters each. Android
    // exposes only the ids; iOS only their aria-labels, "Address segment 0".."8".
    addressSegmentLabel: "Address segment ",
    saveAddressBtn: "Save",
    // The wallet's own address (NimAddressInput.vue validAddress).
    ownAddressError: "You can not use this address",
    insufficientFunds: "Insufficient funds",
    chooseAddressTitle: "Choose an address",
    noSavedAddresses: "No saved addresses",
    // Address list row actions. The alias inputs (new address and Edit alias) expose no text,
    // label or hint on Android, so flows reach them by position (leftOf saveAliasBtn).
    editAliasBtn: "Edit alias",
    saveAliasBtn: "Save alias",
    deleteAddressBtn: "Delete address",
    // Delete confirmation sheet. Its button "Delete Address" also matches deleteAddressBtn
    // (Maestro ignores case), so tap it below deleteConfirmHint.
    deleteConfirmHint: "This .* cannot be undone",
    deleteConfirmBtn: "Delete Address",
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
    paymentTitle: "Payment",
    confirmed: "Confirmed",
    // e.g. "10/9/26, 3:05 PM"; minute precision.
    date: "[0-9]+/[0-9]+/[0-9]+, .*"
};

// Pay flow (footer Pay): QR scanner, then manual entry, amount and preview steps.
output.pay = {
    // Native builds only: the scanner's way to type a request.
    enterManuallyBtn: "Enter manually",
    // The manual entry text box exposes no text, label or hint: tap it below this title.
    manualTitle: "Enter payment request",
    // Shown under the text box for text that is no URL at all (useStringParser.ts).
    invalidUrlError: "Invalid URL",
    // Live summary of a parsed request: "<merchant, message or Payment Request> - <fiat>".
    requestSummary: "Payment Request - .*",
    // Hidden while the text box has focus; on the manual and the amount step.
    continueBtn: "Continue and Pay",
    // Only for requests without an amount.
    amountTitle: "Set an amount",
    previewTitle: "Payment preview",
    // The preview's Pay button; home's footer Pay matches too, so tap it below the amount.
    payBtn: "Pay"
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
    tryAgainBtn: "Try again",
    // Shown next to tryAgainBtn; goes back to the words step.
    seeWordsBtn: "See words"
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

// Home card shown while the installed version has an unseen changelog entry (useChangelog.ts).
// Its title equals the menu item and the modal title, so flows use the subtitle.
output.whatsNewCard = {
    subtitle: "Learn what is new in this update"
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
    // Shown only when not searching and something was opened before. Its rows delete with a
    // slow swipe to the left (SwipeToDeleteRow.vue); a default-speed swipe snaps back.
    recentlyViewedTitle: "Recently Viewed",
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
    cinimaAppTitle: "^(Cinima|Exit fullscreen)$",
    // Native Mini App browser (capacitor-inappbrowser). Android labels its X "Close Button";
    // iOS shows an xmark bar button, which VoiceOver names "Close".
    browserCloseBtn: "Close Button|Close",
    // Anti-scam sheet for deep links to URLs that are neither curated nor recently viewed
    // (MiniAppWarningModal.vue).
    warningTitle: "Open this mini app\\?",
    warningOpenAnywayBtn: "Open anyway",
    warningDontOpenBtn: "Don't open"
};