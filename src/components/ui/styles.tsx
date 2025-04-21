// import { cn } from '@/lib/utils'
// import clsx from 'clsx'

// export const focusRing = clsx(
//   'focus:ring-[3px] ring-0',
//   'focus:border-gray-600/50 focus:ring-gray-600/30',
//   'dark:focus:border-gray-600 dark:focus:ring-gray-600/50',
//   'duration-150 transition',
//   'outline-none',
//   'focus-visible:outline-none',
// )

// export const inputTextEntryStyles = cn(
//   'flex rounded-md border border-input bg-inputBackground',
//   'text-sm font-medium',
//   'placeholder:text-muted-foreground',
//   'overflow-clip',
//   'file:border-0 file:bg-transparent file:text-sm file:font-medium',
//   'px-3 py-2',
//   'disabled:cursor-not-allowed disabled:opacity-50',
//   'w-full h-10',
// )

// export const inputStyles = cn(
//   focusRing,
//   inputTextEntryStyles,
// )

// export const textareaStyles = cn(
//   focusRing,
//   'flex rounded-md border border-input bg-inputBackground',
//   'text-sm',
//   'placeholder:text-muted-foreground',
//   'px-3 py-2',
//   'disabled:cursor-not-allowed disabled:opacity-50',
//   'w-full min-h-[80px]',
// )


import { cn } from '@/lib/utils'
import clsx from 'clsx'

export const focusRing = clsx(
  'focus:ring-[3px] ring-[0px]',
  'focus:border-gray-600/50 ring-gray-600/30',
  'dark:focus:border-gray-600 dark:ring-gray-600/50',
  'duration-150 transition',
  'outline-none',
  'focus-visible:outline-none',
)

export const inputTextEntryStyles = cn(
  'flex rounded-md border border-input bg-inputBackground',
  'text-sm font-medium',
  'placeholder:text-muted-foreground',
  'overflow-clip',
  'file:border-0 file:bg-transparent file:text-sm file:font-medium',
  'px-3 py-2',
  'disabled:cursor-not-allowed disabled:opacity-50',
  'w-full h-10',
)

export const inputStyles = cn(
  focusRing,
  'rounded-md border border-input-border bg-input-bg text-text p-2 text-sm',
  // inputTextEntryStyles,
)
