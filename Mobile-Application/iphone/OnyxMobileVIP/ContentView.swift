import SwiftUI
import WebKit

/**
 * Onyx DJ™ SwiftUI Web Container View
 */
struct ContentView: View {
    @State private var deepLinkRoom: String?

    var body: some View {
        ZStack {
            Color(red: 0.03, green: 0.01, blue: 0.05)
                .ignoresSafeArea()

            OnyxWebViewRepresentable(deepLinkRoom: deepLinkRoom)
                .ignoresSafeArea()
        }
        .onOpenURL { url in
            if let components = URLComponents(url: url, resolvingAgainstBaseURL: true),
               let room = components.queryItems?.first(where: { $0.name == "room" })?.value {
                self.deepLinkRoom = room
            }
        }
    }
}

struct OnyxWebViewRepresentable: UIViewRepresentable {
    var deepLinkRoom: String?

    func makeCoordinator() -> Coordinator {
        Coordinator(self)
    }

    func makeUIView(context: Context) -> WKWebView {
        let configuration = WKWebViewConfiguration()
        let contentController = WKUserContentController()

        let handler = OnyxScriptMessageHandler()
        contentController.add(handler, name: "onyxNative")
        configuration.userContentController = contentController
        configuration.allowsInlineMediaPlayback = true
        configuration.mediaTypesRequiringUserActionForPlayback = []

        let webView = WKWebView(frame: .zero, configuration: configuration)
        webView.isOpaque = false
        webView.backgroundColor = UIColor(red: 0.03, green: 0.01, blue: 0.05, alpha: 1.0)
        webView.scrollView.bounces = false
        webView.scrollView.contentInsetAdjustmentBehavior = .never
        webView.uiDelegate = context.coordinator

        context.coordinator.webView = webView
        handler.viewController = context.coordinator.parentViewController

        loadBundledApp(into: webView)
        return webView
    }

    func updateUIView(_ uiView: WKWebView, context: Context) {
        if let room = deepLinkRoom {
            let script = "if (window.initRoomFromUrl) { window.initRoomFromUrl('\(room)'); }"
            uiView.evaluateJavaScript(script, completionHandler: nil)
        }
    }

    private func loadBundledApp(into webView: WKWebView) {
        if let bundleUrl = Bundle.main.url(forResource: "index", withExtension: "html", subdirectory: "www") {
            let directoryUrl = bundleUrl.deletingLastPathComponent()
            webView.loadFileURL(bundleUrl, allowingReadAccessTo: directoryUrl)
        } else {
            // Fallback: search anywhere in bundle
            if let rootUrl = Bundle.main.url(forResource: "index", withExtension: "html") {
                webView.loadFileURL(rootUrl, allowingReadAccessTo: rootUrl.deletingLastPathComponent())
            }
        }
    }

    class Coordinator: NSObject, WKUIDelegate {
        var parent: OnyxWebViewRepresentable
        weak var parentViewController: UIViewController?
        weak var webView: WKWebView?

        init(_ parent: OnyxWebViewRepresentable) {
            self.parent = parent
        }

        // Grant camera and media permissions inside WKWebView on iOS 15+
        @available(iOS 15.0, *)
        func webView(
            _ webView: WKWebView,
            requestMediaCapturePermissionFor origin: WKSecurityOrigin,
            initiatedByFrame frame: WKFrameInfo,
            type: WKMediaCaptureType,
            decisionHandler: @escaping (WKPermissionDecision) -> Void
        ) {
            decisionHandler(.grant)
        }
    }
}
