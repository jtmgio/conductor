import AppKit

// Conductor.app — a native window around the Conductor web app.
//
// The UI itself stays web: this process owns the window, the menu bar, and the
// failure states a WKWebView cannot express on its own. Todo.app is unaffected
// and keeps its own bundle, LaunchAgent and hotkey.

final class AppDelegate: NSObject, NSApplicationDelegate {
    private var window: WebWindowController?

    func applicationDidFinishLaunching(_ notification: Notification) {
        NSApp.setActivationPolicy(.regular)
        buildMenu()

        let controller = WebWindowController()
        controller.showWindow(nil)
        window = controller

        NSApp.activate(ignoringOtherApps: true)
    }

    // Closing the window quits. Deliberate, for now: a browser tab you can close
    // is currently the only escape from the alert layer, and making the app
    // resident before that layer is arbitrated would raise the interruption rate
    // rather than lower it. Flip to `false` when the menu-bar extra lands.
    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool {
        return true
    }

    // Clicking the Dock icon with no window open reopens one.
    func applicationShouldHandleReopen(_ sender: NSApplication, hasVisibleWindows flag: Bool) -> Bool {
        if !flag { window?.showWindow(nil) }
        return true
    }

    /// A minimal menu bar.
    ///
    /// Not decoration: without an Edit menu, ⌘C/⌘V/⌘Z do nothing inside a
    /// WKWebView, and without an App menu there is no ⌘Q. The fuller menu —
    /// real commands mapped to app actions — is a later milestone.
    private func buildMenu() {
        let main = NSMenu()

        let appItem = NSMenuItem()
        let appMenu = NSMenu()
        appMenu.addItem(withTitle: "About Conductor", action: #selector(NSApplication.orderFrontStandardAboutPanel(_:)), keyEquivalent: "")
        appMenu.addItem(.separator())
        appMenu.addItem(withTitle: "Hide Conductor", action: #selector(NSApplication.hide(_:)), keyEquivalent: "h")
        let hideOthers = appMenu.addItem(withTitle: "Hide Others", action: #selector(NSApplication.hideOtherApplications(_:)), keyEquivalent: "h")
        hideOthers.keyEquivalentModifierMask = [.command, .option]
        appMenu.addItem(withTitle: "Show All", action: #selector(NSApplication.unhideAllApplications(_:)), keyEquivalent: "")
        appMenu.addItem(.separator())
        appMenu.addItem(withTitle: "Quit Conductor", action: #selector(NSApplication.terminate(_:)), keyEquivalent: "q")
        appItem.submenu = appMenu
        main.addItem(appItem)

        let editItem = NSMenuItem()
        let edit = NSMenu(title: "Edit")
        edit.addItem(withTitle: "Undo", action: Selector(("undo:")), keyEquivalent: "z")
        let redo = edit.addItem(withTitle: "Redo", action: Selector(("redo:")), keyEquivalent: "z")
        redo.keyEquivalentModifierMask = [.command, .shift]
        edit.addItem(.separator())
        edit.addItem(withTitle: "Cut", action: #selector(NSText.cut(_:)), keyEquivalent: "x")
        edit.addItem(withTitle: "Copy", action: #selector(NSText.copy(_:)), keyEquivalent: "c")
        edit.addItem(withTitle: "Paste", action: #selector(NSText.paste(_:)), keyEquivalent: "v")
        edit.addItem(withTitle: "Select All", action: #selector(NSText.selectAll(_:)), keyEquivalent: "a")
        editItem.submenu = edit
        main.addItem(editItem)

        // Go menu — the shortcuts the web app binds, now discoverable. Without a
        // menu bar they were undocumented (and the in-app sheet listed ⌘2/⌘4 as
        // each other's opposite for months).
        let goItem = NSMenuItem()
        let go = NSMenu(title: "Go")
        let destinations: [(String, String, Selector)] = [
            ("Today", "1", #selector(WebWindowController.goToday)),
            ("Board", "2", #selector(WebWindowController.goBoard)),
            ("Tracker", "3", #selector(WebWindowController.goTracker)),
            ("Formatter", "4", #selector(WebWindowController.goFormatter)),
            ("Meetings", "5", #selector(WebWindowController.goMeetings)),
        ]
        for (title, key, sel) in destinations {
            go.addItem(withTitle: title, action: sel, keyEquivalent: key)
        }
        go.addItem(.separator())
        go.addItem(withTitle: "Settings", action: #selector(WebWindowController.goSettings), keyEquivalent: ",")
        goItem.submenu = go
        main.addItem(goItem)

        let viewItem = NSMenuItem()
        let view = NSMenu(title: "View")
        view.addItem(withTitle: "Reload", action: #selector(WebWindowController.reload), keyEquivalent: "r")
        view.addItem(.separator())
        let full = view.addItem(withTitle: "Enter Full Screen", action: #selector(NSWindow.toggleFullScreen(_:)), keyEquivalent: "f")
        full.keyEquivalentModifierMask = [.command, .control]
        viewItem.submenu = view
        main.addItem(viewItem)

        let windowItem = NSMenuItem()
        let windowMenu = NSMenu(title: "Window")
        windowMenu.addItem(withTitle: "Minimize", action: #selector(NSWindow.miniaturize(_:)), keyEquivalent: "m")
        windowMenu.addItem(withTitle: "Zoom", action: #selector(NSWindow.zoom(_:)), keyEquivalent: "")
        windowMenu.addItem(.separator())
        windowMenu.addItem(withTitle: "Close", action: #selector(NSWindow.performClose(_:)), keyEquivalent: "w")
        windowItem.submenu = windowMenu
        main.addItem(windowItem)
        NSApp.windowsMenu = windowMenu

        NSApp.mainMenu = main
    }
}

let app = NSApplication.shared
let delegate = AppDelegate()
app.delegate = delegate
app.run()
