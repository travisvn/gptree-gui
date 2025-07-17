import React, { useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { FolderOpen, Clock } from 'lucide-react';

interface RecentFoldersProps {
  onSelectRecent: (directory: string) => void;
  className?: string;
}

interface CommandResult<T> {
  success: boolean;
  data?: T;
  error?: string;
}

export const RecentFolders: React.FC<RecentFoldersProps> = ({
  onSelectRecent,
  className = ''
}) => {
  const [recentDirectories, setRecentDirectories] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadRecentDirectories = async () => {
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

    loadRecentDirectories();
  }, []);

  const handleRecentSelect = async (directory: string) => {
    try {
      const result = await invoke<CommandResult<string>>('select_recent_directory', {
        directory
      });

      if (result.success && result.data) {
        onSelectRecent(result.data);
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

  if (loading || recentDirectories.length === 0) {
    return null;
  }

  const getDirectoryName = (path: string): string => {
    return path.split('/').pop() || path.split('\\').pop() || path;
  };

  const truncatePath = (path: string, maxLength: number = 50): string => {
    if (path.length <= maxLength) return path;
    return '...' + path.slice(-(maxLength - 3));
  };

  return (
    <div className={`recent-folders ${className}`}>
      <div className="flex items-center gap-2 mb-3">
        <Clock className="h-4 w-4 text-muted-foreground" />
        <h3 className="text-sm font-medium text-muted-foreground">Recent Folders</h3>
      </div>

      <div className="space-y-1">
        {recentDirectories.slice(0, 5).map((directory) => (
          <button
            key={directory}
            onClick={() => handleRecentSelect(directory)}
            className="w-full text-left p-2 rounded-md text-sm hover:bg-accent hover:text-accent-foreground transition-colors group flex items-center gap-2 cursor-pointer"
            title={directory}
          >
            <FolderOpen className="h-4 w-4 text-muted-foreground group-hover:text-accent-foreground flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <div className="font-medium truncate">
                {getDirectoryName(directory)}
              </div>
              <div className="text-xs text-muted-foreground truncate">
                {truncatePath(directory)}
              </div>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
};