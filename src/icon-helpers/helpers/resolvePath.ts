// import { join } from 'node:path';
// import { join } from '@tauri-apps/api/path';
import { join, appDataDir } from '@tauri-apps/api/path';

/**
 * Resolves a sequence of path segments into an absolute path.
 *
 * @param paths - A list of path segments to be joined and resolved relative to the module's root directory.
 * @returns The resolved absolute path as a string.
 */
export const resolvePath = async (...paths: string[]): Promise<string> => {
  const appDataDirPath = await appDataDir();
  return join(appDataDirPath, '..', '..', ...paths);
};
