import React, { useEffect, useState, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { FolderOpen, Clock } from '@phosphor-icons/react';
import { ChevronDown } from 'lucide-react';

interface RecentFoldersDropdownProps {
  onSelectRecent: (directory: string) => void;
  disabled?: boolean;
}

interface CommandResult<T> {
  success: boolean;
  data?: T;
  error?: string;
}

export const RecentFoldersDropdown: React.FC<RecentFoldersDropdownProps> = ({
  onSelectRecent,
  disabled = false
}) => {
  const [recentDirectories, setRecentDirectories] = useState<string[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const loadRecentDirectories = async () => {
      if (!isOpen) return;

      setLoading(true);
      try {
        const result = await invoke<CommandResult<string[]>>('get_recent_directories');
        if (result.success && result.data) {
          setRecentDirectories(result.data);
        }
      } catch (error) {
        console.error('Failed to load recent directories:', error);
      } finally {
        setLoading(false);
      }
    };

    if (isOpen) {
      loadRecentDirectories();
    }
  }, [isOpen]);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [isOpen]);

  const handleRecentSelect = async (directory: string) => {
    try {
      const result = await invoke<CommandResult<string>>('select_recent_directory', {
        directory
      });

      if (result.success && result.data) {
        onSelectRecent(result.data);
        setIsOpen(false);
      } else if (result.error) {
        // Directory no longer exists, reload the recent list
        if (result.error.includes('no longer exists')) {
          const refreshResult = await invoke<CommandResult<string[]>>('get_recent_directories');
          if (refreshResult.success && refreshResult.data) {
            setRecentDirectories(refreshResult.data);
          }
        }
        console.error('Error selecting recent directory:', result.error);
      }
    } catch (error) {
      console.error('Failed to select recent directory:', error);
    }
  };

  const getDirectoryName = (path: string): string => {
    return path.split('/').pop() || path.split('\\').pop() || path;
  };

  const truncatePath = (path: string, maxLength: number = 40): string => {
    if (path.length <= maxLength) return path;
    return '...' + path.slice(-(maxLength - 3));
  };

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        disabled={disabled}
        className="button rounded-md bg-transparent border-none text-lg hover:bg-black/10 dark:hover:bg-white/10 p-1.5 max-h-full"
        title="Recent Folders"
        data-tooltip-id="small-tooltip"
        data-tooltip-content="Select from recent folders"
      >
        <div className='flex items-center justify-center h-full w-full gap-1.5'>
          <Clock weight="duotone" />

          <ChevronDown className={`w-4 h-4 transition-all ${isOpen ? 'rotate-180' : ''}`} />
        </div>
      </button>

      {isOpen && (
        <div className="absolute right-0 top-full mt-1 w-80 bg-white dark:bg-gray-800 rounded-md shadow-lg border border-gray-200 dark:border-gray-700 z-50">
          <div className="p-3">
            <div className="flex items-center gap-2 mb-2 text-sm font-medium text-gray-600 dark:text-gray-400">
              <Clock className="h-4 w-4" />
              Recent Folders
            </div>

            {loading ? (
              <div className="text-center py-4 text-sm text-gray-500">Loading...</div>
            ) : recentDirectories.length === 0 ? (
              <div className="text-center py-4 text-sm text-gray-500">No recent folders</div>
            ) : (
              <div className="space-y-1 max-h-64 overflow-y-auto">
                {recentDirectories.slice(0, 10).map((directory) => (
                  <button
                    key={directory}
                    onClick={() => handleRecentSelect(directory)}
                    className="w-full text-left p-2 rounded-md text-sm hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors group flex items-center gap-2 cursor-pointer"
                    title={directory}
                  >
                    <FolderOpen className="h-4 w-4 text-gray-400 group-hover:text-gray-600 dark:group-hover:text-gray-300 flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="font-medium truncate text-gray-900 dark:text-gray-100">
                        {getDirectoryName(directory)}
                      </div>
                      <div className="text-xs text-gray-500 dark:text-gray-400 truncate">
                        {truncatePath(directory)}
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};