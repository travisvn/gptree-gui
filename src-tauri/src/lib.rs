// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/

// Modules
mod models;
mod fs;
mod config;
mod processor;

use std::path::{Path, PathBuf};
use models::{AppError, Config, DirectoryItem, OutputContent};
use serde::{Serialize, Deserialize};
use tauri::State;

// Store the app state
struct AppState {
    current_config: std::sync::Mutex<Config>,
    current_dir: std::sync::Mutex<PathBuf>,
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

// Command to select a directory
#[tauri::command]
async fn select_directory() -> CommandResult<String> {
    let dialog = tauri_plugin_dialog::DialogBuilder::new();
    match dialog.pick_folder() {
        Some(path) => CommandResult::success(path.to_string_lossy().to_string()),
        None => CommandResult::error("No directory selected".to_string()),
    }
}

// Command to load a directory and its structure
#[tauri::command]
async fn load_directory(path: String, state: tauri::State<'_, AppState>) -> CommandResult<DirectoryItem> {
    let path = Path::new(&path);
    
    // Update the current directory
    *state.current_dir.lock().unwrap() = path.to_path_buf();
    
    // Try to load project config
    match config::load_or_create_project_config(path) {
        Ok(project_config) => {
            // Merge with global config
            let mut config = match config::load_or_create_global_config() {
                Ok(global_config) => global_config,
                Err(_) => Config::default(),
            };
            
            // Project config takes precedence for most settings
            config.use_git_ignore = project_config.use_git_ignore;
            config.include_file_types = project_config.include_file_types;
            config.exclude_file_types = project_config.exclude_file_types;
            config.output_file = project_config.output_file;
            config.output_file_locally = project_config.output_file_locally;
            config.safe_mode = project_config.safe_mode;
            config.store_files_chosen = project_config.store_files_chosen;
            config.line_numbers = project_config.line_numbers;
            config.show_ignored_in_tree = project_config.show_ignored_in_tree;
            config.show_default_ignored_in_tree = project_config.show_default_ignored_in_tree;
            config.previous_files = project_config.previous_files;
            
            // Update the state
            *state.current_config.lock().unwrap() = config.clone();
            
            // Load directory tree
            match fs::get_directory_tree(
                path,
                config.use_git_ignore,
                config.show_ignored_in_tree,
                config.show_default_ignored_in_tree,
            ) {
                Ok(tree) => CommandResult::success(tree),
                Err(e) => CommandResult::error(format!("Failed to get directory tree: {}", e)),
            }
        },
        Err(e) => CommandResult::error(format!("Failed to load config: {}", e)),
    }
}

// Command to get the current configuration
#[tauri::command]
async fn get_config(state: tauri::State<'_, AppState>) -> CommandResult<Config> {
    CommandResult::success(state.current_config.lock().unwrap().clone())
}

// Command to update the configuration
#[tauri::command]
async fn update_config(config: Config, state: tauri::State<'_, AppState>) -> CommandResult<bool> {
    let mut current_config = state.current_config.lock().unwrap();
    *current_config = config.clone();
    
    // Save to project config
    let current_dir = state.current_dir.lock().unwrap().clone();
    let config_path = current_dir.join(".gptree_config");
    
    match config::save_config(&config_path, &config, false) {
        Ok(_) => CommandResult::success(true),
        Err(e) => CommandResult::error(format!("Failed to save config: {}", e)),
    }
}

// Command to generate output based on selected files
#[tauri::command]
async fn generate_output(
    selected_files: Vec<String>,
    state: tauri::State<'_, AppState>,
) -> CommandResult<OutputContent> {
    let config = state.current_config.lock().unwrap().clone();
    let current_dir = state.current_dir.lock().unwrap().clone();
    
    // Process the files
    match processor::combine_files_with_structure(&current_dir, &config, &selected_files) {
        Ok(output) => {
            // Save the list of selected files if configured
            if config.store_files_chosen {
                let config_path = current_dir.join(".gptree_config");
                let _ = config::update_previous_files(&config_path, &selected_files, &current_dir);
            }
            
            // Process the output (save to file)
            match processor::process_output(&output, &config, &current_dir) {
                Ok(_) => {},
                Err(e) => eprintln!("Warning: Failed to save output: {}", e),
            }
            
            CommandResult::success(output)
        },
        Err(e) => CommandResult::error(format!("Failed to generate output: {}", e)),
    }
}

// Command to copy content to clipboard
#[tauri::command]
async fn copy_to_clipboard(content: String) -> CommandResult<bool> {
    use tauri_plugin_clipboard::ClipboardExt;
    
    tauri::Builder::default().any_context().clipboard().write_text(content);
    CommandResult::success(true)
}

// Command to open the output file
#[tauri::command]
async fn open_output_file(path: String) -> CommandResult<bool> {
    use tauri_plugin_opener::OpenerExt;
    
    match tauri::Builder::default().any_context().opener().open_path(path) {
        Ok(_) => CommandResult::success(true),
        Err(e) => CommandResult::error(format!("Failed to open file: {}", e)),
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let app_state = AppState {
        current_config: std::sync::Mutex::new(Config::default()),
        current_dir: std::sync::Mutex::new(PathBuf::from(".")),
    };
    
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_clipboard::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .manage(app_state)
        .invoke_handler(tauri::generate_handler![
            select_directory,
            load_directory,
            get_config,
            update_config,
            generate_output,
            copy_to_clipboard,
            open_output_file,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
