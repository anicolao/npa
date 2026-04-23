import Foundation
import SwiftUI
import WebKit

struct GameWebView: UIViewRepresentable {
    @ObservedObject var controller: GameWebViewController
    private let startURL = URL(string: "https://np.ironhelmet.com/")!

    func makeCoordinator() -> Coordinator {
        Coordinator()
    }

    func makeUIView(context: Context) -> WKWebView {
        let configuration = WKWebViewConfiguration()
        let preferences = WKWebpagePreferences()
        preferences.preferredContentMode = .desktop
        configuration.defaultWebpagePreferences = preferences
        configuration.allowsInlineMediaPlayback = true
        configuration.websiteDataStore = .default()

        let userContentController = WKUserContentController()

        if let cssScript = InjectedResources.cssInjectionScript() {
            userContentController.addUserScript(
                WKUserScript(
                    source: cssScript,
                    injectionTime: .atDocumentStart,
                    forMainFrameOnly: true,
                    in: .page
                )
            )
        }

        if let javaScript = InjectedResources.javaScriptInjectionScript() {
            userContentController.addUserScript(
                WKUserScript(
                    source: javaScript,
                    injectionTime: .atDocumentEnd,
                    forMainFrameOnly: true,
                    in: .page
                )
            )
        }

        configuration.userContentController = userContentController

        let webView = WKWebView(frame: .zero, configuration: configuration)
        webView.navigationDelegate = context.coordinator
        webView.scrollView.contentInsetAdjustmentBehavior = .never
        webView.allowsBackForwardNavigationGestures = true
        webView.customUserAgent = DesktopUserAgent.value
        controller.attach(webView)

        if #available(iOS 16.4, *) {
            webView.isInspectable = true
        }

        webView.load(URLRequest(url: startURL))
        return webView
    }

    func updateUIView(_ uiView: WKWebView, context: Context) {}
}

final class GameWebViewController: ObservableObject {
    private weak var webView: WKWebView?

    func attach(_ webView: WKWebView) {
        self.webView = webView
    }

    func scrollToTop() {
        guard let scrollView = webView?.scrollView else { return }
        let topOffset = CGPoint(x: scrollView.contentOffset.x, y: -scrollView.adjustedContentInset.top)
        scrollView.setContentOffset(topOffset, animated: true)
    }

    func scrollToBottom() {
        guard let scrollView = webView?.scrollView else { return }

        let topOffsetY = -scrollView.adjustedContentInset.top
        let bottomOffsetY = max(
            topOffsetY,
            scrollView.contentSize.height - scrollView.bounds.height + scrollView.adjustedContentInset.bottom
        )

        let bottomOffset = CGPoint(x: scrollView.contentOffset.x, y: bottomOffsetY)
        scrollView.setContentOffset(bottomOffset, animated: true)
    }
}

final class Coordinator: NSObject, WKNavigationDelegate {
    deinit {
        NSLog("NPA iOS: coordinator deinited")
    }

    func webView(
        _ webView: WKWebView,
        decidePolicyFor navigationAction: WKNavigationAction,
        decisionHandler: @escaping (WKNavigationActionPolicy) -> Void
    ) {
        if navigationAction.targetFrame == nil, let url = navigationAction.request.url {
            webView.load(URLRequest(url: url))
            decisionHandler(.cancel)
            return
        }

        decisionHandler(.allow)
    }
}

private enum DesktopUserAgent {
    // Force the desktop Neptune's Pride web client instead of the iPhone-specific UI.
    static let value =
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) " +
        "AppleWebKit/605.1.15 (KHTML, like Gecko) " +
        "Version/18.0 Safari/605.1.15"
}

private enum InjectedResources {
    private static let distSubdirectory = "Dist"

    static func javaScriptInjectionScript() -> String? {
        guard let source = loadTextResource(named: "intel", withExtension: "js", subdirectory: distSubdirectory) else {
            return nil
        }

        return """
        (() => {
          if (document.getElementById("intel")) return;
          const script = document.createElement("script");
          script.id = "intel";
          script.title = "Neptune's Pride Agent iOS";
          script.textContent = \(javaScriptStringLiteral(source));
          (document.head || document.documentElement).appendChild(script);
          script.remove();
        })();
        """
    }

    static func cssInjectionScript() -> String? {
        guard let css = loadTextResource(named: "intel", withExtension: "css", subdirectory: distSubdirectory) else {
            return nil
        }

        return """
        (() => {
          const styleId = "npa-ios-style";
          let styleElement = document.getElementById(styleId);
          if (!styleElement) {
            styleElement = document.createElement("style");
            styleElement.id = styleId;
            (document.head || document.documentElement).appendChild(styleElement);
          }
          styleElement.textContent = \(javaScriptStringLiteral(css));
        })();
        """
    }

    private static func loadTextResource(
        named name: String,
        withExtension fileExtension: String,
        subdirectory: String? = nil
    ) -> String? {
        guard let url = Bundle.main.url(forResource: name, withExtension: fileExtension, subdirectory: subdirectory) else {
            let location = subdirectory.map { "\($0)/" } ?? ""
            assertionFailure("Missing bundled resource: \(location)\(name).\(fileExtension)")
            return nil
        }

        do {
            return try String(contentsOf: url, encoding: .utf8)
        } catch {
            assertionFailure("Failed to read bundled resource: \(name).\(fileExtension): \(error)")
            return nil
        }
    }

    private static func javaScriptStringLiteral(_ text: String) -> String {
        let payload = [text]

        guard
            let data = try? JSONSerialization.data(withJSONObject: payload),
            let serialized = String(data: data, encoding: .utf8),
            serialized.count >= 2
        else {
            return "\"\""
        }

        return String(serialized.dropFirst().dropLast())
    }
}
