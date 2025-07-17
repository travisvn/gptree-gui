import React from 'react';
import { Button } from '@/components/ui/button';
import { useUpdater } from '@/hooks/useUpdater';
import { X, Download, RotateCcw } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

export const UpdateNotification: React.FC = () => {
  const { updateInfo, isInstalling, error, installUpdate } = useUpdater();
  const [dismissed, setDismissed] = React.useState(false);

  // Don't show if updates are disabled, no update available, or dismissed
  if (!updateInfo?.available || dismissed) {
    return null;
  }

  const handleInstall = () => {
    installUpdate();
  };

  const handleDismiss = () => {
    setDismissed(true);
  };

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: -50 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -50 }}
        className="fixed top-4 right-4 z-50 max-w-sm bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 rounded-lg shadow-lg p-4"
      >
        <div className="flex items-start justify-between">
          <div className="flex-1 pr-2">
            <h3 className="text-sm font-medium text-blue-900 dark:text-blue-100">
              Update Available
            </h3>
            <p className="text-xs text-blue-700 dark:text-blue-300 mt-1">
              Version {updateInfo.version} is ready to install
            </p>
            {error && (
              <p className="text-xs text-red-600 dark:text-red-400 mt-1">
                {error}
              </p>
            )}
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleDismiss}
            className="h-6 w-6 p-0 text-blue-500 hover:text-blue-700"
          >
            <X size={12} />
          </Button>
        </div>
        
        <div className="flex gap-2 mt-3">
          <Button
            size="sm"
            onClick={handleInstall}
            disabled={isInstalling}
            className="bg-blue-600 hover:bg-blue-700 text-white text-xs px-3 py-1 h-7"
          >
            {isInstalling ? (
              <>
                <RotateCcw size={12} className="mr-1 animate-spin" />
                Installing...
              </>
            ) : (
              <>
                <Download size={12} className="mr-1" />
                Install & Restart
              </>
            )}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleDismiss}
            className="text-xs px-3 py-1 h-7"
          >
            Later
          </Button>
        </div>
      </motion.div>
    </AnimatePresence>
  );
};