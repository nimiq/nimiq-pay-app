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

output.home = {
    payTitle: "Pay",
    switchAssetBtn: "Switch asset",
    usdtBtn: "USDT",
    fiatAmount: "\\$",
    usdtAmount: "USDT"
};

output.navigation = {
    openMenuBtn: "Open menu",
    earnPointsBtn: "Earn Points",
    cryptoMapBtn: "Crypto Map",
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
    closeFlowModalBtn: "close flow modal"
};

output.settings = {
    title: "Settings",
    language: "Language",
    currency: "Currency",
    minimumNimDecimals: "Minimum NIM Decimals",
    autoDepositThreshold: "Auto-deposit threshold.*",
    pushNotifications: "Receive Push Notifications",
    reduceAnimations: "Reduce Animations",
    changePin: "Change PIN"
};

output.topUp = {
    title: "Top up address",
    addressPrefix: "NQ.*",
    copyAddress: "Copy address"
};

output.withdraw = {
    title: "Withdraw",
    usd: "USD",
    nim: ".*NIM",
    selectAddress: "Select an address.*",
    amount25: "$25",
    amount50: "$50",
    amount100: "$100"
};

output.backup = {
    introTitle: 'There is no "Forgot password"',
    introDescription: "Create a backup. It's the only way to recover your account.",
    noOneCanSeeBtn: "No one can see me",
    showWordsTitle: "Write down these words",
    continueBtn: "Continue",
    validateTitle: "Test your backup",
    question: "What's the .* word\\?"
};

output.whatsNew = {
    title: "What's New",
    version: "Version.*",
    previousVersions: "Previous versions",
    previousVersionHighlight: "Mini Apps competition showcase"
};

output.about = {
    pageTitle: "Nimiq",
    staySignedOutBtn: "Stay signed out",
    pageUrl: "nimiq.com"
};

output.logout = {
    title: "Are you sure you want to log out?",
    instructions: "Log in again with your recovery words.*",
    confirmBtn: "Confirm"
};

output.cryptocityPoints = {
    comingSoonMessage: "Cryptocity Points are coming soon. Stay tuned."
};

output.cryptocityMap = {
    closeBtn: "Close map"
};

output.miniApps = {
    discoverTitle: "Discover",
    // The searchbar exposes neither text nor an accessible label to Maestro (the real
    // <input> sits in Ionic's shadow DOM), so it is targeted by the id on its host
    // element, which Android WebView maps to a resource-id.
    searchInputId: "mini-apps-search",
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
    // Anchored so it matches only the native Mini App toolbar title, not the list row
    // (which reads "Cinima Runs on Nimiq Cinima ...").
    cinimaAppTitle: "^Cinima$"
};