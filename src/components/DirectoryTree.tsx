import { File, Folder, FolderOpen, CheckSquare, Square } from '@phosphor-icons/react';
import React, { useState, useEffect } from 'react';
import clsx from 'clsx'; // Helper for conditional classes
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
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(() => {
    // Initialize with the root folder expanded if it's a directory
    const initial = new Set<string>();
    if (tree && tree.is_dir) {
      initial.add(tree.path);
    }
    return initial;
  });
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

  // Helper to get file extension
  const getFileExtension = (filename: string): string => {
    return filename.slice(((filename.lastIndexOf(".") - 1) >>> 0) + 2).toLowerCase();
  };

  // Map extensions to icons
  const getIconForFile = (filename: string) => {
    const extension = getFileExtension(filename);
    switch (extension) {
      case 'js': return <DiJavascript1 className="text-yellow-500" />;
      case 'jsx': return <BsFiletypeJsx className="text-blue-400" />;
      case 'ts': return <SiTypescript className="text-blue-600" />;
      case 'tsx': return <BsFiletypeTsx className="text-blue-400" />; // Often styled like React
      case 'html': return <DiHtml5 className="text-orange-600" />;
      case 'css': return <DiCss3 className="text-blue-500" />;
      case 'py': return <DiPython className="text-blue-400" />; // Often associated with blue/yellow
      case 'rs': return <DiRust className="text-orange-700" />;
      case 'java': return <DiJava className="text-red-600" />; // Often red/blue
      case 'json': // Handle package.json specifically
        if (filename === 'package.json' || filename === 'package-lock.json') {
          return <DiNpm className="text-red-600" />;
        }
        return <VscJson className="text-yellow-600" />;
      case 'md': return <DiMarkdown className="text-gray-400" />;
      case 'sh': return <VscTerminalBash className="text-green-500" />;
      case 'bat': return <VscTerminalPowershell className="text-blue-500" />;
      case 'cmd': return <VscTerminalCmd className="text-gray-400" />;
      case 'yaml':
      case 'yml': return <BsFiletypeYml className="text-gray-400" />;
      case 'gitignore': return <DiGit className="text-red-500" />;
      case 'dockerfile': return <DiDocker className="text-blue-500" />;
      case 'txt': return <BsFileText className="text-gray-400" />;
      default: return <GoFile className="text-gray-400" />; // Default icon
    }
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
              className="cursor-pointer mr-1.5 text-text " // Icon color adjusts on hover
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
              "mr-1.5 text-text", // Spacing
              'cursor-pointer opacity-60 group-hover:opacity-80 flex items-center gap-1', // Added flex/gap
              // isFileSelected ? "dark:text-white" : "text-text opacity-60 group-hover:opacity-100 group-hover:text-primary" // Explicit color for selected/unselected/hover
            )}>
              {/* File Type Icon */}
              <span className="inline-block w-5 h-5 flex-shrink-0"> {/* Container for icon size */}
                {getIconForFile(item.name)}
              </span>
              {/* Selection Checkbox */}
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
          <div className=" pl-2 ml-[calc(0.25rem+1.25rem*var(--level))] border-l border-border">
            {/* NOTE: The above might need adjustment if level isn't passed correctly or CSS var isn't supported */}
            {/* Simpler alternative: fixed margin/padding on children div */}
            {item.children.map(child => renderTreeItem(child, level + 1))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="directory-tree flex flex-col h-full overflow-hidden">
      {/* Controls - Use lighter border */}
      <div className="flex justify-between items-center p-2 border-b border-border flex-shrink-0">
        <div className=" flex items-center gap-2">
          <input
            type="checkbox" // Using styled native checkbox now
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
      {/* Removed p-1, padding is handled per item now */}
      <div className="flex-grow overflow-y-auto pt-1">
        {renderTreeItem(tree)} {/* Start rendering at level 0 */}
      </div>
    </div>
  );
};

export default DirectoryTree; 