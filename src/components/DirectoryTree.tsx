import { CheckSquare, Square, MinusSquare } from '@phosphor-icons/react';
import React, { useState, useEffect } from 'react';
import clsx from 'clsx'; // Helper for conditional classes
import { getMaterialIconPath } from '../icon-helpers/getMaterialIconName'; // Import the new helper
import { ChevronsUpDown, ChevronsDownUp } from 'lucide-react';
// import { Config } from '../lib/types';


// Export if needed by getMaterialIconName.ts (not strictly required by current implementation)
export interface DirectoryItem {
  name: string;
  path: string;
  is_dir: boolean;
  is_selected: boolean;
  children: DirectoryItem[];
}

interface DirectoryTreeProps {
  tree: DirectoryItem;
  onFileSelection: (selectedFiles: string[]) => void;
  selectedFiles: string[];
  enableFolderCheckboxes: boolean;
  // config?: Config; // Add config to props
  // onRefresh?: () => void; // Add refresh callback
}

const DirectoryTree: React.FC<DirectoryTreeProps> = ({
  tree,
  onFileSelection,
  selectedFiles,
  enableFolderCheckboxes,
  // config,
  // onRefresh
}) => {
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(() => {
    const initial = new Set<string>();
    if (tree && tree.is_dir) {
      initial.add(tree.path);
    }
    return initial;
  });
  const [localSelectedFiles, setLocalSelectedFiles] = useState<Set<string>>(new Set(selectedFiles));

  // Helper to get all descendant file paths (visible in the current tree structure)
  const getDescendantFiles = (item: DirectoryItem): string[] => {
    let paths: string[] = [];
    if (!item.is_dir) {
      paths.push(item.path);
    } else if (item.children) { // Check if children exist
      item.children.forEach(child => {
        paths = paths.concat(getDescendantFiles(child));
      });
    }
    return paths;
  };

  const allFilePathsInTree = React.useMemo(() => getDescendantFiles(tree), [tree]); // Use renamed helper
  const selectAllChecked = React.useMemo(() => {
    if (allFilePathsInTree.length === 0) return false;
    return allFilePathsInTree.every(path => localSelectedFiles.has(path));
  }, [localSelectedFiles, allFilePathsInTree]);

  useEffect(() => {
    setLocalSelectedFiles(new Set(selectedFiles));
  }, [selectedFiles]);

  // Reset expanded state when the tree prop changes
  useEffect(() => {
    if (tree && tree.is_dir) {
      setExpandedFolders(new Set([tree.path]));
    } else {
      setExpandedFolders(new Set()); // Clear if tree is null or not a directory
    }
    // Also reset local file selection when tree changes
    setLocalSelectedFiles(new Set());
    // Note: We don't call onFileSelection here because the parent (`App.tsx`)
    // already manages clearing/setting selections when the directory changes.
  }, [tree]); // Re-run when the tree prop changes

  // Determine the selection state of a folder based on its descendants
  const getFolderSelectionState = (folder: DirectoryItem, currentSelectedFiles: Set<string>): 'checked' | 'unchecked' | 'indeterminate' => {
    const descendantFiles = getDescendantFiles(folder);
    if (descendantFiles.length === 0) {
      return 'unchecked'; // No selectable files within
    }
    const selectedCount = descendantFiles.filter(path => currentSelectedFiles.has(path)).length;

    if (selectedCount === 0) {
      return 'unchecked';
    } else if (selectedCount === descendantFiles.length) {
      return 'checked';
    } else {
      return 'indeterminate';
    }
  };

  // Handle clicking a folder\'s checkbox
  const toggleFolderSelection = (folder: DirectoryItem) => {
    const descendantFiles = getDescendantFiles(folder);
    if (descendantFiles.length === 0) return; // No files to select/deselect

    const currentState = getFolderSelectionState(folder, localSelectedFiles);

    setLocalSelectedFiles(prev => {
      const next = new Set(prev);
      if (currentState === 'checked') { // If fully checked, uncheck all
        descendantFiles.forEach(path => next.delete(path));
      } else { // If unchecked or indeterminate, check all
        descendantFiles.forEach(path => next.add(path));
      }
      onFileSelection(Array.from(next)); // Notify parent
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectAllChecked) {
      setLocalSelectedFiles(new Set());
      onFileSelection([]);
    } else {
      const allFiles = getDescendantFiles(tree); // Use renamed helper
      setLocalSelectedFiles(new Set(allFiles));
      onFileSelection(allFiles);
    }
  };

  const expandAll = () => {
    const allFolders: string[] = [];
    function collectFolders(item: DirectoryItem) {
      if (item.is_dir) {
        allFolders.push(item.path);
        item.children.forEach(collectFolders);
      }
    }
    collectFolders(tree);
    setExpandedFolders(new Set(allFolders));
  };

  const collapseAll = () => {
    setExpandedFolders(new Set());
  };

  const toggleFolder = (path: string) => {
    setExpandedFolders(prev => {
      const next = new Set(prev);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return next;
    });
  };

  // Handle clicking a file's checkbox/row
  const toggleFileSelection = (path: string) => {
    setLocalSelectedFiles(prev => {
      const next = new Set(prev);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      onFileSelection(Array.from(next)); // Notify parent
      return next;
    });
  };

  // Recursive rendering of tree items
  const renderTreeItem = (item: DirectoryItem, level: number = 0) => {
    const isExpanded = expandedFolders.has(item.path);
    const isSelected = localSelectedFiles.has(item.path);
    const isFolder = item.is_dir;
    // const isFileSelected = !isFolder && isSelected;
    // Calculate folder checkbox state (only if it's a folder)
    const folderSelectionState = isFolder ? getFolderSelectionState(item, localSelectedFiles) : null;
    const iconPath = getMaterialIconPath(item.name, isFolder, isExpanded);

    return (
      <div key={item.path} className="flex flex-col pr-1">
        {/* Item Row */}
        <div
          className={clsx(
            'group flex items-center p-1 rounded', // Base styles
            'hover:bg-secondary dark:hover:text-white', // Hover styles
            {
              // 'bg-border dark:text-white': isFileSelected, // Selected file style
              'cursor-pointer': !isFolder, // Cursor for files
            }
          )}
          style={{ paddingLeft: `${level * 0.3 + 0.25}rem` }} // Reduced indentation multiplier
          onClick={() => {
            if (!isFolder) toggleFileSelection(item.path); // Toggle file selection on row click for files
          }}
        >
          {/* Folder Row: Checkbox + Icon + Expand Toggle */}
          {isFolder && (
            <div className="flex items-center gap-1 mr-1.5"> {/* Group checkbox, icon, expander */}
              {/* Folder Checkbox (Conditional) */}
              {enableFolderCheckboxes && (
                <span
                  onClick={e => { e.stopPropagation(); toggleFolderSelection(item); }} // Select/deselect on checkbox click
                  className="cursor-pointer flex-shrink-0"
                  title={`Select/deselect all files in ${item.name}`}
                >
                  {folderSelectionState === 'checked' && <CheckSquare size={20} weight="fill" className="text-primary opacity-70 dark:opacity-90 dark:group-hover:text-white dark:group-hover:opacity-60" />} {/* Slightly smaller */}
                  {folderSelectionState === 'unchecked' && <Square size={20} weight="thin" className="opacity-30 group-hover:opacity-40" />}
                  {folderSelectionState === 'indeterminate' && <MinusSquare size={20} weight="fill" className="text-primary opacity-70 dark:opacity-90 dark:group-hover:text-white dark:group-hover:opacity-60" />}
                </span>
              )}

              {/* Material Folder Icon & Expansion Toggle */}
              <span
                className="cursor-pointer flex items-center flex-shrink-0" // Click area for toggling expansion
                onClick={e => { e.stopPropagation(); toggleFolder(item.path); }} // Expand/collapse on icon click
              >
                <img src={iconPath} alt="" className="w-5 h-5 flex-shrink-0" />
                {/* Expansion state is now visually indicated by the folder icon itself */}
              </span>
            </div>
          )}

          {/* File Row: Icon + Checkbox */}
          {!isFolder && (
            <span className={clsx(
              "mr-1.5 text-text", // Spacing
              'flex items-center gap-1', // Container for file icon and checkbox
            )}>
              {/* File Type Icon */}
              <span className="inline-block w-5 h-5 flex-shrink-0"> {/* No click here */}
                <img src={iconPath} alt="" className="w-full h-full" />
              </span>
              {/* Selection Checkbox (Clickable handled by row) */}
              <span className="cursor-pointer"> {/* Add cursor pointer hint */}
                {isSelected ? (
                  <CheckSquare size={20} weight="fill" className="opacity-60 group-hover:opacity-80" />
                ) : (
                  <Square size={20} weight="thin" className="opacity-60 group-hover:opacity-80" />
                )}
              </span>
            </span>
          )}

          {/* File/Folder Name */}
          <span
            id={`file-label-${item.path}`}
            className={clsx(
              'item-name flex-1 truncate select-none text-sm', // Base styles
              {
                'font-medium': isFolder,
                'cursor-pointer': isFolder, // Add pointer cursor back for folders
              }
            )}
            onClick={e => { if (isFolder) { e.stopPropagation(); toggleFolder(item.path); } }} // Expand/collapse on name click
          >
            {item.name}
          </span>
        </div>

        {/* Children */}
        {isFolder && isExpanded && (
          <div
            className='pl-1 border-l border-border'
            style={{
              marginLeft: `0.75rem`,
            }}
          >
            {item.children.map(child => renderTreeItem(child, level + 1))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="directory-tree flex flex-col h-full overflow-hidden">
      {/* Controls */}
      <div className="flex justify-between items-center p-2 border-b border-border flex-shrink-0">
        <div className="flex items-center">
          <input
            type="checkbox"
            checked={selectAllChecked}
            onChange={toggleSelectAll}
            id="select-all"
            className="cursor-pointer"
            disabled={allFilePathsInTree.length === 0}
          />
          <label htmlFor="select-all" className="cursor-pointer text-sm select-none">
            Select All
          </label>
        </div>
        <div className="flex gap-2">
          {/* {onRefresh && (
            <button
              onClick={onRefresh}
              className="button text-xs px-2 py-1 flex items-center gap-1"
              title="Refresh directory tree"
            >
              <ArrowClockwise size={14} />
              Refresh
            </button>
          )} */}
          <button
            onClick={expandAll}
            className="button text-xs px-2 py-1 flex items-center gap-1"

          >
            <ChevronsUpDown size={14} />
            Expand
          </button>
          <button
            onClick={collapseAll}
            className="button text-xs px-2 py-1 flex items-center gap-1"
          >

            <ChevronsDownUp size={14} />
            Collapse
          </button>
        </div>
      </div>

      {/* Scrollable tree container */}
      <div className="flex-grow overflow-y-auto pt-1">
        {renderTreeItem(tree)} {/* Start rendering at level 0 */}
      </div>
    </div>
  );
};

export default DirectoryTree; 