use serde::{Deserialize, Serialize};
use std::collections::HashSet;

/// Current version of the configuration file format
pub const CONFIG_VERSION: u32 = 2;

/// Default constants
pub const DEFAULT_IGNORES: [&str; 6] = [
    ".git",
    ".vscode",
    "__pycache__",
    ".DS_Store",
    ".idea",
    ".gitignore",
];

pub const SAFE_MODE_MAX_FILES: usize = 30;
pub const SAFE_MODE_MAX_LENGTH: usize = 100_000; // ~25K tokens

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct Config {
    pub version: u32,
    pub use_git_ignore: bool,
    pub include_file_types: String,
    pub exclude_file_types: String,
    pub output_file: String,
    pub save_output_file: bool,
    pub output_file_locally: bool,
    pub copy_to_clipboard: bool,
    pub safe_mode: bool,
    pub store_files_chosen: bool,
    pub line_numbers: bool,
    pub show_ignored_in_tree: bool,
    pub show_default_ignored_in_tree: bool,
    #[serde(skip_serializing_if = "Vec::is_empty", default)]
    pub previous_files: Vec<String>,
}

impl Default for Config {
    fn default() -> Self {
        Self {
            version: CONFIG_VERSION,
            use_git_ignore: true,
            include_file_types: "*".to_string(),
            exclude_file_types: String::new(),
            output_file: "gptree_output.txt".to_string(),
            save_output_file: true,
            output_file_locally: true,
            copy_to_clipboard: false,
            safe_mode: true,
            store_files_chosen: true,
            line_numbers: false,
            show_ignored_in_tree: false,
            show_default_ignored_in_tree: false,
            previous_files: Vec::new(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DirectoryItem {
    pub name: String,
    pub path: String,
    pub is_dir: bool,
    pub is_selected: bool,
    pub children: Vec<DirectoryItem>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct FileDetail {
    pub path: String,
    pub tokens: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TreeStructure {
    pub tree_text: String,
    pub file_list: Vec<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct OutputContent {
    pub tree_structure: String,
    pub combined_content: String,
    pub file_details: Vec<FileDetail>,
    pub token_estimate: usize,
    pub saved_path: Option<String>,
}

#[derive(Debug, thiserror::Error)]
pub enum AppError {
    #[error("IO error: {0}")]
    Io(#[from] std::io::Error),

    #[error("Safe mode error: {0}")]
    SafeMode(String),

    #[error("Config error: {0}")]
    Config(String),

    #[error("Path not found: {0}")]
    PathNotFound(String),

    #[error("JSON error: {0}")]
    Json(String),
}

impl Serialize for AppError {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        serializer.serialize_str(&self.to_string())
    }
}
