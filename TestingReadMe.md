# Testing Nimiq Pay App on Local Machine

INITIAL SETUP
Create a main folder ie. “Nimiq Pay App Repo”

Git clone the following repositories into that folder
- https://github.com/nimiq/nimiq-pay-app 
 
- https://github.com/nimiq/pay-issuer-server

- https://github.com/nimiq/trust-web3-provider

Go to nimiq-pay-app folder by cd nimiq-pay-app

Now install all dependencies 
pnpm install --ignore-scripts
pnpm copy:nimiq


Install Ruby dependencies (Fastlane) 
bundle install

Make the app build without being connected to the development server
# Build the Ionic/Capacitor project directly without Fastlane
pnpm i18n:extract

pnpm build:web  # This compiles Vue -> web assets

pnpm ionic cap sync android  # Sync to native Android project

pnpm ionic cap build android  # Build the Android project

cd android && ./gradlew assembleDebug #creates the APK

# INSTALLATION
Now install the app on the emulator
adb install /Users/franciscodiaz/Desktop/Repo_Pay_APP/nimiq-pay-app/android/app/build/outputs/apk/debug/app-debug.apk

Open the app
adb shell am start -n com.nimiq.pay.debug/com.nimiq.pay.MainActivity

Close the app
adb shell am force-stop com.nimiq.pay.debug 

Uninstall the app
adb uninstall com.nimiq.pay.debug

# Running Tests
Single Test
maestro test \
  --format=HTML-DETAILED \
  --output=nimiq-pay-tests/tests_output/maestro_report.html \
  -e APP_ID=com.nimiq.pay.debug \
  -e PIN=1111 \
  nimiq-pay-tests/flows/francisco_tests/create_new_account_with_pageObject.yaml

Test with a subflow 
maestro test \
  --format=HTML-DETAILED \
  --output=nimiq-pay-tests/tests_output/maestro_report.html \
  -e APP_ID=com.nimiq.pay.debug \
  -e PIN=1111 \
  nimiq-pay-tests/flows/francisco_tests/settings_threshold_currency.yaml

maestro test \
  --format=HTML-DETAILED \
  --output=nimiq-pay-tests/tests_output/maestro_report.html \
  -e APP_ID=com.nimiq.pay.debug \
  -e PIN=1111 \
  nimiq-pay-tests/flows/francisco_tests/withdraw_nim_validation.yaml

maestro test \
  --format=HTML-DETAILED \
  --output=nimiq-pay-tests/tests_output/maestro_report.html \
  -e APP_ID=com.nimiq.pay.debug \
  -e PIN=1111 \
  nimiq-pay-tests/flows/francisco_tests/wallet_import_roundtrip.yaml


# Upload Pay App in APK to BrowserStack
pnpm release:browserstack:apk

# Upload Maestro Test Suite to BrowserStack
pnpm upload:browserstack:maestro

# Runs Tests on BrowserStack
pnpm run:browserstack:maestro


# Run with HTML Reporter

maestro test \
  --format=HTML-DETAILED \
  --output=nimiq-pay-tests/tests_output/maestro_report.html \
  -e APP_ID=com.nimiq.pay.debug \
  -e PIN=1111 \
  nimiq-pay-tests/flows/francisco_tests/create_new_account_with_pageObject.yaml
  nimiq-pay-tests/flows/francisco_tests/create_new_account_with_pageObject.yaml

# Open HTML Report File 
open nimiq-pay-tests/tests_output/maestro_report.html

