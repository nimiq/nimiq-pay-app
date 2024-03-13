//
//  AppUITests.swift
//  AppUITests
//
//  Created by Alberto Monterroso on 2024-03-07.
//

import XCTest

let devWallet = [
  "tube", "siege", "funny", "crouch", "notable", "setup", "adult", "cost", "country", "mask",
  "night", "giraffe",
]

@MainActor
final class AppUITests: XCTestCase {

  override func setUpWithError() throws {
    // Put setup code here. This method is called before the invocation of each test method in the class.
    let app = XCUIApplication()
    setupSnapshot(app)
    app.launchArguments = ["--Reset"]
    app.launch()
    // In UI tests it is usually best to stop immediately when a failure occurs.
    continueAfterFailure = false

    // In UI tests it’s important to set the initial state - such as interface orientation - required for your tests before they run. The setUp method is a good place to do this.
  }

  override func tearDownWithError() throws {
    // Put teardown code here. This method is called after the invocation of each test method in the class.
    let app = XCUIApplication()
    app.uninstall(name: "Nimiq Pay")
  }

  func testExample() async throws {
    // UI tests must launch the application that they test.
    let app = XCUIApplication()
    let timeout = TimeInterval(10)

    let webViewsQuery = app.webViews
    let loginButton = webViewsQuery.buttons["Login"]
    // Wait for the login button to exist
    let exists = loginButton.waitForExistence(timeout: 10)
    if !exists {
      XCTFail("Cannot login, uninstalling the app. Try again.")
      return
    }

    snapshot("0Launch")

    tapButton("Login")

    // textField array
    var textFields: [XCUIElement] = []
    for i in 1...12 {
      textFields.append(webViewsQuery.textFields[String(format: "%02d", i)])
    }

    // Fill in the text fields
    for (index, textField) in textFields.enumerated() {
      tapInputField(textField)
      textField.typeText(devWallet[index])
    }

    tapButton("CONFIRM")

    // Wait for the first pin input to be hittable and fill the pin
    let firstPinInput = webViewsQuery.secureTextFields["pinCode"]
    _ = firstPinInput.waitForExistence(timeout: timeout)
    tapInputField(firstPinInput, shouldBeFocused: true)
    firstPinInput.typeText("1234")

    // Do the same with the pin confirmation
    let secondPinInput = webViewsQuery.secureTextFields["pinCodeConfirm"]
    _ = secondPinInput.waitForExistence(timeout: timeout)
    tapInputField(secondPinInput, shouldBeFocused: true)
    secondPinInput.typeText("1234")

    tapButton("select calling code")
    let searchField = webViewsQuery.textFields["Search for a country"]
    tapInputField(searchField)
    searchField.typeText("CA")

    // For an unknown reason, I can only select buttons with one word. United States is not working for example
    let radio = webViewsQuery.otherElements["Canada"]
    let e = radio.waitForExistence(timeout: timeout)
    if !e {
      XCTFail("Cannot find the Canada radio button")
      return
    }
    radio.tap()

    tapButton("close country modal")
    let phoneNumberInput = webViewsQuery.textFields["Your number"]
    _ = phoneNumberInput.waitForExistence(timeout: timeout)

    tapInputField(phoneNumberInput)
    phoneNumberInput.typeText("2345678900")

    tapButton("VERIFY")

    tapButton("Continue")

    for i in 1...6 {
      let codeInput = webViewsQuery.textFields[String(format: "Digit %d", i)]
      tapInputField(codeInput)
      codeInput.typeText("1")
    }

    sleep(1)
    for button in webViewsQuery.buttons.allElementsBoundByIndex {
      if button.label != "Skip for now" {
        continue
      }
      if button.isHittable {
        button.tap()
        print("Tapped Skip for now button \(button.label)")
      }
    }

    tapButton("GOT IT")

    // Phone Number is verified, Rewards modal is shown
    snapshot("1Points")
    tapButton("close points modal")

    sleep(1)
    tapButton("Top Up")
    snapshot("2TopUp")
    tapButton("close flow modal")

    // Wait until the tx history is loaded
    sleep(60)
    snapshot("3HomeScreen")          
  }

  func tapInputField(_ element: XCUIElement, shouldBeFocused: Bool = false) {
    while !element.isHittable {
      sleep(1)
    }
    if !shouldBeFocused {
      element.tap()
    }
    while !element.hasFocus {
      element.tap()
      sleep(1)
    }
  }

  func tapButton(_ name: String) {
    let app = XCUIApplication()
    let button = app.webViews.buttons[name]
    while !button.isHittable {
      sleep(1)
    }
    button.tap()
  }

}

extension XCUIApplication {
  func uninstall(name: String? = nil) {
    self.terminate()

    let timeout = TimeInterval(5)
    let springboard = XCUIApplication(bundleIdentifier: "com.apple.springboard")

    let appName: String
    if let name = name {
      appName = name
    } else {
      let uiTestRunnerName = Bundle.main.infoDictionary?["CFBundleName"] as! String
      appName = uiTestRunnerName.replacingOccurrences(of: "UITests-Runner", with: "")
    }

    /// use `firstMatch` because icon may appear in iPad dock
    let appIcon = springboard.icons[appName].firstMatch
    if appIcon.waitForExistence(timeout: timeout) {
      appIcon.press(forDuration: 2)
    } else {
      XCTFail("Failed to find app icon named \(appName)")
    }

    let removeAppButton = springboard.buttons["Remove App"]
    if removeAppButton.waitForExistence(timeout: timeout) {
      removeAppButton.tap()
    } else {
      XCTFail("Failed to find 'Remove App'")
    }

    let deleteAppButton = springboard.alerts.buttons["Delete App"]
    if deleteAppButton.waitForExistence(timeout: timeout) {
      deleteAppButton.tap()
    } else {
      XCTFail("Failed to find 'Delete App'")
    }

    let finalDeleteButton = springboard.alerts.buttons["Delete"]
    if finalDeleteButton.waitForExistence(timeout: timeout) {
      finalDeleteButton.tap()
    } else {
      XCTFail("Failed to find 'Delete'")
    }
  }
}
