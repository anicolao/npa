import SwiftUI

struct ContentView: View {
    var body: some View {
        GameWebView()
            .background(menuBarBackground)
    }

    private var menuBarBackground: Color {
        Color(red: 26.0 / 255.0, green: 29.0 / 255.0, blue: 68.0 / 255.0)
    }
}

#Preview {
    ContentView()
}
