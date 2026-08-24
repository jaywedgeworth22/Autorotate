//
//  Bookmarks.swift
//  TopSpin-macOS
//
//  Security-scoped bookmark management for sandboxed file-target access.
//
//  SANDBOX MODEL
//  -------------
//  The app runs with the App Sandbox and declares only
//  `com.apple.security.files.user-selected.read-write`: it may read and
//  write files the user explicitly picks (NSOpenPanel) or drags in. To keep
//  that access across launches — so scheduled background rotations can
//  rewrite e.g. `~/.aws/credentials` without asking again — we persist a
//  security-scoped bookmark per registered file target
//  (`URL.bookmarkData(options: .withSecurityScope)`) in SwiftData.
//
//  At rotation time the bookmark is resolved and
//  `startAccessingSecurityScopedResource()` is called for the whole
//  duration of the pipeline run; `FileTargetEngine` then operates on plain
//  paths. Stale bookmarks are refreshed automatically when possible.
//
//  NOTE: `.withSecurityScope` requires the
//  `com.apple.security.files.bookmarks.app-scope` entitlement, which is
//  included in `TopSpinMac.entitlements` alongside the user-selected
//  read-write entitlement.
//

import Foundation

/// Errors thrown by ``BookmarkStore``.
enum BookmarkError: Error, CustomStringConvertible {
    /// The bookmark data could not be created.
    case creationFailed(String)
    /// The bookmark could not be resolved (file moved or access revoked).
    case resolutionFailed(String)

    var description: String {
        switch self {
        case .creationFailed(let m):   return "Could not create security-scoped bookmark: \(m)"
        case .resolutionFailed(let m): return "Could not resolve security-scoped bookmark: \(m)"
        }
    }
}

/// Creates, persists and resolves security-scoped bookmarks for user-picked
/// file targets. Value type, `Sendable`; the bookmark blobs themselves live
/// in the SwiftData `FileTargetEntity` rows.
struct BookmarkStore: Sendable {

    /// Creates a security-scoped bookmark for a URL the user just picked
    /// (the URL must currently be accessible, i.e. fresh from NSOpenPanel
    /// or a drop).
    func createBookmark(for url: URL) throws -> Data {
        do {
            return try url.bookmarkData(
                options: .withSecurityScope,
                includingResourceValuesForKeys: nil,
                relativeTo: nil)
        } catch {
            throw BookmarkError.creationFailed(error.localizedDescription)
        }
    }

    /// Resolves a persisted bookmark back to a URL.
    ///
    /// When the bookmark is stale (file moved), a fresh bookmark is produced
    /// and returned alongside the URL so the caller can persist it.
    func resolve(_ data: Data) throws -> (url: URL, refreshedBookmark: Data?) {
        var stale = false
        let url: URL
        do {
            url = try URL(resolvingBookmarkData: data,
                          options: .withSecurityScope,
                          relativeTo: nil,
                          bookmarkDataIsStale: &stale)
        } catch {
            throw BookmarkError.resolutionFailed(error.localizedDescription)
        }
        var refreshed: Data?
        if stale {
            refreshed = try? createBookmark(for: url)
        }
        return (url, refreshed)
    }

    /// Resolves a bookmark and runs `body` while holding security-scoped
    /// access to the resource. Access is always released, even on throw.
    func withAccess<T>(_ data: Data, _ body: (URL) throws -> T) throws -> T {
        let (url, _) = try resolve(data)
        let accessing = url.startAccessingSecurityScopedResource()
        defer { if accessing { url.stopAccessingSecurityScopedResource() } }
        return try body(url)
    }
}

/// RAII-style scope that holds security-scoped access to a set of URLs for
/// the duration of a rotation batch. All accesses are released on `end()`.
///
/// The rotation engine works with plain paths (``FileTargetEngine``), so the
/// app must hold the scoped access *around* each pipeline run rather than
/// inside the core package.
final class SecurityScope {
    private var accessedURLs: [URL] = []

    /// Starts accessing `urls` (duplicates and failures are tolerated — a
    /// failed file target will surface as a failed PUSH step instead).
    init(urls: [URL]) {
        for url in urls where url.startAccessingSecurityScopedResource() {
            accessedURLs.append(url)
        }
    }

    /// Releases every held resource. Idempotent.
    func end() {
        for url in accessedURLs {
            url.stopAccessingSecurityScopedResource()
        }
        accessedURLs.removeAll()
    }

    deinit { end() }
}
