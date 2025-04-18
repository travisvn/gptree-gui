import { Folder, FolderOpen, CheckSquare, Square } from '@phosphor-icons/react';
import React, { useState, useEffect } from 'react';
import clsx from 'clsx'; // Helper for conditional classes
import { getMaterialIconPath } from '../icon-helpers/getMaterialIconName'; // Import the new helper
import {
  DiJavascript1,
  DiReact,
  DiHtml5,
  DiCss3,
  DiPython,
  DiRust,
  DiJava,
  DiTerminal, // For shell scripts
  DiMarkdown,
  DiGit, // For .git related files like .gitignore
  DiNpm, // For package.json, package-lock.json
  DiDocker,
} from 'react-icons/di'; // Devicons
import { BsFiletypeTsx, BsFiletypeJsx, BsFiletypeYml, BsFileText } from 'react-icons/bs'; // Bootstrap Icons for specific types
import { VscTerminalCmd, VscTerminalBash, VscTerminalPowershell, VscJson } from 'react-icons/vsc'; // VSCode Icons for terminals & JSON
import { SiTypescript } from 'react-icons/si'; // Simple Icons for TypeScript
import { GoFile } from 'react-icons/go'; // Github Octicons for default

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
}

const DirectoryTree: React.FC<DirectoryTreeProps> = ({ tree, onFileSelection, selectedFiles }) => {
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(() => {
    const initial = new Set<string>();
    if (tree && tree.is_dir) {
      initial.add(tree.path);
    }
    return initial;
  });
  const [localSelectedFiles, setLocalSelectedFiles] = useState<Set<string>>(new Set(selectedFiles));

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

  useEffect(() => {
    setLocalSelectedFiles(new Set(selectedFiles));
  }, [selectedFiles]);

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

  const toggleFileSelection = (path: string) => {
    setLocalSelectedFiles(prev => {
      const next = new Set(prev);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      onFileSelection(Array.from(next));
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectAllChecked) {
      setLocalSelectedFiles(new Set());
      onFileSelection([]);
    } else {
      const allFiles = getAllFilePaths(tree);
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

  // Recursive rendering of tree items
  const renderTreeItem = (item: DirectoryItem, level: number = 0) => {
    const isExpanded = expandedFolders.has(item.path);
    const isSelected = localSelectedFiles.has(item.path);
    const isFolder = item.is_dir;
    const isFileSelected = !isFolder && isSelected;
    const iconPath = getMaterialIconPath(item.name, isFolder, isExpanded);

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
              className="cursor-pointer mr-1.5 flex items-center gap-1 text-text" // Added flex/gap/text color
              onClick={e => { e.stopPropagation(); toggleFolder(item.path); }}
            >
              {/* Material Folder Icon (using the path which now includes -open if expanded) */}
              <img src={iconPath} alt="" className="w-5 h-5 flex-shrink-0" />
              {/* Expansion Toggle Icon (using Phosphor - kept for visual cue) */}
              {/* {isExpanded ? (
                <FolderOpen size={20} weight="duotone" />
              ) : (
                <Folder size={20} weight="duotone" />
              )} */}
            </span>
          )}

          {/* File Checkbox/Icon */}
          {!isFolder && (
            <span className={clsx(
              "mr-1.5 text-text", // Spacing
              'cursor-pointer flex items-center gap-1', // Use flex/gap, removed opacity changes
            )}>
              {/* File Type Icon */}
              <span className="inline-block w-5 h-5 flex-shrink-0 text-orange-700">
                {/* Use img tag for SVG - file icons don't need isExpanded */}
                <img src={iconPath} alt="" className="w-full h-full fill-amber-300 text-blue-500" />
              </span>
              {/* Selection Checkbox */}
              {isSelected ? (
                <CheckSquare size={20} weight="duotone" className="opacity-60 group-hover:opacity-80" />
              ) : (
                <Square size={20} weight="duotone" className="opacity-60 group-hover:opacity-80" />
              )}
            </span>
          )}

          {/* File/Folder Name */}
          <span
            id={`file-label-${item.path}`}
            className={clsx(
              'item-name flex-1 truncate select-none text-sm', // Base styles
              {
                'font-medium cursor-pointer': isFolder, // Use medium weight for folders
              }
            )}
            onClick={e => { if (isFolder) { e.stopPropagation(); toggleFolder(item.path); } }} // Toggle folder on name click too
          >
            {item.name}
          </span>
        </div>

        {/* Children */}
        {isFolder && isExpanded && (
          <div className=" pl-2 ml-[calc(0.25rem+1.25rem*var(--level))] border-l border-border">
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
        <div className=" flex items-center gap-2">
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
        <div className=" flex gap-2">
          <button onClick={expandAll} className="text-xs px-2 py-1">Expand</button>
          <button onClick={collapseAll} className="text-xs px-2 py-1">Collapse</button>
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