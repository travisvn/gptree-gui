import { File, Folder, FolderOpen, CheckSquare, Square } from '@phosphor-icons/react';
import React, { useState, useEffect } from 'react';
import clsx from 'clsx'; // Helper for conditional classes

interface DirectoryItem {
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
}

const DirectoryTree: React.FC<DirectoryTreeProps> = ({ tree, onFileSelection, selectedFiles }) => {
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());
  // We derive "select all" state instead of storing it
  // const [selectAllChecked, setSelectAllChecked] = useState<boolean>(false);
  const [localSelectedFiles, setLocalSelectedFiles] = useState<Set<string>>(new Set(selectedFiles));

  // Helper function to get all file paths within a subtree
  const getAllFilePaths = (item: DirectoryItem): string[] => {
    let paths: string[] = [];
    if (!item.is_dir) {
      paths.push(item.path);
    } else {
      item.children.forEach(child => {
        paths = paths.concat(getAllFilePaths(child));
      });
    }
    return paths;
  };

  const allFilePathsInTree = React.useMemo(() => getAllFilePaths(tree), [tree]);
  const selectAllChecked = React.useMemo(() => {
    if (allFilePathsInTree.length === 0) return false;
    return allFilePathsInTree.every(path => localSelectedFiles.has(path));
  }, [localSelectedFiles, allFilePathsInTree]);

  // Update local state when selected files prop changes from parent
  useEffect(() => {
    setLocalSelectedFiles(new Set(selectedFiles));
  }, [selectedFiles]);

  // Toggle a folder's expanded state
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

  // Toggle a file's selected state
  const toggleFileSelection = (path: string) => {
    setLocalSelectedFiles(prev => {
      const next = new Set(prev);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      // Propagate change to parent
      onFileSelection(Array.from(next));
      return next;
    });
  };

  // Toggle select all files
  const toggleSelectAll = () => {
    if (selectAllChecked) {
      // Deselect all
      setLocalSelectedFiles(new Set());
      onFileSelection([]);
    } else {
      // Select all
      const allFiles = getAllFilePaths(tree);
      setLocalSelectedFiles(new Set(allFiles));
      onFileSelection(allFiles);
    }
  };

  // Expand all folders
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

  // Collapse all folders
  const collapseAll = () => {
    setExpandedFolders(new Set());
  };

  // Recursive rendering of tree items
  const renderTreeItem = (item: DirectoryItem, level: number = 0) => {
    const isExpanded = expandedFolders.has(item.path);
    const isSelected = localSelectedFiles.has(item.path);
    const isFolder = item.is_dir;
    const isFileSelected = !isFolder && isSelected;

    return (
      <div key={item.path} className="flex flex-col">
        {/* Item Row */}
        <div
          className={clsx(
            'group flex items-center p-1 rounded', // Base styles
            'hover:bg-secondary dark:hover:text-white', // Hover styles
            {
              'bg-border dark:text-white': isFileSelected, // Selected file style
              'cursor-pointer': !isFolder, // Cursor for files
            }
          )}
          style={{ paddingLeft: `${level * 1.25 + 0.25}rem` }} // Indentation
          onClick={() => {
            if (!isFolder) toggleFileSelection(item.path);
          }}
        >
          {/* Folder Icon/Toggle */}
          {isFolder && (
            <span
              className="cursor-pointer mr-1.5 text-[--text-color] group-hover:text-white" // Icon color adjusts on hover
              onClick={e => { e.stopPropagation(); toggleFolder(item.path); }}
            >
              {isExpanded ? (
                <FolderOpen size={20} weight="duotone" /> // Icon itself doesn't need text-inherit if parent handles color
              ) : (
                <Folder size={20} weight="duotone" />
              )}
            </span>
          )}

          {/* File Checkbox/Icon */}
          {!isFolder && (
            <span className={clsx(
              "mr-1.5", // Spacing
              isFileSelected ? "dark:text-white" : "text-[--text-color] opacity-60 group-hover:opacity-100 group-hover:text-primary" // Explicit color for selected/unselected/hover
            )}>
              {isSelected ? (
                <CheckSquare size={20} weight="duotone" />
              ) : (
                <Square size={20} weight="duotone" />
              )}
            </span>
          )}

          {/* File/Folder Name */}
          <span
            id={`file-label-${item.path}`}
            className={clsx(
              'item-name flex-1 truncate select-none text-sm', // Base styles
              {
                'font-semibold cursor-pointer': isFolder, // Folder specific
                // Text color is handled by the parent div's text-white on select/hover
              }
            )}
            onClick={e => { if (isFolder) { e.stopPropagation(); toggleFolder(item.path); } }}
          >
            {item.name}
          </span>
        </div>

        {/* Children */}
        {isFolder && isExpanded && (
          // Use slightly lighter border for children indentation lines
          <div className="tree-children pl-2 ml-[calc(0.25rem+1.25rem*var(--level))] border-l border-gray-100 dark:border-gray-600">
            {/* NOTE: The above might need adjustment if level isn't passed correctly or CSS var isn't supported */}
            {/* Simpler alternative: fixed margin/padding on children div */}
            {/* <div className="tree-children pl-2 ml-5 border-l border-gray-200 dark:border-gray-700"> */}
            {item.children.map(child => renderTreeItem(child, level + 1))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="directory-tree flex flex-col h-full overflow-hidden">
      {/* Controls - Use lighter border */}
      <div className="tree-controls flex justify-between items-center p-2 border-b border-[--border-color] flex-shrink-0">
        <div className="tree-select-controls flex items-center gap-2">
          <input
            type="checkbox" // Using styled native checkbox now
            checked={selectAllChecked}
            onChange={toggleSelectAll}
            id="select-all"
            className="cursor-pointer"
            disabled={allFilePathsInTree.length === 0}
          />
          <label htmlFor="select-all" className="cursor-pointer text-sm select-none">
            Select All Files
          </label>
        </div>
        <div className="tree-expand-controls flex gap-2">
          <button onClick={expandAll} className="text-xs px-2 py-1">Expand All</button>
          <button onClick={collapseAll} className="text-xs px-2 py-1">Collapse All</button>
        </div>
      </div>

      {/* Scrollable tree container */}
      {/* Removed p-1, padding is handled per item now */}
      <div className="tree-container flex-grow overflow-y-auto pt-1">
        {renderTreeItem(tree)} {/* Start rendering at level 0 */}
      </div>
    </div>
  );
};

export default DirectoryTree; 