import { fileIcons } from './icons/fileIcons';
import { folderIcons } from './icons/folderIcons';

// Helper to get file extension(s)
// Handles cases like .eslintrc.js, file.test.ts, file.d.ts
const getFileExtensions = (filename: string): string[] => {
  const parts = filename.toLowerCase().split('.');
  if (parts.length <= 1) return []; // No extension or just a filename like 'Makefile'
  // Return all possible extension combinations, e.g., 'd.ts', 'ts'
  const extensions = [];
  for (let i = 1; i < parts.length; i++) {
    extensions.push(parts.slice(i).join('.'));
  }
  return extensions;
};

// Assuming we use the 'specific' theme as the primary one for folders
// You might want to make the theme configurable later
const specificFolderTheme = folderIcons.find(theme => theme.name === 'specific');

export const getMaterialIconName = (itemName: string, isDir: boolean): string => {
  if (!specificFolderTheme) {
    // Fallback if the theme wasn't found
    console.warn("Material icon theme 'specific' not found. Falling back to defaults.");
    return isDir ? 'folder' : 'file';
  }

  const lowerItemName = itemName.toLowerCase();

  if (isDir) {
    // Check specific folder names (case-insensitive)
    // Find the FIRST matching icon in the theme's icons array
    const specificFolder = specificFolderTheme.icons?.find(icon =>
      icon.folderNames?.some(name => lowerItemName === name) // Exact match first
    );
    if (specificFolder) return specificFolder.name;

    // TODO: Handle nested names like 'github/workflows' if needed - current logic assumes direct match
    // TODO: Add logic for root folder detection if needed

    // Return default folder icon for the theme
    return specificFolderTheme.defaultIcon.name; // e.g., 'folder'

  } else {
    // --- File Logic ---

    // 1. Check specific filenames (exact match, case-sensitive first, then insensitive)
    let fileByName = fileIcons.icons.find(icon => icon.fileNames?.includes(itemName));
    if (fileByName) return fileByName.name;

    fileByName = fileIcons.icons.find(icon => icon.fileNames?.includes(lowerItemName));
    if (fileByName) return fileByName.name;

    // 2. Check file extensions (case-insensitive)
    // Iterate through extensions from longest (e.g., d.ts) to shortest (e.g., ts)
    const extensions = getFileExtensions(itemName);
    for (const ext of extensions) {
      const fileByExt = fileIcons.icons.find(icon => icon.fileExtensions?.includes(ext));
      if (fileByExt) return fileByExt.name;
    }

    // 3. Handle filenames without extension (e.g., 'Makefile', '.gitignore')
    // Check if the lowerItemName itself matches any fileExtension entry (for files like 'Makefile')
    // Or check if the lowerItemName matches any fileName entry again (covers dotfiles like '.gitignore' missed by exact match)
    const fileByExtMatch = fileIcons.icons.find(icon => icon.fileExtensions?.includes(lowerItemName));
    if (fileByExtMatch) return fileByExtMatch.name;

    // If no match found, return the default file icon name
    return fileIcons.defaultIcon.name; // e.g., 'file'
  }
};

// Function to get the full public path for the icon SVG
export const getMaterialIconPath = (itemName: string, isDir: boolean, isExpanded?: boolean): string => {
  let iconName = getMaterialIconName(itemName, isDir);
  // Append '-open' if it's an expanded directory
  if (isDir && isExpanded) {
    iconName += "-open";
  }
  // Construct the path relative to the public directory
  return `/icons/${iconName}.svg`;
}; 