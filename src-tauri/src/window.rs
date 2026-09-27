#[cfg(target_os = "macos")]
use tauri::LogicalPosition;
#[cfg(any(target_os = "macos", target_os = "windows"))]
use tauri::window::{Effect, EffectsBuilder};
#[cfg(target_os = "windows")]
use windows::Win32::UI::Input::KeyboardAndMouse::{
    VIRTUAL_KEY, VK_ESCAPE, VK_LWIN, VK_MENU, VK_Z,
};
use std::sync::atomic::{AtomicBool, Ordering};
use tauri::{App, AppHandle, Manager, Runtime, WebviewWindow, WebviewWindowBuilder};

// The offset from the top of the screen to the window
const TOP_OFFSET: i32 = 54;

// Set while the dashboard is being built. Tauri only rejects a second window
// with the same label once the first is ready, so without this two quick opens
// would each build a dashboard.
static CREATING_DASHBOARD: AtomicBool = AtomicBool::new(false);

/// Sets up the main window with custom positioning
pub fn setup_main_window(app: &mut App) -> Result<(), Box<dyn std::error::Error>> {
    // Try different possible window labels
    let window = app
        .get_webview_window("main")
        .or_else(|| app.get_webview_window("echoideal"))
        .or_else(|| {
            // Get the first window if specific labels don't work
            app.webview_windows().values().next().cloned()
        })
        .ok_or("No window found")?;

    position_window_top_center(&window, TOP_OFFSET)?;

    // Set window as non-focusable on Windows
    // #[cfg(target_os = "windows")]
    // {
    //     let _ = window.set_focusable(false);
    // }

    Ok(())
}

/// Positions a window at the top center of the screen with a specified Y offset
pub fn position_window_top_center(
    window: &WebviewWindow,
    y_offset: i32,
) -> Result<(), Box<dyn std::error::Error>> {
    // Get the primary monitor
    if let Some(monitor) = window.primary_monitor()? {
        let monitor_size = monitor.size();
        let window_size = window.outer_size()?;

        // Calculate center X position
        let center_x = (monitor_size.width as i32 - window_size.width as i32) / 2;

        // Set the window position
        window.set_position(tauri::Position::Physical(tauri::PhysicalPosition {
            x: center_x,
            y: y_offset,
        }))?;
    }

    Ok(())
}

/// Future function for centering window completely (both X and Y)
#[allow(dead_code)]
pub fn center_window_completely(window: &WebviewWindow) -> Result<(), Box<dyn std::error::Error>> {
    if let Some(monitor) = window.primary_monitor()? {
        let monitor_size = monitor.size();
        let window_size = window.outer_size()?;

        let center_x = (monitor_size.width as i32 - window_size.width as i32) / 2;
        let center_y = (monitor_size.height as i32 - window_size.height as i32) / 2;

        window.set_position(tauri::Position::Physical(tauri::PhysicalPosition {
            x: center_x,
            y: center_y,
        }))?;
    }

    Ok(())
}

#[tauri::command]
pub fn set_window_height(window: tauri::WebviewWindow, height: u32) -> Result<(), String> {
    use tauri::{LogicalSize, Size};

    // Simply set the window size with fixed width and new height
    let new_size = LogicalSize::new(600.0, height as f64);
    window
        .set_size(Size::Logical(new_size))
        .map_err(|e| format!("Failed to resize window: {}", e))?;

    Ok(())
}

#[tauri::command]
pub fn set_screen_share_visibility(app: tauri::AppHandle, visible: bool) -> Result<(), String> {
    let protected = !visible;
    if let Some(main_window) = app.get_webview_window("main") {
        main_window
            .set_content_protected(protected)
            .map_err(|e| format!("Failed to set content protection on main: {}", e))?;
    }
    if let Some(dashboard_window) = app.get_webview_window("dashboard") {
        dashboard_window
            .set_content_protected(protected)
            .map_err(|e| format!("Failed to set content protection on dashboard: {}", e))?;
    }
    Ok(())
}

// Both dashboard commands are async so they run off the main thread: they may
// have to create the dashboard, which deadlocks inside a synchronous command on
// Windows (see create_dashboard_window).
#[tauri::command]
pub async fn open_dashboard(app: tauri::AppHandle) -> Result<(), String> {
    show_dashboard_window(&app)
}

#[tauri::command]
pub async fn toggle_dashboard(app: tauri::AppHandle) -> Result<(), String> {
    if let Some(dashboard_window) = app.get_webview_window("dashboard") {
        match dashboard_window.is_visible() {
            Ok(true) if !dashboard_window.is_minimized().unwrap_or(false) => {
                // Window is on screen, hide it
                dashboard_window
                    .hide()
                    .map_err(|e| format!("Failed to hide dashboard window: {}", e))?;
            }
            Ok(_) => {
                // Window is hidden or minimised, show and focus it
                show_dashboard_window(&app)?;
            }
            Err(e) => {
                return Err(format!("Failed to check dashboard visibility: {}", e));
            }
        }
    } else {
        // Window doesn't exist, create and show it
        show_dashboard_window(&app)?;
    }

    Ok(())
}

#[tauri::command]
pub fn move_window(app: tauri::AppHandle, direction: String, step: i32) -> Result<(), String> {
    if let Some(window) = app.get_webview_window("main") {
        let current_pos = window
            .outer_position()
            .map_err(|e| format!("Failed to get window position: {}", e))?;

        let (new_x, new_y) = match direction.as_str() {
            "up" => (current_pos.x, current_pos.y - step),
            "down" => (current_pos.x, current_pos.y + step),
            "left" => (current_pos.x - step, current_pos.y),
            "right" => (current_pos.x + step, current_pos.y),
            _ => return Err(format!("Invalid direction: {}", direction)),
        };

        window
            .set_position(tauri::Position::Physical(tauri::PhysicalPosition {
                x: new_x,
                y: new_y,
            }))
            .map_err(|e| format!("Failed to set window position: {}", e))?;
    } else {
        return Err("Main window not found".to_string());
    }

    Ok(())
}

/// The backdrop material behind the dashboard's title bar and sidebar: Mica on
/// Windows 11, vibrancy on macOS, and none (opaque surfaces) everywhere else.
fn dashboard_material() -> &'static str {
    #[cfg(target_os = "macos")]
    return "vibrancy";

    #[cfg(target_os = "windows")]
    if is_windows_11() {
        return "mica";
    }

    #[allow(unreachable_code)]
    "none"
}

#[cfg(target_os = "windows")]
fn is_windows_11() -> bool {
    use windows::Wdk::System::SystemServices::RtlGetVersion;
    use windows::Win32::System::SystemInformation::OSVERSIONINFOW;

    let mut info = OSVERSIONINFOW {
        dwOSVersionInfoSize: std::mem::size_of::<OSVERSIONINFOW>() as u32,
        ..Default::default()
    };
    // RtlGetVersion reports the real build, unlike GetVersionEx.
    unsafe { RtlGetVersion(&mut info) }.is_ok() && info.dwBuildNumber >= 22000
}

/// Creates the dashboard, hidden on Windows and Linux, or returns `None` if
/// another caller is already creating it.
///
/// Never call this, or `show_dashboard_window` while the dashboard may not
/// exist yet, from a synchronous command: on Windows those run inside
/// WebView2's callback on the main thread, which can't create a webview until
/// the callback returns, so the app freezes. Setup, a global shortcut's handler
/// and async commands are fine.
pub fn create_dashboard_window<R: Runtime>(
    app: &AppHandle<R>,
) -> Result<Option<WebviewWindow<R>>, tauri::Error> {
    if CREATING_DASHBOARD.swap(true, Ordering::SeqCst) {
        return Ok(None);
    }
    let window = build_dashboard_window(app);
    CREATING_DASHBOARD.store(false, Ordering::SeqCst);
    window.map(Some)
}

fn build_dashboard_window<R: Runtime>(
    app: &AppHandle<R>,
) -> Result<WebviewWindow<R>, tauri::Error> {
    let material = dashboard_material();
    let base_builder =
        WebviewWindowBuilder::new(app, "dashboard", tauri::WebviewUrl::App("/home".into()))
            .title("EchoIdeal - Dashboard")
            .center()
            .inner_size(1100.0, 720.0)
            .min_inner_size(880.0, 600.0)
            .content_protected(true)
            // The page reads this before first paint to choose see-through or opaque surfaces.
            .initialization_script(format!("window.__ECHOIDEAL_MATERIAL__ = \"{}\";", material));

    #[cfg(target_os = "macos")]
    let base_builder = base_builder
        .decorations(true)
        .hidden_title(true)
        .title_bar_style(tauri::TitleBarStyle::Overlay)
        .transparent(true)
        .effects(EffectsBuilder::new().effect(Effect::Sidebar).build())
        .visible(true)
        // Centres the traffic lights in the 52px toolbar row.
        .traffic_light_position(LogicalPosition::new(20.0, 26.0));

    // Windows and Linux draw their own title bar in the page. The shadow gives
    // Windows 11 its rounded corners and border on a frameless window.
    #[cfg(not(target_os = "macos"))]
    let base_builder = base_builder
        .decorations(false)
        .shadow(true)
        .visible(false);

    #[cfg(target_os = "windows")]
    let base_builder = if material == "mica" {
        base_builder
            .transparent(true)
            .effects(EffectsBuilder::new().effect(Effect::Mica).build())
    } else {
        base_builder
    };

    let window = base_builder.build()?;

    // Set up close event handler - hide window instead of destroying it
    setup_dashboard_close_handler(&window);

    Ok(window)
}

/// Opens Windows 11's Snap Layouts flyout for the focused window with Win+Z.
/// The page's own maximise button calls this on hover, since a button drawn in
/// HTML doesn't get the flyout that the native one does.
#[tauri::command]
pub async fn show_snap_layouts() {
    #[cfg(target_os = "windows")]
    {
        send_keys(&[VK_LWIN, VK_Z]);
        // Opened from the keyboard, the flyout numbers its layouts; once it's
        // up, Alt hides the numbers so it looks as it does on hover.
        tokio::time::sleep(std::time::Duration::from_millis(250)).await;
        send_keys(&[VK_MENU]);
    }
}

/// Closes the flyout, as moving off the native button would. The page calls
/// this only while the flyout has keyboard focus, so Escape goes to it.
#[tauri::command]
pub fn hide_snap_layouts() {
    #[cfg(target_os = "windows")]
    send_keys(&[VK_ESCAPE]);
}

/// Presses the keys in order, then releases them in reverse.
#[cfg(target_os = "windows")]
fn send_keys(keys: &[VIRTUAL_KEY]) {
    use windows::Win32::UI::Input::KeyboardAndMouse::{
        SendInput, INPUT, INPUT_0, INPUT_KEYBOARD, KEYBDINPUT, KEYBD_EVENT_FLAGS, KEYEVENTF_KEYUP,
    };

    let key = |vk: VIRTUAL_KEY, up: bool| INPUT {
        r#type: INPUT_KEYBOARD,
        Anonymous: INPUT_0 {
            ki: KEYBDINPUT {
                wVk: vk,
                dwFlags: if up { KEYEVENTF_KEYUP } else { KEYBD_EVENT_FLAGS(0) },
                ..Default::default()
            },
        },
    };
    let inputs: Vec<INPUT> = keys
        .iter()
        .map(|&vk| key(vk, false))
        .chain(keys.iter().rev().map(|&vk| key(vk, true)))
        .collect();
    unsafe { SendInput(&inputs, std::mem::size_of::<INPUT>() as i32) };
}

/// Sets up the close event handler for the dashboard window
fn setup_dashboard_close_handler<R: Runtime>(window: &WebviewWindow<R>) {
    let window_clone = window.clone();
    window.on_window_event(move |event| {
        if let tauri::WindowEvent::CloseRequested { api, .. } = event {
            // Prevent the window from being destroyed
            api.prevent_close();
            // Hide the window instead
            if let Err(e) = window_clone.hide() {
                eprintln!("Failed to hide dashboard window on close: {}", e);
            }
        }
    });
}

/// Shows the dashboard window and brings it to focus
pub fn show_dashboard_window<R: Runtime>(app: &AppHandle<R>) -> Result<(), String> {
    if let Some(dashboard_window) = app.get_webview_window("dashboard") {
        // Window exists, show and focus it, bringing it back if minimised
        dashboard_window
            .show()
            .map_err(|e| format!("Failed to show dashboard window: {}", e))?;
        dashboard_window
            .unminimize()
            .map_err(|e| format!("Failed to restore dashboard window: {}", e))?;
        dashboard_window
            .set_focus()
            .map_err(|e| format!("Failed to focus dashboard window: {}", e))?;
    } else {
        // Window doesn't exist, create it and then show it
        let Some(window) = create_dashboard_window(app)
            .map_err(|e| format!("Failed to create dashboard window: {}", e))?
        else {
            // Already being created, by setup or another open that will show it.
            return Ok(());
        };
        window
            .show()
            .map_err(|e| format!("Failed to show new dashboard window: {}", e))?;
        window
            .set_focus()
            .map_err(|e| format!("Failed to focus new dashboard window: {}", e))?;
    }
    Ok(())
}
