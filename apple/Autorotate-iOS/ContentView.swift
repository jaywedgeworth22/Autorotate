//
//  ContentView.swift
//  Autorotate-iOS
//
//  Root TabView: Dashboard, Secrets, Rotation Runs, Settings.
//

import SwiftUI
import SwiftData
import AutorotateCore

struct ContentView: View {

    var body: some View {
        TabView {
            DashboardView()
                .tabItem {
                    Label("Dashboard", systemImage: "gauge.with.dots.needle.bottom.50percent")
                }

            SecretsListView()
                .tabItem {
                    Label("Secrets", systemImage: "key.fill")
                }

            RunsView()
                .tabItem {
                    Label("Runs", systemImage: "arrow.triangle.2.circlepath")
                }

            SettingsView()
                .tabItem {
                    Label("Settings", systemImage: "gearshape.fill")
                }
        }
        .autoRotateScreenBackground()
        .appUpdatePrompt()
    }
}

#Preview {
    ContentView()
        .environment(AppModel(container: try! AutorotateSchema.makeContainer(inMemory: true)))
}
