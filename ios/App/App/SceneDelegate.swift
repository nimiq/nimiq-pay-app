import UIKit
import Capacitor

class SceneDelegate: UIResponder, UIWindowSceneDelegate {
    var window: UIWindow?

    func scene(_ scene: UIScene, willConnectTo session: UISceneSession, options connectionOptions: UIScene.ConnectionOptions) {
        guard let windowScene = scene as? UIWindowScene else { return }

        window = UIWindow(windowScene: windowScene)
        window?.rootViewController = BridgeViewController()
        window?.makeKeyAndVisible()

        SceneDelegateProxy.shared.scene(scene, willConnectTo: session, options: connectionOptions)
    }

    func scene(_ scene: UIScene, openURLContexts URLContexts: Set<UIOpenURLContext>) {
        SceneDelegateProxy.shared.scene(scene, openURLContexts: URLContexts)
    }

    func scene(_ scene: UIScene, continue userActivity: NSUserActivity) {
        SceneDelegateProxy.shared.scene(scene, continue: userActivity)
    }
}

// MARK: - Capped downloads

class BridgeViewController: CAPBridgeViewController {
  // Before the web view loads, which is told then which plugins it has.
  override func capacitorDidLoad() {
    bridge?.registerPluginInstance(CappedDownloadPlugin())
  }
}

@objc(CappedDownloadPlugin)
class CappedDownloadPlugin: CAPPlugin, CAPBridgedPlugin {
  let identifier = "CappedDownloadPlugin"
  let jsName = "CappedDownload"
  let pluginMethods: [CAPPluginMethod] = [
    CAPPluginMethod(name: "get", returnType: CAPPluginReturnPromise),
    CAPPluginMethod(name: "cancel", returnType: CAPPluginReturnPromise)
  ]

  // Written on the bridge's queue and on each session's, hence the lock.
  private var downloads: [String: CappedDownload] = [:]
  private let lock = NSLock()

  @objc func get(_ call: CAPPluginCall) {
    guard let id = call.getString("id"),
          let address = call.getString("url"), let url = URL(string: address),
          let headers = call.getObject("headers")?.compactMapValues({ $0 as? String }),
          let responseHeaders = call.getArray("responseHeaders")?.compactMap({ $0 as? String }),
          let maxBytes = call.getInt("maxBytes"), maxBytes > 0,
          let idleTimeout = call.getInt("idleTimeout"), idleTimeout > 0,
          let timeout = call.getInt("timeout"), timeout > 0 else {
      call.reject("id, url, headers, responseHeaders, maxBytes, idleTimeout and timeout are required")
      return
    }
    let download = CappedDownload(url: url, headers: headers, responseHeaders: responseHeaders, maxBytes: maxBytes, idleTimeout: TimeInterval(idleTimeout) / 1000, totalTimeout: TimeInterval(timeout) / 1000)
    // Before it starts, as it can end at once.
    lock.lock()
    downloads[id] = download
    lock.unlock()
    download.start { [weak self, weak download] result in
      self?.forget(id, download)
      switch result {
      case .success(let answer):
        call.resolve(["status": answer.status, "headers": answer.headers, "data": answer.body.base64EncodedString()])
      case .failure(CappedDownload.Failure.tooLarge):
        call.reject("The download is larger than its limit", "TOO_LARGE")
      case .failure(CappedDownload.Failure.canceled):
        call.reject("The download was canceled", "CANCELED")
      case .failure:
        // Not the error, which quotes the URL, and that can be a secret.
        call.reject("The download failed")
      }
    }
  }

  @objc func cancel(_ call: CAPPluginCall) {
    guard let id = call.getString("id") else {
      call.reject("id is required")
      return
    }
    lock.lock()
    let download = downloads[id]
    lock.unlock()
    download?.cancel()
    call.resolve()
  }

  private func forget(_ id: String, _ download: CappedDownload?) {
    lock.lock()
    if downloads[id] === download {
      downloads[id] = nil
    }
    lock.unlock()
  }
}

// Unchecked: once started, its state is only touched on the session's delegate queue, which is serial.
final class CappedDownload: NSObject, @unchecked Sendable {
  struct Answer {
    let status: Int
    let headers: [String: String]
    let body: Data
  }

  enum Failure: Error {
    case tooLarge, canceled, notHTTP, timedOut
  }

  private let request: URLRequest
  private let responseHeaders: [String]
  private let maxBytes: Int
  private let idleTimeout: TimeInterval
  private let totalTimeout: TimeInterval
  private var completion: ((Result<Answer, Error>) -> Void)?
  private weak var session: URLSession?
  private var finished = false
  private var status = 0
  private var answered: [String: String] = [:]
  private var deadline: DispatchWorkItem?
  private var body = Data()

  init(url: URL, headers: [String: String], responseHeaders: [String], maxBytes: Int, idleTimeout: TimeInterval, totalTimeout: TimeInterval) {
    var request = URLRequest(url: url, cachePolicy: .reloadIgnoringLocalCacheData, timeoutInterval: idleTimeout)
    request.httpShouldHandleCookies = false
    // URLSession negotiates compression and decodes it, which it isn't sure to do for an encoding set by hand.
    request.allHTTPHeaderFields = headers.filter { $0.key.lowercased() != "accept-encoding" }
    self.request = request
    self.responseHeaders = responseHeaders
    self.maxBytes = maxBytes
    self.idleTimeout = idleTimeout
    self.totalTimeout = totalTimeout
  }

  func start(completion: @escaping (Result<Answer, Error>) -> Void) {
    self.completion = completion
    // Ephemeral: no disk cache, where a user's image would outlive logout, and no cookies.
    let configuration = URLSessionConfiguration.ephemeral
    configuration.urlCache = nil
    configuration.requestCachePolicy = .reloadIgnoringLocalCacheData
    configuration.httpCookieStorage = nil
    configuration.httpShouldSetCookies = false
    configuration.timeoutIntervalForRequest = idleTimeout
    let session = URLSession(configuration: configuration, delegate: self, delegateQueue: nil)
    self.session = session
    // The idle timeout restarts with each byte, so a trickle of headers or body would otherwise hold on for good. Cancelled on finish, which lets the session go.
    let deadline = DispatchWorkItem { [weak self] in self?.stop(.timedOut) }
    self.deadline = deadline
    session.dataTask(with: request).resume()
    DispatchQueue.global().asyncAfter(deadline: .now() + totalTimeout, execute: deadline)
  }

  func cancel() {
    stop(.canceled)
  }

  private func stop(_ failure: Failure) {
    guard let session = session else { return }
    session.delegateQueue.addOperation { self.finish(.failure(failure), session) }
  }

  // Only ever on the delegate queue, which is serial.
  private func finish(_ result: Result<Answer, Error>, _ session: URLSession) {
    guard !finished else { return }
    finished = true
    deadline?.cancel()
    deadline = nil
    body = Data()
    session.invalidateAndCancel()
    completion?(result)
    completion = nil
  }

  private func named(in response: HTTPURLResponse) -> [String: String] {
    var named: [String: String] = [:]
    for name in responseHeaders where !name.lowercased().hasPrefix("set-cookie") {
      guard let value = response.value(forHTTPHeaderField: name) else { continue }
      named[name.lowercased()] = CappedDownload.asUTF8(value)
    }
    return named
  }

  // CFNetwork can hand a header's UTF-8 bytes over as Latin-1, where Android reads UTF-8.
  private static func asUTF8(_ value: String) -> String {
    guard let bytes = value.data(using: .isoLatin1), let text = String(data: bytes, encoding: .utf8) else { return value }
    return text
  }
}

extension CappedDownload: URLSessionDataDelegate {
  func urlSession(_ session: URLSession, task: URLSessionTask, willPerformHTTPRedirection response: HTTPURLResponse, newRequest request: URLRequest, completionHandler: @escaping (URLRequest?) -> Void) {
    completionHandler(nil)
    finish(.success(Answer(status: response.statusCode, headers: named(in: response), body: Data())), session)
  }

  func urlSession(_ session: URLSession, dataTask: URLSessionDataTask, didReceive response: URLResponse, completionHandler: @escaping (URLSession.ResponseDisposition) -> Void) {
    guard let http = response as? HTTPURLResponse else {
      completionHandler(.cancel)
      return finish(.failure(Failure.notHTTP), session)
    }
    status = http.statusCode
    answered = named(in: http)
    if status != 200 {
      completionHandler(.cancel)
      return finish(.success(Answer(status: status, headers: answered, body: Data())), session)
    }
    // An announced length can be of the compressed bytes, and compression can also make a body longer.
    let coding = http.value(forHTTPHeaderField: "Content-Encoding")?.lowercased() ?? ""
    if coding.isEmpty || coding == "identity", http.expectedContentLength > Int64(maxBytes) {
      completionHandler(.cancel)
      return finish(.failure(Failure.tooLarge), session)
    }
    completionHandler(.allow)
  }

  func urlSession(_ session: URLSession, dataTask: URLSessionDataTask, didReceive data: Data) {
    guard !finished else { return }
    if data.count > maxBytes - body.count {
      return finish(.failure(Failure.tooLarge), session)
    }
    body.append(data)
  }

  func urlSession(_ session: URLSession, task: URLSessionTask, didCompleteWithError error: Error?) {
    if let error = error {
      return finish(.failure(error), session)
    }
    finish(.success(Answer(status: status, headers: answered, body: body)), session)
  }
}
