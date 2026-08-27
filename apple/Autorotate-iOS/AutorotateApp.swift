//
//  AutorotateApp.swift
//  Autorotate-iOS
//
//  App entry point: builds the SwiftData container + AppModel, registers the
//  BGAppRefreshTask (com.autorotate.refresh) before launch completes, schedules
//  background refreshes when the app moves to the background.
//

import SwiftUI
import SwiftData
import BackgroundTasks

@main
struct AutorotateApp: App {

    @Environment(\.scenePhase) private var scenePhase

    private let model: AppModel
    private let container: ModelContainer
    @State private var containerError: String?

    @MainActor
    init() {
        let builtContainer: ModelContainer
        do {
            builtContainer = try AutorotateSchema.makeContainer()
        } catch {
            // Fall back to an in-memory container so the app still boots and
            // can surface the error instead of crashing.
            builtContainer = (try? AutorotateSchema.makeContainer(inMemory: true))
                ?? { fatalError("Autorotate: cannot create SwiftData container: \(error)") }()
            _containerError = State(initialValue:
                "Persistent store unavailable — running in memory. (\(error.localizedDescription))")
        }
        self.container = builtContainer

        let appModel = AppModel(container: builtContainer)
        self.model = appModel

        // BGTaskScheduler requires registration before launch completes.
        BackgroundRotation.register { task in
            Task { @MainActor in
                appModel.handleBackgroundRefresh(task)
            }
        }

    }

    private var showsContainerError: Binding<Bool> {
        Binding(
            get: { containerError != nil },
            set: { if !$0 { containerError = nil } })
    }

    var body: some Scene {
        WindowGroup {
            ContentView()
                .environment(model)
                .modelContainer(container)
                .preferredColorScheme(.dark)
                .tint(Theme.accent)
                .alert("Storage warning", isPresented: showsContainerError) {
                    Button("OK", role: .cancel) {}
                } message: {
                    Text(containerError ?? "")
                }
        }
        .onChange(of: scenePhase) { _, newPhase in
            if newPhase == .background {
                BackgroundRotation.scheduleAppRefresh()
            }
        }
    }
}
