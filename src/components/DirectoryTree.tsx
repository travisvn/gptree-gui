import { CheckSquare, Square, MinusSquare, MinusCircle, PlusCircle } from '@phosphor-icons/react';
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import clsx from 'clsx'; // Helper for conditional classes
import { getMaterialIconPath } from '../icon-helpers/getMaterialIconName'; // Import the new helper
import { ChevronsUpDown, ChevronsDownUp } from 'lucide-react';
import { type DirectoryItem as DirectoryItemType } from '../lib/types'; // Use type import


// Export if needed by getMaterialIconName.ts (not strictly required by current implementation)
export interface DirectoryItem extends DirectoryItemType {
  // is_excluded_by_config?: boolean; // This is already in DirectoryItemType from types.ts
}

interface DirectoryTreeProps {
  tree: DirectoryItemType;
  onFileSelection: (selectedFiles: string[]) => void;
  selectedFiles: string[];
  enableFolderCheckboxes: boolean;
  effectiveExcludedDirs: Set<string>; // Added
  configDefinedExclusions: Set<string>; // Added: from saved config
  onToggleUIDirectoryExclusion: (path: string) => void; // Renamed from onToggleTemporaryExcludeDir
  currentDirectory: string; // Added to help with relative pathing
}

const DirectoryTree: React.FC<DirectoryTreeProps> = ({
  tree,
  onFileSelection,
  selectedFiles,
  enableFolderCheckboxes,
  effectiveExcludedDirs,
  configDefinedExclusions,
  onToggleUIDirectoryExclusion, // Renamed
  currentDirectory,
}) => {
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(() => {
    const initial = new Set<string>();
    if (tree && tree.is_dir) {
      initial.add(tree.path);
    }
    return initial;
  });
  const [localSelectedFiles, setLocalSelectedFiles] = useState<Set<string>>(new Set(selectedFiles));

  // Helper to get all descendant file paths, now respects effectiveExclusions
  const getDescendantFiles = useCallback((item: DirectoryItemType, currentEffectiveExcludes: Set<string>): string[] => {
    let paths: string[] = [];
    const itemRelativePath = item.path.startsWith(currentDirectory + '/')
      ? item.path.substring(currentDirectory.length + 1)
      : item.path;

    if (item.is_dir && currentEffectiveExcludes.has(itemRelativePath)) {
      return []; // Excluded directory, no files from here
    }

    if (!item.is_dir) {
      paths.push(item.path);
    } else if (item.children) {
      item.children.forEach(child => {
        paths = paths.concat(getDescendantFiles(child, currentEffectiveExcludes));
      });
    }
    return paths;
  }, [currentDirectory]);


  const allFilePathsInTree = useMemo(() => {
    if (!tree) return [];
    return getDescendantFiles(tree, effectiveExcludedDirs);
  }, [tree, effectiveExcludedDirs, getDescendantFiles]);


  const selectAllChecked = useMemo(() => {
    if (allFilePathsInTree.length === 0 && selectedFiles.length === 0) return false; // No selectable files, not checked
    if (allFilePathsInTree.length === 0 && selectedFiles.length > 0) return false; // Should not happen if selection logic is correct
    if (allFilePathsInTree.length > 0 && selectedFiles.length === 0) return false;
    // Check if all *selectable* files are in *currently selected* files
    // This needs to compare against `localSelectedFiles` which are the ones this component directly controls.
    return allFilePathsInTree.every(path => localSelectedFiles.has(path));
  }, [localSelectedFiles, allFilePathsInTree]);


  useEffect(() => {
    // When selectedFiles prop from parent changes, update local state
    // But only include files that are NOT under an effectively excluded directory
    const newLocalSelected = new Set<string>();
    selectedFiles.forEach(sf => {
      const relativePath = sf.startsWith(currentDirectory + '/')
        ? sf.substring(currentDirectory.length + 1)
        : sf;

      let isUnderExcludedDir = false;
      for (const excludedDir of effectiveExcludedDirs) {
        if (relativePath.startsWith(excludedDir + '/') || relativePath === excludedDir) {
          isUnderExcludedDir = true;
          break;
        }
      }
      if (!isUnderExcludedDir) {
        newLocalSelected.add(sf);
      }
    });
    setLocalSelectedFiles(newLocalSelected);
  }, [selectedFiles, effectiveExcludedDirs, currentDirectory]);

  useEffect(() => {
    if (tree && tree.is_dir) {
      setExpandedFolders(new Set([tree.path]));
    } else {
      setExpandedFolders(new Set());
    }
    // When tree changes (new directory loaded), parent clears selections.
    // We should reflect that by clearing localSelectedFiles as well.
    // The `selectedFiles` prop will be empty from App.tsx during loadDirectory.
    setLocalSelectedFiles(new Set(selectedFiles));
  }, [tree, selectedFiles]);


  const getFolderSelectionState = useCallback((folder: DirectoryItemType, currentSelectedFiles: Set<string>): 'checked' | 'unchecked' | 'indeterminate' => {
    const descendantFiles = getDescendantFiles(folder, effectiveExcludedDirs); // Respect exclusions
    if (descendantFiles.length === 0) {
      return 'unchecked';
    }
    const selectedCount = descendantFiles.filter(path => currentSelectedFiles.has(path)).length;

    if (selectedCount === 0) return 'unchecked';
    if (selectedCount === descendantFiles.length) return 'checked';
    return 'indeterminate';
  }, [getDescendantFiles, effectiveExcludedDirs]);


  const toggleFolderSelection = (folder: DirectoryItemType) => {
    const descendantFiles = getDescendantFiles(folder, effectiveExcludedDirs); // Respect exclusions
    if (descendantFiles.length === 0) return;

    const currentState = getFolderSelectionState(folder, localSelectedFiles);
    let newSelectedPaths: string[];

    setLocalSelectedFiles(prev => {
      const next = new Set(prev);
      if (currentState === 'checked') {
        descendantFiles.forEach(path => next.delete(path));
      } else {
        descendantFiles.forEach(path => next.add(path));
      }
      newSelectedPaths = Array.from(next);
      onFileSelection(newSelectedPaths);
      return next;
    });
  };

  const toggleSelectAll = () => {
    const currentSelectableFiles = getDescendantFiles(tree, effectiveExcludedDirs); // Respect exclusions
    if (selectAllChecked) { // If all are checked, uncheck all
      setLocalSelectedFiles(new Set());
      onFileSelection([]);
    } else { // Check all selectable
      setLocalSelectedFiles(new Set(currentSelectableFiles));
      onFileSelection(currentSelectableFiles);
    }
  };

  const expandAll = () => {
    // ... (expandAll logic remains similar, but ensure it operates on DirectoryItemType)
    const allFolders: string[] = [];
    function collectFolders(item: DirectoryItemType) {
      if (item.is_dir) {
        allFolders.push(item.path);
        item.children.forEach(collectFolders);
      }
    }
    if (tree) collectFolders(tree);
    setExpandedFolders(new Set(allFolders));
  };

  const collapseAll = () => {
    setExpandedFolders(new Set());
  };

  const toggleFolder = (path: string) => {
    setExpandedFolders(prev => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  };

  const toggleFileSelection = (path: string) => {
    // Check if the file is under an effectively excluded directory before allowing selection
    const relativeFilePath = path.startsWith(currentDirectory + '/')
      ? path.substring(currentDirectory.length + 1)
      : path;

    let isUnderExcludedDir = false;
    for (const excludedDir of effectiveExcludedDirs) {
      // Check if the file path starts with the excluded directory path + separator,
      // or if the file path is exactly the excluded directory (though this is for files, so less likely)
      if (relativeFilePath.startsWith(excludedDir + '/') || relativeFilePath === excludedDir) {
        isUnderExcludedDir = true;
        break;
      }
    }

    if (isUnderExcludedDir) {
      // Optionally, provide feedback to the user that the file cannot be selected
      // console.log(`File ${path} is under an excluded directory and cannot be selected.`);
      return;
    }

    setLocalSelectedFiles(prev => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      onFileSelection(Array.from(next));
      return next;
    });
  };

  const renderTreeItem = (item: DirectoryItemType, level: number = 0): JSX.Element | null => {
    if (!item) return null;
    const isExpanded = expandedFolders.has(item.path);
    const isSelected = localSelectedFiles.has(item.path);
    const isFolder = item.is_dir;

    const itemRelativePath = item.path.startsWith(currentDirectory + '/')
      ? item.path.substring(currentDirectory.length + 1)
      : item.path;

    const isEffectivelyExcluded = isFolder && effectiveExcludedDirs.has(itemRelativePath);
    const isExcludedBySavedConfig = isFolder && configDefinedExclusions.has(itemRelativePath);

    const folderSelectionState = isFolder ? getFolderSelectionState(item, localSelectedFiles) : null;
    const iconPath = getMaterialIconPath(item.name, isFolder, isExpanded);

    return (
      <div key={item.path} className={clsx("flex flex-col pr-1", { 'opacity-50': isEffectivelyExcluded && isFolder })}>
        <div
          className={clsx(
            'group flex items-center p-1 rounded',
            'hover:bg-secondary dark:hover:text-white',
            { 'cursor-pointer': !isFolder && !isEffectivelyExcluded }, // Only allow file click if not under excluded dir
            { 'select-none': isEffectivelyExcluded && isFolder } // Prevent selection interaction with name if folder excluded
          )}
          style={{ paddingLeft: `${(level * 0.3) + 0.25}rem` }}
          onClick={() => {
            if (!isFolder && !isEffectivelyExcluded) { // Check effective exclusion for file's parent
              let parentEffectivelyExcluded = false;
              for (const excludedDir of effectiveExcludedDirs) {
                if (itemRelativePath.startsWith(excludedDir + '/')) {
                  parentEffectivelyExcluded = true;
                  break;
                }
              }
              if (!parentEffectivelyExcluded) toggleFileSelection(item.path);
            }
          }}
        >
          {isFolder && (
            <div className="flex items-center gap-1 mr-1.5 flex-shrink-0">
              {enableFolderCheckboxes && !isEffectivelyExcluded && ( // Disable folder checkbox if folder is excluded
                <span
                  onClick={e => { e.stopPropagation(); toggleFolderSelection(item); }}
                  className="cursor-pointer"
                  title={`Select/deselect all files in ${item.name}`}
                >
                  {folderSelectionState === 'checked' && <CheckSquare size={20} weight="fill" className="text-primary opacity-70 dark:opacity-90" />}
                  {folderSelectionState === 'unchecked' && <Square size={20} weight="thin" className="opacity-30 group-hover:opacity-40" />}
                  {folderSelectionState === 'indeterminate' && <MinusSquare size={20} weight="fill" className="text-primary opacity-70 dark:opacity-90" />}
                </span>
              )}
              {enableFolderCheckboxes && isEffectivelyExcluded && ( // Placeholder for excluded folder checkbox
                <Square size={20} weight="thin" className="opacity-10" />
              )}

              <span
                className="cursor-pointer flex items-center"
                onClick={e => { e.stopPropagation(); if (!isEffectivelyExcluded) toggleFolder(item.path); }}
              >
                <img src={iconPath} alt="" className="w-5 h-5 flex-shrink-0" />
              </span>
            </div>
          )}

          {!isFolder && (
            <span className={clsx(
              "mr-1.5 text-text flex items-center gap-1 flex-shrink-0",
              { 'opacity-50 pointer-events-none': effectiveExcludedDirs.has(itemRelativePath.substring(0, itemRelativePath.lastIndexOf('/'))) } // Dim file if parent is excluded
            )}>
              <span className="inline-block w-5 h-5">
                <img src={iconPath} alt="" className="w-full h-full" />
              </span>
              <span className="cursor-pointer">
                {isSelected ? (
                  <CheckSquare size={20} weight="fill" className="opacity-60 group-hover:opacity-80" />
                ) : (
                  <Square size={20} weight="thin" className="opacity-60 group-hover:opacity-80" />
                )}
              </span>
            </span>
          )}

          <span
            id={`file-label-${item.path}`}
            className={clsx(
              'item-name flex-1 truncate select-none text-sm',
              { 'font-medium': isFolder },
              { 'cursor-pointer': isFolder && !isEffectivelyExcluded },
              { 'line-through text-muted-foreground': isEffectivelyExcluded && isFolder }
            )}
            onClick={e => { if (isFolder && !isEffectivelyExcluded) { e.stopPropagation(); toggleFolder(item.path); } }}
            title={item.name + (isEffectivelyExcluded && isFolder ? ' (Excluded)' : '')}
          >
            {item.name}
          </span>

          {isFolder && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onToggleUIDirectoryExclusion(item.path);
              }}
              className={clsx(
                "ml-auto p-0.5 rounded opacity-0 group-hover:opacity-100 focus:opacity-100 hover:bg-destructive/20",
                {
                  "opacity-100": isEffectivelyExcluded,
                  "hover:bg-green-500/20": isEffectivelyExcluded,
                }
              )}
              title={
                isExcludedBySavedConfig
                  ? (isEffectivelyExcluded ? "Directory is excluded by saved config. Click to include (marks config as unsaved)." : "Directory was in saved config but now included for this session. Click to re-exclude for session.")
                  : (isEffectivelyExcluded ? "Directory is excluded for this session. Click to include for session." : "Click to exclude this directory for this session.")
              }
            >
              {isEffectivelyExcluded ?
                <PlusCircle size={16} weight={"fill"} className={clsx("text-green-600")} /> :
                <MinusCircle size={16} weight={"duotone"} className={clsx("text-destructive opacity-70")} />
              }
            </button>
          )}
        </div>

        {isFolder && isExpanded && !isEffectivelyExcluded && ( // Do not render children if folder is effectively excluded
          <div
            className='pl-1 border-l border-border'
            style={{ marginLeft: `0.75rem` }}
          >
            {item.children.map(child => renderTreeItem(child, level + 1))}
          </div>
        )}
      </div>
    );
  };

  if (!tree) {
    return <div className="p-4 text-center text-sm text-muted-foreground">Loading tree...</div>;
  }

  return (
    <div className="directory-tree flex flex-col h-full overflow-hidden">
      <div className="flex justify-between items-center p-2 border-b border-border flex-shrink-0">
        <div className="flex items-center gap-1"> {/* Added gap */}
          <input
            type="checkbox"
            checked={selectAllChecked}
            onChange={toggleSelectAll}
            id="select-all"
            className="cursor-pointer form-checkbox h-4 w-4 text-primary rounded" // Adjusted size and style
            disabled={allFilePathsInTree.length === 0}
          />
          <label htmlFor="select-all" className="cursor-pointer text-sm select-none">
            Select All
          </label>
        </div>
        <div className="flex gap-2">
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

      <div className="flex-grow overflow-y-auto pt-1">
        {renderTreeItem(tree)}
      </div>

      {/* <div className="text-center text-xs text-muted-foreground px-2 py-1 flex-shrink-0">
        {allFilePathsInTree.length > 0 ?
          `${localSelectedFiles.size} of ${allFilePathsInTree.length} files selected` :
          'No files available'
        }
      </div> */}
    </div>
  );
};

export default DirectoryTree; 