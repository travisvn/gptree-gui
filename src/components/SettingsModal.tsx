import React, { useState, useEffect, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import Modal from '@/components/Modal';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { AppSettings, CommandResult } from '@/lib/types';
import { settingsAtom } from '@/lib/store/atoms';
import { useAtomValue } from 'jotai'; // Use useAtomValue to read global state

interface SettingsModalProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  onSettingsSaved: (newSettings: AppSettings) => void; // Update prop signature
}

const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onOpenChange,
  onSettingsSaved,
}) => {
  // Read global settings state
  const globalSettings = useAtomValue(settingsAtom);
  // Local state for editing within the modal
  const [editedSettings, setEditedSettings] = useState<AppSettings | null>(null);

  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Initialize local state when modal opens or global state changes while open
  useEffect(() => {
    if (isOpen && globalSettings) {
      // Deep copy to avoid mutating global state directly
      setEditedSettings(JSON.parse(JSON.stringify(globalSettings)));
      setError(null); // Clear error when reopening/reinitializing
    } else if (!isOpen) {
      // Clear local state when modal closes
      setEditedSettings(null);
      setError(null);
    }
    // If globalSettings is null (initial load failed), editedSettings remains null
    // and the modal shows loading/error state.
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
        settings: editedSettings, // Pass the edited state
      });
      if (result.success) {
        // Pass the saved (edited) settings back to the parent
        onSettingsSaved(editedSettings);
        onOpenChange(false); // Close modal on success
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
    onOpenChange(false); // Just close the modal, discard local edits
  };

  return (
    <Modal
      isOpen={isOpen}
      onOpenChange={onOpenChange}
      title="Application Settings"
      description="Manage application-wide preferences."
      className="sm:max-w-[500px]"
      footer={
        <>
          <Button variant="outline" onClick={handleCancel} disabled={isLoading}>
            Cancel
          </Button>
          {/* Disable save if loading or if settings haven't loaded */}
          <Button onClick={handleSave} disabled={isLoading || !editedSettings}>
            {isLoading ? 'Saving...' : 'Save Changes'}
          </Button>
        </>
      }
    >
      <div className="py-4">
        {/* Show loading if modal is open but editedSettings is null (still loading/initializing) */}
        {isOpen && isLoading && !editedSettings && <p>Loading settings...</p>}
        {/* Show error if error exists */}
        {error && <p className="text-red-500">Error: {error}</p>}
        {/* Show settings form only if editedSettings is populated */}
        {editedSettings && (
          <div className="grid gap-6">
            <div className="flex items-center justify-between space-x-2">
              <Label htmlFor="local-config-switch" className="flex flex-col space-y-1 items-start">
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
              <Label htmlFor="prompt-switch" className="flex flex-col space-y-1 items-start">
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
          </div>
        )}
        {/* Show message if initial load failed and modal is open */}
        {isOpen && !isLoading && !editedSettings && !error && <p>Could not load settings.</p>}
      </div>
    </Modal>
  );
};

export default SettingsModal; 