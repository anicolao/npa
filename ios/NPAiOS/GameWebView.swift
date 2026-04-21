import Foundation
import SwiftUI
import WebKit

struct GameWebView: UIViewRepresentable {
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

        let controller = WKUserContentController()
        controller.add(context.coordinator, name: ScriptBridge.name)

        if let cssScript = InjectedResources.cssInjectionScript() {
            controller.addUserScript(
                WKUserScript(
                    source: cssScript,
                    injectionTime: .atDocumentStart,
                    forMainFrameOnly: true,
                    in: .page
                )
            )
        }

        if let javaScript = InjectedResources.javaScriptInjectionScript() {
            controller.addUserScript(
                WKUserScript(
                    source: javaScript,
                    injectionTime: .atDocumentEnd,
                    forMainFrameOnly: true,
                    in: .page
                )
            )
        }

        configuration.userContentController = controller

        let webView = WKWebView(frame: .zero, configuration: configuration)
        webView.navigationDelegate = context.coordinator
        webView.scrollView.contentInsetAdjustmentBehavior = .never
        webView.allowsBackForwardNavigationGestures = true
        webView.customUserAgent = DesktopUserAgent.value

        if #available(iOS 16.4, *) {
            webView.isInspectable = true
        }

        webView.load(URLRequest(url: startURL))
        return webView
    }

    func updateUIView(_ uiView: WKWebView, context: Context) {}
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

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        let script = """
        (() => ({
          href: window.location.href,
          readyState: document.readyState,
          hasNeptunesPride: typeof window.NeptunesPride !== "undefined",
          hasCrux: typeof window.Crux !== "undefined",
          hasNpaStyle: !!document.getElementById("npa-ios-style"),
          injectionState: window.__NPAiOSInjectionState ?? null,
          title: document.title
        }))();
        """

        webView.evaluateJavaScript(script) { result, error in
            if let error {
                NSLog("NPA iOS: page probe failed: %@", String(describing: error))
                return
            }

            NSLog("NPA iOS: page probe %@", String(describing: result))

            let badgeScript = """
            (() => {
              const probe = \(javaScriptString(from: result));
              const id = "__npa-ios-debug-badge";
              let node = document.getElementById(id);
              if (!node) {
                node = document.createElement("div");
                node.id = id;
                node.style.position = "fixed";
                node.style.top = "12px";
                node.style.right = "12px";
                node.style.zIndex = "2147483647";
                node.style.padding = "8px 10px";
                node.style.borderRadius = "10px";
                node.style.background = "rgba(0,0,0,0.78)";
                node.style.color = "#7CFF9B";
                node.style.font = "12px/1.3 -apple-system, BlinkMacSystemFont, sans-serif";
                node.style.whiteSpace = "pre-wrap";
                node.style.maxWidth = "70vw";
                node.style.pointerEvents = "none";
                (document.body || document.documentElement).appendChild(node);
              }
              const state = probe?.injectionState;
              const lines = [
                `NPA bridge`,
                `NP: ${probe?.hasNeptunesPride ? "yes" : "no"}  Crux: ${probe?.hasCrux ? "yes" : "no"}`,
                `state: ${state?.type ?? "none"}`,
                `${probe?.href ?? ""}`
              ];
              if (state?.message) lines.splice(3, 0, `err: ${state.message}`);
              node.textContent = lines.join("\\n");
            })();
            """

            webView.evaluateJavaScript(badgeScript, completionHandler: nil)
        }
    }
}

extension Coordinator: WKScriptMessageHandler {
    func userContentController(
        _ userContentController: WKUserContentController,
        didReceive message: WKScriptMessage
    ) {
        guard message.name == ScriptBridge.name else {
            return
        }

        NSLog("NPA iOS: script bridge %@", String(describing: message.body))
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
          script.textContent = \(javaScriptStringLiteral(pageBootstrapScript(for: source)));
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

    private static func pageBootstrapScript(for source: String) -> String {
        """
        (() => {
          window.__NPAiOSInjectionState = { type: "starting", href: window.location.href };
          const send = (payload) => {
            try {
              window.webkit?.messageHandlers?.\(ScriptBridge.name)?.postMessage(payload);
            } catch (_) {}
          };
          send({
            type: "before",
            href: window.location.href,
            readyState: document.readyState,
            userAgent: navigator.userAgent
          });
          try {
            \(source)
            window.__NPAiOSInjectionState = {
              type: "after",
              href: window.location.href,
              hasNeptunesPride: typeof window.NeptunesPride !== "undefined",
              hasCrux: typeof window.Crux !== "undefined"
            };
            send(window.__NPAiOSInjectionState);
          } catch (error) {
            window.__NPAiOSInjectionState = {
              type: "error",
              href: window.location.href,
              message: String(error),
              stack: error?.stack ?? null
            };
            send({
              type: "error",
              href: window.location.href,
              message: String(error),
              stack: error?.stack ?? null
            });
            throw error;
          }
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

private enum ScriptBridge {
    static let name = "npaBridge"
}

private func javaScriptString(from value: Any?) -> String {
    guard let value else {
        return "null"
    }

    if JSONSerialization.isValidJSONObject(value),
       let data = try? JSONSerialization.data(withJSONObject: value),
       let string = String(data: data, encoding: .utf8) {
        return string
    }

    if let string = value as? String {
        return "\"\(string.replacingOccurrences(of: "\"", with: "\\\""))\""
    }

    return "null"
}
