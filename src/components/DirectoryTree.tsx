import { File, Folder, FolderOpen } from '@phosphor-icons/react';
import React, { useState, useEffect } from 'react';

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
  const [selectAllChecked, setSelectAllChecked] = useState<boolean>(false);
  const [localSelectedFiles, setLocalSelectedFiles] = useState<Set<string>>(new Set(selectedFiles));

  // Update local state when selected files prop changes
  useEffect(() => {
    setLocalSelectedFiles(new Set(selectedFiles));
  }, [selectedFiles]);

  // Toggle a folder's expanded state
  const toggleFolder = (path: string) => {
    const newExpandedFolders = new Set(expandedFolders);
    if (newExpandedFolders.has(path)) {
      newExpandedFolders.delete(path);
    } else {
      newExpandedFolders.add(path);
    }
    setExpandedFolders(newExpandedFolders);
  };

  // Toggle a file's selected state
  const toggleFileSelection = (path: string) => {
    const newSelectedFiles = new Set(localSelectedFiles);
    if (newSelectedFiles.has(path)) {
      newSelectedFiles.delete(path);
    } else {
      newSelectedFiles.add(path);
    }
    setLocalSelectedFiles(newSelectedFiles);
    onFileSelection(Array.from(newSelectedFiles));
  };

  // Toggle select all files
  const toggleSelectAll = () => {
    if (selectAllChecked) {
      // Deselect all
      setLocalSelectedFiles(new Set());
      setSelectAllChecked(false);
      onFileSelection([]);
    } else {
      // Select all files (not directories)
      const allFiles: string[] = [];

      function collectFiles(item: DirectoryItem) {
        if (!item.is_dir) {
          allFiles.push(item.path);
        } else {
          item.children.forEach(collectFiles);
        }
      }

      collectFiles(tree);

      setLocalSelectedFiles(new Set(allFiles));
      setSelectAllChecked(true);
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
  const renderTreeItem = (item: DirectoryItem) => {
    const isExpanded = expandedFolders.has(item.path);
    const isSelected = localSelectedFiles.has(item.path);
    const isFolder = item.is_dir;
    return (
      <div
        key={item.path}
        className=''
        // className={`tree-item${isSelected && !isFolder ? ' selected' : ''}`}
        style={{
          background: isSelected && !isFolder ? 'var(--primary-color)' : 'none',
          color: isSelected && !isFolder ? 'white' : 'inherit',
          borderRadius: 6,
          marginBottom: 2,
          paddingLeft: 2,
          transition: 'background 0.2s, color 0.2s',
        }}
      >
        <div
          className="tree-item-content group"
          style={{ cursor: !isFolder ? 'pointer' : 'default', display: 'flex', alignItems: 'center' }}
          onClick={() => {
            if (!isFolder) toggleFileSelection(item.path);
          }}
        >
          {isFolder ? (
            <>
              <span
                className={`folder-icon ${isExpanded ? 'expanded' : ''} mr-4`}
                onClick={e => { e.stopPropagation(); toggleFolder(item.path); }}
              >
                {isExpanded ? (
                  <FolderOpen size={24} weight="duotone" className="text-inherit group-hover:text-white" />
                ) : (
                  <Folder size={24} weight="duotone" className="text-inherit group-hover:text-white" />
                )}
              </span>
              <span
                className="item-name folder-name group-hover:text-white"
                onClick={e => { e.stopPropagation(); toggleFolder(item.path); }}
                style={{ fontWeight: 600, cursor: 'pointer' }}
              >
                {item.name}
              </span>
            </>
          ) : (
            <>
              <input
                type="checkbox"
                checked={isSelected}
                onChange={e => { e.stopPropagation(); toggleFileSelection(item.path); }}
                className="file-checkbox"
                id={`file-checkbox-${item.path}`}
                tabIndex={-1}
                style={{ pointerEvents: 'none' }}
              />
              <span style={{ marginRight: 6 }}>
                <File size={24} weight="duotone" className="text-inherit" />
              </span>
              <span className="item-name file-name group-hover:text-white">{item.name}</span>
            </>
          )}
        </div>
        {item.is_dir && isExpanded && (
          <div className="tree-children">
            {item.children.map(renderTreeItem)}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="directory-tree overflow-y-auto h-full">
      <div className="tree-controls">
        <div className="tree-select-controls">
          <input
            type="checkbox"
            checked={selectAllChecked}
            onChange={toggleSelectAll}
            id="select-all"
          />
          <label htmlFor="select-all">Select All Files</label>
        </div>
        <div className="tree-expand-controls">
          <button onClick={expandAll}>Expand All</button>
          <button onClick={collapseAll}>Collapse All</button>
        </div>
      </div>

      <div className="tree-container">
        {renderTreeItem(tree)}
      </div>
    </div>
  );
};

export default DirectoryTree; 