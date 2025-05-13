use crate::fs::{
    add_line_numbers, estimate_tokens, generate_tree_structure, read_file_content, save_to_file,
};
use crate::models::{
    AppError, Config, FileDetail, OutputContent, SAFE_MODE_MAX_FILES, SAFE_MODE_MAX_LENGTH,
};
use std::collections::HashSet;
use std::path::{Path, PathBuf};

/// Combine the file contents with the directory structure
pub fn combine_files_with_structure(
    root_dir: &Path,
    config: &Config,
    selected_files: &[String],
    current_excluded_dirs: &[String],
) -> Result<OutputContent, AppError> {
    let mut combined_content = Vec::new();
    let mut file_details = Vec::new();

    // Convert current_excluded_dirs to HashSet for efficient lookup
    let excluded_dirs_set: HashSet<String> = current_excluded_dirs.iter().cloned().collect();

    // Generate tree structure
    let tree_structure = generate_tree_structure(
        root_dir,
        config.use_git_ignore,
        config.show_ignored_in_tree,
        config.show_default_ignored_in_tree,
        &config.include_file_types,
        &config.exclude_file_types,
        &excluded_dirs_set,
    )?;

    combined_content.push("# Project Directory Structure:".to_string());
    combined_content.push(tree_structure.tree_text.clone());
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
    let mut total_tokens = 0;
    for file_path in selected_files {
        let path = PathBuf::from(file_path);

        // Skip if path doesn't exist or is not a file
        if !path.exists() || !path.is_file() {
            eprintln!(
                "Warning: Skipping non-existent or non-file path: {}",
                file_path
            );
            continue;
        }

        match read_file_content(&path) {
            Ok(mut content) => {
                // Add line numbers if requested
                if config.line_numbers {
                    content = add_line_numbers(&content);
                }

                // Estimate tokens for this file
                let file_tokens = estimate_tokens(&content);
                total_tokens += file_tokens;

                // Convert absolute path to relative path for display
                let rel_path = match path.strip_prefix(root_dir) {
                    Ok(rel) => rel.to_string_lossy().to_string(),
                    Err(_) => path.to_string_lossy().to_string(), // Fallback if stripping fails
                };

                file_details.push(FileDetail {
                    path: rel_path.clone(),
                    tokens: file_tokens,
                });

                combined_content.push(format!("\n# File: {}\n", rel_path));
                combined_content.push(content);
                // combined_content.push("\n# END FILE CONTENTS\n".to_string()); // Removed redundant end marker
            }
            Err(e) => {
                eprintln!("Warning: Could not read file {}: {}", file_path, e);
                // Optionally add an error detail to file_details?
                continue;
            }
        }
    }

    let combined_content_str = combined_content.join("\n");
    // Use the sum of file tokens as the estimate
    let estimated_tokens = total_tokens;

    Ok(OutputContent {
        tree_structure: tree_structure.tree_text,
        combined_content: combined_content_str,
        file_details,
        token_estimate: estimated_tokens,
        saved_path: None, // Will be filled after saving
    })
}

/// Save the output and copy to clipboard if requested
/// Returns the absolute path where the file was saved, or None if saving was disabled.
pub fn process_output(
    output_content: &OutputContent,
    config: &Config,
    root_dir: &Path, // Ensure this is the absolute path to the project
) -> Result<Option<String>, AppError> {
    // Check if saving is disabled
    if !config.save_output_file {
        return Ok(None); // Return None if saving is disabled
    }

    // Determine absolute output file path
    let output_file_path = if config.output_file_locally {
        // Save relative to the project directory
        root_dir.join(&config.output_file)
    } else {
        // Save to user's Documents directory
        if let Some(docs_dir) = dirs::document_dir() {
            docs_dir.join(&config.output_file)
        } else {
            // Fallback: Save relative to the project dir if Documents isn't available
            eprintln!(
                "Warning: Could not find Documents directory. Saving to project directory instead."
            );
            root_dir.join(&config.output_file)
        }
    };

    // Ensure parent directory exists
    if let Some(parent) = output_file_path.parent() {
        if !parent.exists() {
            std::fs::create_dir_all(parent)?;
        }
    }

    // Log the path we are saving to
    println!("[GPTree] Saving output to: {:?}", output_file_path);

    // Save to file
    save_to_file(&output_file_path, &output_content.combined_content)?;

    // Return the absolute path as a string wrapped in Some
    Ok(Some(output_file_path.to_string_lossy().to_string())) // Wrap in Some()
}
