# Security Policy

## Supported Versions

We only fix security issues in the latest release of Nimiq Pay. Before you report, check that the issue still happens on the latest version from the [App Store](https://apps.apple.com/app/nimiq-pay/id6471844738), [Google Play](https://play.google.com/store/apps/details?id=com.nimiq.pay) or the `main` branch.

Builds you compile yourself from this repository are not official releases. Report issues in this source code anyway, but issues that only affect your local configuration are out of scope.

## Reporting a Vulnerability

**Please do not open a public issue, pull request or discussion about a vulnerability.**

Report it privately, either by email to [security@nimiq.com](mailto:security@nimiq.com) or through [GitHub private vulnerability reporting](https://github.com/nimiq/nimiq-pay-app/security/advisories/new).

Please include:

- the app version and platform (iOS or Android, with OS version)
- what an attacker can do, and what they need first (physical access, a malicious Mini App, a network position, etc.)
- steps to reproduce, or a proof of concept
- any logs or screenshots that help, with your recovery phrase, PIN and private keys removed

We read every report. Nimiq's [Bug Bounty Program](https://www.nimiq.com/bug-bounty) is currently suspended while it is under review, but reports sent through this process are still investigated.

## Scope

In scope:

- the Nimiq Pay app in this repository (wallet storage, PIN and biometrics, transaction signing, sync)
- the Mini Apps host and the injected provider in `web3-provider/`
- deep links, QR code and payment request parsing

The Nimiq protocol and web client have their own policy in [nimiq/core-rs-albatross](https://github.com/nimiq/core-rs-albatross/blob/HEAD/SECURITY.md). Issues in third-party Mini Apps should go to their developers. We can help coordinate if needed.

## Disclosure

Please give us reasonable time to ship a fix before you disclose anything publicly.
