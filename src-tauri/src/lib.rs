// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/

// Modules
mod config;
mod fs;
mod models;
mod processor;

use models::{AppError, Config, DirectoryItem, OutputContent};
use serde::{Deserialize, Serialize};
use std::fs as StdFs;
use std::path::{Path, PathBuf};
use tauri::Manager;
use tauri_plugin_clipboard_manager::ClipboardExt;
use tauri_plugin_opener::OpenerExt;

// Add ConfigMode enum
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
enum ConfigMode {
    Global,
    LocalOverride,
}

// Define the separate session state struct
#[derive(Debug, Default, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
struct SessionState {
    last_directory: Option<String>,
    last_config_mode: Option<String>,
}

// Store the app state
struct AppState {
    current_dir: std::sync::Mutex<PathBuf>,
    config_mode: std::sync::Mutex<ConfigMode>,
}

// Command return types
#[derive(Debug, Serialize, Deserialize)]
struct CommandResult<T> {
    success: bool,
    data: Option<T>,
    error: Option<String>,
}

impl<T> CommandResult<T> {
    fn success(data: T) -> Self {
        Self {
            success: true,
            data: Some(data),
            error: None,
        }
    }

    fn error(error: String) -> Self {
        Self {
            success: false,
            data: None,
            error: Some(error),
        }
    }
}

// App Settings Struct
#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")] // Use camelCase for JSON compatibility
struct AppSettings {
    default_to_local_config: bool,
    prompt_for_directory_on_startup: bool,
}

// Default implementation for AppSettings
impl Default for AppSettings {
    fn default() -> Self {
        Self {
            default_to_local_config: false,        // Default: prefer global config
            prompt_for_directory_on_startup: true, // Default: prompt user if no last dir
        }
    }
}

// Helper function to get the settings file path
fn get_settings_path(app_handle: &tauri::AppHandle) -> Result<PathBuf, AppError> {
    let config_dir = app_handle.path().app_config_dir().map_err(|e| {
        AppError::Config(format!("Could not determine app config directory: {}", e))
    })?;
    // Ensure the directory exists
    StdFs::create_dir_all(&config_dir)
        .map_err(|e| AppError::Config(format!("Could not create config directory: {}", e)))?;
    Ok(config_dir.join("settings.json"))
}

// Command to select a directory
#[tauri::command]
async fn select_directory(app_handle: tauri::AppHandle) -> Result<CommandResult<String>, String> {
    use tauri_plugin_dialog::DialogExt;

    let file_path = app_handle.dialog().file().blocking_pick_folder();
    match file_path {
        Some(path) => {
            let path_str = path.to_string();
            // Save the selected directory to session state
            match config::load_session_state(&app_handle) {
                Ok(mut state) => {
                    state.last_directory = Some(path_str.clone());
                    if let Err(e) = config::save_session_state(&app_handle, &state) {
                        eprintln!("[GPTree] Warning: Failed to save session state: {}", e);
                    }
                }
                Err(e) => {
                    eprintln!(
                        "[GPTree] Warning: Failed to load session state to save directory: {}",
                        e
                    );
                }
            }
            Ok(CommandResult::success(path_str))
        }
        None => Ok(CommandResult::error("No directory selected".to_string())),
    }
}

// Command to load a directory and its structure
#[tauri::command]
async fn load_directory(
    path: String,
    state: tauri::State<'_, AppState>,
) -> Result<CommandResult<DirectoryItem>, String> {
    let path = Path::new(&path);

    // Update the current directory
    *state.current_dir.lock().unwrap() = path.to_path_buf();

    // Get the active config mode
    let config_mode = *state.config_mode.lock().unwrap();

    // Load config based on active mode instead of always trying local first
    let display_config = match config_mode {
        ConfigMode::LocalOverride => {
            // Try local first, fall back to global
            config::load_or_create_project_config(path)
                .or_else(|_| config::load_or_create_global_config())
                .unwrap_or_default()
        }
        ConfigMode::Global => {
            // Only use global config
            config::load_or_create_global_config().unwrap_or_default()
        }
    };

    // Load directory tree based on display settings
    match fs::get_directory_tree(
        path,
        display_config.use_git_ignore,
        display_config.show_ignored_in_tree,
        display_config.show_default_ignored_in_tree,
        &display_config.include_file_types,
        &display_config.exclude_file_types,
    ) {
        Ok(tree) => Ok(CommandResult::success(tree)),
        Err(e) => Ok(CommandResult::error(format!(
            "Failed to get directory tree: {}",
            e
        ))),
    }
}

// Command to get the current configuration
#[tauri::command]
async fn get_config(state: tauri::State<'_, AppState>) -> Result<CommandResult<Config>, String> {
    let config_mode = state.config_mode.lock().unwrap();
    let current_dir = state.current_dir.lock().unwrap().clone();
    let config = match *config_mode {
        ConfigMode::LocalOverride => {
            let local = config::load_or_create_project_config(&current_dir);
            local.unwrap_or_else(|_| config::load_or_create_global_config().unwrap_or_default())
        }
        ConfigMode::Global => config::load_or_create_global_config().unwrap_or_default(),
    };
    Ok(CommandResult::success(config))
}

// Command to update the configuration
#[tauri::command]
async fn update_config(
    config: Config,
    state: tauri::State<'_, AppState>,
) -> Result<CommandResult<bool>, AppError> {
    let config_mode = *state.config_mode.lock().unwrap();
    let current_dir = state.current_dir.lock().unwrap().clone();

    // Use the more reliable helper function
    let is_global = config_mode == ConfigMode::Global;
    let current_dir_ref = if is_global {
        None
    } else {
        Some(current_dir.as_path())
    };

    match config::ensure_config_saved(&config, is_global, current_dir_ref) {
        Ok(saved_path) => {
            eprintln!("[GPTree] Successfully saved config to {:?}", saved_path);
            Ok(CommandResult::success(true))
        }
        Err(e) => {
            eprintln!("[GPTree] Error saving config: {:?}", e);
            Err(e)
        }
    }
}

// Command to generate output based on selected files
#[tauri::command]
async fn generate_output(
    selected_files: Vec<String>,
    state: tauri::State<'_, AppState>,
) -> Result<CommandResult<OutputContent>, String> {
    let current_dir = state.current_dir.lock().unwrap().clone();
    let config_mode = *state.config_mode.lock().unwrap();

    // Load the active config based on the mode
    let config_result = match config_mode {
        ConfigMode::LocalOverride => config::load_or_create_project_config(&current_dir),
        ConfigMode::Global => config::load_or_create_global_config(),
    };

    let config = match config_result {
        Ok(cfg) => cfg,
        Err(e) => {
            return Ok(CommandResult::error(format!(
                "Failed to load active config: {}",
                e
            )))
        }
    };

    // Process the files
    match processor::combine_files_with_structure(&current_dir, &config, &selected_files) {
        Ok(mut output) => {
            // Save the list of selected files if configured
            if config.store_files_chosen {
                // Ensure config path exists for local saving
                if config::load_or_create_project_config(&current_dir).is_ok() {
                    let config_path = current_dir.join(".gptree_config");
                    if let Err(e) =
                        config::update_previous_files(&config_path, &selected_files, &current_dir)
                    {
                        eprintln!("Warning: Failed to update previous files in config: {}", e);
                    }
                } else {
                    eprintln!(
                        "Warning: Could not load or create project config to save previous files."
                    );
                }
            }

            // Process the output (save to file) and get the saved path
            match processor::process_output(&output, &config, &current_dir) {
                Ok(saved_path_option) => {
                    // Store the absolute path (or None) in the output object
                    output.saved_path = saved_path_option;
                }
                Err(e) => {
                    // Log the error but don't prevent returning the content
                    eprintln!("Warning: Failed to save output file: {}", e);
                    output.saved_path = None; // Indicate that saving failed
                }
            }

            Ok(CommandResult::success(output))
        }
        Err(e) => Ok(CommandResult::error(format!(
            "Failed to generate output: {}",
            e
        ))),
    }
}

// Command to copy content to clipboard
#[tauri::command]
async fn copy_to_clipboard(
    app: tauri::AppHandle,
    content: String,
) -> Result<CommandResult<bool>, String> {
    match app.clipboard().write_text(content) {
        Ok(_) => Ok(CommandResult::success(true)),
        Err(e) => Ok(CommandResult::error(format!(
            "Failed to copy to clipboard: {}",
            e
        ))),
    }
}

// Command to open the output file
#[tauri::command]
async fn open_output_file(
    app: tauri::AppHandle,
    path: String,
) -> Result<CommandResult<bool>, String> {
    // Log the path we are trying to open
    println!("[GPTree] Attempting to open path: {}", path);

    match app.opener().open_path(&path, None::<&str>) {
        Ok(_) => Ok(CommandResult::success(true)),
        Err(e) => {
            // Log the error as well
            eprintln!("[GPTree] Failed to open path '{}': {}", path, e);
            Ok(CommandResult::error(format!("Failed to open file: {}", e)))
        }
    }
}

// Command to get session state
#[tauri::command]
async fn get_session_state(
    app_handle: tauri::AppHandle,
) -> Result<CommandResult<SessionState>, String> {
    match config::load_session_state(&app_handle) {
        Ok(state) => Ok(CommandResult::success(state)),
        Err(e) => Ok(CommandResult::error(format!(
            "Failed to load session state: {}",
            e
        ))),
    }
}

// New command: set_config_mode
#[tauri::command]
async fn set_config_mode(
    mode: String,
    state: tauri::State<'_, AppState>,
    app_handle: tauri::AppHandle,
) -> Result<CommandResult<bool>, String> {
    let current_dir = state.current_dir.lock().unwrap().clone();

    // Update config mode in state
    let mut config_mode = state.config_mode.lock().unwrap();
    *config_mode = match mode.as_str() {
        "local" => ConfigMode::LocalOverride,
        _ => ConfigMode::Global,
    };

    // Create config file if it doesn't exist
    match mode.as_str() {
        "local" => {
            if !current_dir.join(".gptree_config").exists() {
                match config::load_or_create_project_config(&current_dir) {
                    Ok(_) => {}
                    Err(e) => {
                        return Ok(CommandResult::error(format!(
                            "Failed to create local config: {}",
                            e
                        )))
                    }
                }
            }
        }
        _ => {
            // global
            match config::load_or_create_global_config() {
                Ok(_) => {}
                Err(e) => {
                    return Ok(CommandResult::error(format!(
                        "Failed to create global config: {}",
                        e
                    )))
                }
            }
        }
    }

    // Update session state
    match config::load_session_state(&app_handle) {
        Ok(mut state) => {
            state.last_config_mode = Some(mode.clone());
            if let Err(e) = config::save_session_state(&app_handle, &state) {
                eprintln!("[GPTree] Warning: Failed to save session state: {}", e);
            }
        }
        Err(e) => {
            eprintln!("[GPTree] Warning: Failed to load session state: {}", e);
        }
    }

    Ok(CommandResult::success(true))
}

// New command: get_configs
#[tauri::command]
async fn get_configs(path: Option<String>) -> Result<CommandResult<serde_json::Value>, String> {
    use serde_json::json;
    let global = config::load_or_create_global_config().ok();
    let local = if let Some(path) = path {
        let p = Path::new(&path);
        config::load_or_create_project_config(p).ok()
    } else {
        None
    };
    Ok(CommandResult::success(json!({
        "global": global,
        "local": local,
    })))
}

#[tauri::command]
async fn pick_save_path(
    app: tauri::AppHandle,
    content: String,
) -> Result<CommandResult<String>, String> {
    use std::fs;
    use std::path::PathBuf;
    use tauri_plugin_dialog::DialogExt;

    println!("Starting pick_save_path function");

    // Add a default text extension filter
    let file_path = app
        .dialog()
        .file()
        .add_filter("Text Files", &["txt"])
        .set_file_name("gptree-output.txt")
        .blocking_save_file();

    println!("File dialog returned: {:?}", file_path);

    match file_path {
        Some(path) => {
            let path_str = path.to_string();
            println!("Path to string: {}", path_str);

            // Try to convert the FilePath to a PathBuf
            let path_buf = PathBuf::from(path_str.clone());
            println!("Created PathBuf: {:?}", path_buf);

            // Write content to the selected file
            match fs::write(&path_buf, content) {
                Ok(_) => {
                    println!("File written successfully to {:?}", path_buf);
                    Ok(CommandResult::success(path_str))
                }
                Err(e) => {
                    println!("Error writing file: {}", e);
                    Ok(CommandResult::error(format!("Failed to write file: {}", e)))
                }
            }
        }
        None => {
            println!("File save operation was cancelled");
            Ok(CommandResult::error(
                "File save operation was cancelled".to_string(),
            ))
        }
    }
}

// Command to get application settings
#[tauri::command]
async fn get_app_settings(
    app_handle: tauri::AppHandle,
) -> Result<CommandResult<AppSettings>, String> {
    let settings_path = match get_settings_path(&app_handle) {
        Ok(path) => path,
        Err(e) => {
            return Ok(CommandResult::error(format!(
                "Error getting settings path: {}",
                e
            )))
        }
    };

    if !settings_path.exists() {
        println!(
            "[GPTree] Settings file not found at {:?}, returning defaults.",
            settings_path
        );
        return Ok(CommandResult::success(AppSettings::default()));
    }

    match StdFs::read_to_string(&settings_path) {
        Ok(content) => match serde_json::from_str(&content) {
            Ok(settings) => Ok(CommandResult::success(settings)),
            Err(e) => {
                eprintln!(
                    "[GPTree] Warning: Failed to parse settings file {:?}: {}. Returning defaults.",
                    settings_path, e
                );
                Ok(CommandResult::success(AppSettings::default())) // Return defaults on parse error
            }
        },
        Err(e) => Ok(CommandResult::error(format!(
            "Failed to read settings file {:?}: {}",
            settings_path, e
        ))),
    }
}

// Command to save application settings
#[tauri::command]
async fn save_app_settings(
    app_handle: tauri::AppHandle,
    settings: AppSettings,
) -> Result<CommandResult<bool>, String> {
    let settings_path = match get_settings_path(&app_handle) {
        Ok(path) => path,
        Err(e) => {
            return Ok(CommandResult::error(format!(
                "Error getting settings path: {}",
                e
            )))
        }
    };

    match serde_json::to_string_pretty(&settings) {
        Ok(content) => match StdFs::write(&settings_path, content) {
            Ok(_) => Ok(CommandResult::success(true)),
            Err(e) => Ok(CommandResult::error(format!(
                "Failed to write settings file {:?}: {}",
                settings_path, e
            ))),
        },
        Err(e) => Ok(CommandResult::error(format!(
            "Failed to serialize settings: {}",
            e
        ))),
    }
}

// Command to set the last used config mode preference
#[tauri::command]
async fn set_last_config_mode(
    app_handle: tauri::AppHandle,
    mode: String,
) -> Result<CommandResult<bool>, String> {
    // Validate mode
    if mode != "global" && mode != "local" {
        return Ok(CommandResult::error(format!(
            "Invalid config mode '{}' provided. Must be 'global' or 'local'.",
            mode
        )));
    }

    // Load current session state or defaults
    let mut current_state = match config::load_session_state(&app_handle) {
        Ok(state) => state,
        Err(e) => {
            eprintln!(
                "[GPTree] Warning: Failed to load session state to update mode: {}. Using default.",
                e
            );
            SessionState::default()
        }
    };

    // Update the mode
    current_state.last_config_mode = Some(mode);

    // Save the updated state
    match config::save_session_state(&app_handle, &current_state) {
        Ok(_) => Ok(CommandResult::success(true)),
        Err(e) => Ok(CommandResult::error(format!(
            "Error saving updated session state: {}",
            e
        ))),
    }
}

// New command: diagnose_config_file
#[tauri::command]
async fn diagnose_config_file(
    mode: String,
    state: tauri::State<'_, AppState>,
) -> Result<CommandResult<String>, String> {
    let current_dir = state.current_dir.lock().unwrap().clone();

    let config_path = if mode == "local" {
        current_dir.join(".gptree_config")
    } else {
        dirs::home_dir()
            .ok_or_else(|| "Could not find home directory".to_string())?
            .join(".gptreerc")
    };

    let diagnosis = config::diagnose_config_file_access(&config_path);
    Ok(CommandResult::success(diagnosis))
}

// Main run function
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let initial_state = AppState {
        current_dir: std::sync::Mutex::new(PathBuf::new()),
        config_mode: std::sync::Mutex::new(ConfigMode::Global), // Default to global
    };

    tauri::Builder::default()
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_opener::init())
        .manage(initial_state)
        .invoke_handler(tauri::generate_handler![
            select_directory,
            load_directory,
            get_config,
            update_config,
            generate_output,
            copy_to_clipboard,
            open_output_file,
            get_session_state,
            set_config_mode,
            get_configs,
            pick_save_path,
            get_app_settings,
            save_app_settings,
            set_last_config_mode,
            diagnose_config_file
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
