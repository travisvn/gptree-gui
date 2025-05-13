import React, { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { AppSettings, CommandResult } from '@/lib/types';
import { settingsAtom } from '@/lib/store/atoms';
import { useAtomValue } from 'jotai';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from '@/lib/utils';

interface SettingsModalProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  onSettingsSaved: (newSettings: AppSettings) => void;
}

const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onOpenChange,
  onSettingsSaved,
}) => {
  const globalSettings = useAtomValue(settingsAtom);
  const [editedSettings, setEditedSettings] = useState<AppSettings | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen && globalSettings) {
      setEditedSettings(JSON.parse(JSON.stringify(globalSettings)));
      setError(null);
    } else if (!isOpen) {
      setEditedSettings(null);
      setError(null);
    }
  }, [isOpen, globalSettings]);

  const handleSwitchChange = (field: keyof AppSettings, checked: boolean) => {
    setEditedSettings((prev) => (prev ? { ...prev, [field]: checked } : null));
  };

  const handleSave = async () => {
    if (!editedSettings) return;

    setIsLoading(true);
    setError(null);
    try {
      const result = await invoke<CommandResult<boolean>>('save_app_settings', {
        settings: editedSettings,
      });
      if (result.success) {
        onSettingsSaved(editedSettings);
        onOpenChange(false);
      } else {
        setError((result.error as string) ?? 'Failed to save settings.');
      }
    } catch (err: any) {
      setError(`Error saving settings: ${err.toString()}`);
    } finally {
      setIsLoading(false);
    }
  };

  const handleCancel = () => {
    onOpenChange(false);
  };

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className={cn("sm:max-w-[500px]")}>
        <DialogHeader>
          <DialogTitle>Application Settings</DialogTitle>
          <DialogDescription>
            Manage application-wide preferences.
          </DialogDescription>
        </DialogHeader>

        <div className="py-4 min-h-[200px]">
          {isOpen && isLoading && !editedSettings && <p>Loading settings...</p>}
          {error && <p className="text-red-500">Error: {error}</p>}
          {editedSettings && (
            <div className="grid gap-6">
              <div className="flex items-center justify-between space-x-2">
                <Label htmlFor="local-config-switch" className="flex flex-col space-y-1 items-start cursor-pointer">
                  <span>Default to Local Config</span>
                  <span className="font-normal leading-snug text-muted-foreground">
                    Prefer '.gptree_config' in the project folder when available.
                  </span>
                </Label>
                <Switch
                  id="local-config-switch"
                  checked={editedSettings.defaultToLocalConfig}
                  onCheckedChange={(checked) =>
                    handleSwitchChange('defaultToLocalConfig', checked)
                  }
                  disabled={isLoading}
                />
              </div>
              <div className="flex items-center justify-between space-x-2">
                <Label htmlFor="prompt-switch" className="flex flex-col space-y-1 items-start cursor-pointer">
                  <span>Prompt for Directory on Startup</span>
                  <span className="font-normal leading-snug text-muted-foreground">
                    If enabled, show the directory picker if no recent project is found.
                  </span>
                </Label>
                <Switch
                  id="prompt-switch"
                  checked={editedSettings.promptForDirectoryOnStartup}
                  onCheckedChange={(checked) =>
                    handleSwitchChange('promptForDirectoryOnStartup', checked)
                  }
                  disabled={isLoading}
                />
              </div>
              <div className="flex items-center justify-between space-x-2">
                <Label htmlFor="folder-checkbox-switch" className="flex flex-col space-y-1 items-start cursor-pointer">
                  <span>Enable Folder Selection Checkboxes</span>
                  <span className="font-normal leading-snug text-muted-foreground">
                    Show checkboxes next to folders to select/deselect all their contents.
                  </span>
                </Label>
                <Switch
                  id="folder-checkbox-switch"
                  checked={editedSettings.enableFolderCheckboxes}
                  onCheckedChange={(checked) =>
                    handleSwitchChange('enableFolderCheckboxes', checked)
                  }
                  disabled={isLoading}
                />
              </div>
            </div>
          )}
          {isOpen && !isLoading && !editedSettings && !error && <p>Could not load settings.</p>}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleCancel} disabled={isLoading}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={isLoading || !editedSettings}>
            {isLoading ? 'Saving...' : 'Save Changes'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default SettingsModal;