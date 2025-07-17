import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { CommandResult } from '@/lib/types';

interface UpdateInfo {
  available: boolean;
  version?: string;
  date?: string;
  body?: string;
  reason?: string;
}

export const useUpdater = () => {
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null);
  const [isChecking, setIsChecking] = useState(false);
  const [isInstalling, setIsInstalling] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const checkForUpdates = async () => {
    setIsChecking(true);
    setError(null);
    
    try {
      const result = await invoke<CommandResult<UpdateInfo>>('check_for_updates');
      if (result.success && result.data) {
        setUpdateInfo(result.data);
      } else {
        setError(result.error as string || 'Failed to check for updates');
      }
    } catch (err: any) {
      setError(`Error checking for updates: ${err.toString()}`);
    } finally {
      setIsChecking(false);
    }
  };

  const installUpdate = async () => {
    if (!updateInfo?.available) return;

    setIsInstalling(true);
    setError(null);

    try {
      const result = await invoke<CommandResult<boolean>>('install_update');
      if (!result.success) {
        setError(result.error as string || 'Failed to install update');
      }
      // If successful, the app will restart automatically
    } catch (err: any) {
      setError(`Error installing update: ${err.toString()}`);
    } finally {
      setIsInstalling(false);
    }
  };

  // Check for updates on mount if auto-updates are enabled
  useEffect(() => {
    checkForUpdates();
  }, []);

  return {
    updateInfo,
    isChecking,
    isInstalling,
    error,
    checkForUpdates,
    installUpdate,
  };
};