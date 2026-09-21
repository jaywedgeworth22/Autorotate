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

    @Environment(AppModel.self) private var appModel
    @State private var biometricPrompted = false

    var body: some View {
        // AR31-24 (2026-09-20): previously the TabView was always rendered
        // even when `appModel.isUnlocked == false` — the Face ID gate was
        // wired up in AppModel.authenticateWithBiometrics() but never
        // surfaced to the view hierarchy, so a stolen/lost device showed
        // the full secret list with no auth challenge.  Gate the tabs
        // behind a locked overlay when biometrics are enabled, and prompt
        // once on first appearance.
        Group {
            if appModel.isUnlocked {
                mainTabs
            } else {
                LockedOverlay(onUnlock: { Task { await appModel.authenticateWithBiometrics() } })
            }
        }
        .autoRotateScreenBackground()
        .appUpdatePrompt()
        .task {
            // Prompt once per session the first time the view appears.
            guard !biometricPrompted else { return }
            biometricPrompted = true
            await appModel.authenticateWithBiometrics()
        }
    }

    private var mainTabs: some View {
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
    }
}

/// AR31-24: the lock screen covers the TabView until the user unlocks via
/// Face ID / Touch ID / passcode.  Pure presentational; all auth logic
/// lives in AppModel so the model owns the `isUnlocked` source of truth.
private struct LockedOverlay: View {
    let onUnlock: () -> Void
    var body: some View {
        ZStack {
            Theme.background.ignoresSafeArea()
            VStack(spacing: 18) {
                Image(systemName: "faceid")
                    .font(.system(size: 64, weight: .light))
                    .foregroundStyle(Theme.accent)
                Text("Autorotate is locked")
                    .font(.title2.weight(.semibold))
                    .foregroundStyle(.primary)
                Text("Authenticate to view your zero-plaintext secret inventory.")
                    .font(.callout)
                    .multilineTextAlignment(.center)
                    .foregroundStyle(.secondary)
                    .padding(.horizontal, 32)
                Button(action: onUnlock) {
                    Label("Unlock with Face ID", systemImage: "faceid")
                        .frame(maxWidth: 280)
                        .padding(.vertical, 12)
                        .background(Theme.accent)
                        .foregroundStyle(.black)
                        .clipShape(RoundedRectangle(cornerRadius: 12))
                }
            }
        }
    }
}

#Preview {
    ContentView()
        .environment(AppModel(container: try! AutorotateSchema.makeContainer(inMemory: true)))
}
