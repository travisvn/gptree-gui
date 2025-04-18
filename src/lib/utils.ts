import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Truncates a path string from the start if it exceeds maxLength.
 * Prioritizes showing the full final segment (file/directory name).
 * Example: /very/long/path/to/file.txt -> .../path/to/file.txt
 */
export const truncatePathStart = (path: string | null | undefined, maxLength: number): string => {
  if (!path) {
    return '';
  }

  if (path.length <= maxLength) {
    return path;
  }

  const separator = '/';
  const lastSeparatorIndex = path.lastIndexOf(separator);

  // Case 1: No separator found, or it's just the root '/'
  if (lastSeparatorIndex <= 0) {
    // Show ellipsis and the end of the string
    if (maxLength < 4) return "..."; // Handle impossible truncation
    return "..." + path.slice(-(maxLength - 3));
  }

  // Case 2: Separator found
  const lastPart = path.substring(lastSeparatorIndex + 1);

  // If "...<lastPart>" is already too long, just show that.
  // Ensures the full last part is always visible, even if it exceeds maxLength.
  if (lastPart.length + 3 >= maxLength) {
    return "..." + lastPart;
  }

  // Calculate remaining length for the part before the last segment's separator
  const remainingLength = maxLength - lastPart.length - 1; // -1 for the '/'

  // Get the part before the last separator
  const firstPart = path.substring(0, lastSeparatorIndex);

  // Calculate how much of the *end* of the firstPart we need show after "..."
  const neededFirstPartLength = remainingLength - 3; // -3 for "..."

  if (neededFirstPartLength <= 0) {
    // Not enough space even for "..." before the slash and last part
    return "..." + lastPart; // Fallback
  }

  // Extract the end portion of the first part
  const displayFirstPart = firstPart.slice(-neededFirstPartLength);

  return "..." + displayFirstPart + separator + lastPart;
};
