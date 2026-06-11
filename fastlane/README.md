fastlane documentation
----

# Installation

Make sure you have the latest version of the Xcode command line tools installed:

```sh
xcode-select --install
```

For _fastlane_ installation instructions, see [Installing _fastlane_](https://docs.fastlane.tools/#installing-fastlane)

# Available Actions

## iOS

### ios beta

```sh
[bundle exec] fastlane ios beta
```

Build a new beta version for testing

### ios screenshots

```sh
[bundle exec] fastlane ios screenshots
```

Generate App Store screenshots via Maestro (mock data baked in)

----


## Android

### android beta

```sh
[bundle exec] fastlane android beta
```

Build a new beta version for testing

### android screenshots

```sh
[bundle exec] fastlane android screenshots
```

Generate Play Store screenshots via Maestro (mock data baked in). Requires one booted emulator.

----

This README.md is auto-generated and will be re-generated every time [_fastlane_](https://fastlane.tools) is run.

More information about _fastlane_ can be found on [fastlane.tools](https://fastlane.tools).

The documentation of _fastlane_ can be found on [docs.fastlane.tools](https://docs.fastlane.tools).
