import SwiftUI

struct ContentView: View {
    @StateObject private var webViewController = GameWebViewController()

    var body: some View {
        ZStack {
            GameWebView(controller: webViewController)

            GeometryReader { geometry in
                VStack(spacing: 0) {
                    tapZone(height: geometry.safeAreaInsets.top) {
                        webViewController.scrollToTop()
                    }

                    Spacer(minLength: 0)

                    tapZone(height: geometry.safeAreaInsets.bottom) {
                        webViewController.scrollToBottom()
                    }
                }
                .ignoresSafeArea()
            }
        }
        .background(menuBarBackground)
    }

    private var menuBarBackground: Color {
        Color(red: 26.0 / 255.0, green: 29.0 / 255.0, blue: 68.0 / 255.0)
    }

    private func tapZone(height: CGFloat, action: @escaping () -> Void) -> some View {
        menuBarBackground
            .opacity(height > 0 ? 0.001 : 0)
            .frame(height: height)
            .contentShape(Rectangle())
            .onTapGesture(perform: action)
            .allowsHitTesting(height > 0)
    }
}

#Preview {
    ContentView()
}
