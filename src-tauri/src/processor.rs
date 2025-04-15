use crate::fs::{
    add_line_numbers, estimate_tokens, generate_tree_structure, read_file_content, save_to_file,
};
use crate::models::{AppError, Config, OutputContent, SAFE_MODE_MAX_FILES, SAFE_MODE_MAX_LENGTH};
use std::path::{Path, PathBuf};

/// Combine the file contents with the directory structure
pub fn combine_files_with_structure(
    root_dir: &Path,
    config: &Config,
    selected_files: &[String],
) -> Result<OutputContent, AppError> {
    let mut combined_content = Vec::new();

    // Generate tree structure
    let tree_structure = generate_tree_structure(
        root_dir,
        config.use_git_ignore,
        config.show_ignored_in_tree,
        config.show_default_ignored_in_tree,
    )?;

    combined_content.push("# Project Directory Structure:".to_string());
    combined_content.push(tree_structure.tree_text);
    combined_content.push("\n# BEGIN FILE CONTENTS".to_string());

    // Safe mode checks
    if config.safe_mode {
        if selected_files.len() > SAFE_MODE_MAX_FILES {
            return Err(AppError::SafeMode(format!(
                "Safe mode: Too many files selected ({} > {})",
                selected_files.len(),
                SAFE_MODE_MAX_FILES
            )));
        }

        let mut total_size = 0;
        for file_path in selected_files {
            let path = PathBuf::from(file_path);
            if let Ok(metadata) = std::fs::metadata(&path) {
                total_size += metadata.len() as usize;
                if total_size > SAFE_MODE_MAX_LENGTH {
                    return Err(AppError::SafeMode(format!(
                        "Safe mode: Combined file size too large (> {} bytes)",
                        SAFE_MODE_MAX_LENGTH
                    )));
                }
            }
        }
    }

    // Combine contents of selected files
    for file_path in selected_files {
        let path = PathBuf::from(file_path);

        // Skip if path doesn't exist
        if !path.exists() || !path.is_file() {
            continue;
        }

        match read_file_content(&path) {
            Ok(mut content) => {
                // Add line numbers if requested
                if config.line_numbers {
                    content = add_line_numbers(&content);
                }

                // Convert absolute path to relative path for display
                let rel_path = match path.strip_prefix(root_dir) {
                    Ok(rel) => rel.to_string_lossy().to_string(),
                    Err(_) => path.to_string_lossy().to_string(),
                };

                combined_content.push(format!("\n# File: {}\n", rel_path));
                combined_content.push(content);
                combined_content.push("\n# END FILE CONTENTS\n".to_string());
            }
            Err(e) => {
                eprintln!("Warning: Could not read file {}: {}", file_path, e);
                continue;
            }
        }
    }

    let combined_content_str = combined_content.join("\n");
    let estimated_tokens = estimate_tokens(&combined_content_str);

    Ok(OutputContent {
        combined_content: combined_content_str,
        selected_files: selected_files.to_vec(),
        estimated_tokens,
    })
}

/// Save the output and copy to clipboard if requested
pub fn process_output(
    output_content: &OutputContent,
    config: &Config,
    root_dir: &Path,
) -> Result<PathBuf, AppError> {
    // Determine output file path
    let output_file_path = if config.output_file_locally {
        PathBuf::from(&config.output_file)
    } else {
        root_dir.join(&config.output_file)
    };

    // Save to file
    save_to_file(&output_file_path, &output_content.combined_content)?;

    Ok(output_file_path)
}
