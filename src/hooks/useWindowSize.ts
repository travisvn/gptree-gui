import { useState, useEffect } from 'react';
// Attempting import via Window class
import { Window, LogicalSize, getCurrentWindow } from '@tauri-apps/api/window';
import { useDebounce } from './useDebounce';
import { TauriEvent } from '@tauri-apps/api/event';

interface WindowSize {
  width: number;
  height: number;
}

/**
 * Hook to get the current window size using Tauri API, with debouncing.
 * @param debounceDelay Delay in ms to debounce size updates (default: 200ms)
 * @returns Object containing the debounced window width and height.
 */
export function useWindowSize(debounceDelay: number = 200): WindowSize {
  // State to hold the *immediate* size from the event listener
  const [size, setSize] = useState<WindowSize>({ width: 0, height: 0 });

  // Debounce the size state
  const debouncedSize = useDebounce(size, debounceDelay);

  useEffect(() => {
    let unlisten: (() => void) | null = null;

    const getSizeAndListen = async () => {
      try {
        const appWindow = getCurrentWindow();

        // Get main window instance by label, awaiting the promise
        // const mainWindow = await Window.getByLabel('main');
        // if (!mainWindow) {
        //   throw new Error("Main window not found");
        // }

        // Get initial size
        // const initialSize = await appWindow.innerSize();
        // setSize({ width: initialSize.width, height: initialSize.height });


        const factor = await appWindow.scaleFactor();
        const size = await appWindow.innerSize(); // PhysicalSize
        const logical = size.toLogical(factor);

        setSize({ width: logical.width, height: logical.height });

        // Listen for resize events
        unlisten = await appWindow.listen<void>(TauriEvent.WINDOW_RESIZED, async () => {
          // On resize, get the new size and update the *immediate* state
          // Re-fetch the window instance is likely not needed here, use mainWindow
          const newSize = await appWindow.innerSize(); // PhysicalSize
          const logical = newSize.toLogical(factor);

          setSize({ width: logical.width, height: logical.height });
          // setSize({ width: newSize.width, height: newSize.height });
          // Removed redundant getByLabel call inside listener
        });
      } catch (error) {
        console.error("Failed to get window size or listen for resize:", error);
        // Set a default or fallback size if needed
        setSize({ width: window.innerWidth, height: window.innerHeight });
      }
    };

    getSizeAndListen();

    // Cleanup function to remove the listener when the component unmounts
    return () => {
      if (unlisten) {
        unlisten();
      }
    };
  }, []); // Empty dependency array ensures this runs only once on mount

  // Return the *debounced* size
  return debouncedSize;
} 