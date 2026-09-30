import * as React from 'react';
import { cn } from '@/lib/utils';

/** A plain `<select>` styled like `Input`. Native selects (including `multiple`) are already fully
 * accessible and keyboard-operable, so this project has no reason to reach for a styled combobox. */
function NativeSelect({ className, multiple, ...props }: React.ComponentProps<'select'>) {
  return (
    <select
      data-slot="select"
      multiple={multiple}
      className={cn(
        'w-full rounded-md border border-input bg-transparent px-3 py-1 text-base shadow-xs transition-[color,box-shadow] outline-none selection:bg-primary selection:text-primary-foreground disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm dark:bg-input/30',
        multiple ? 'h-32' : 'h-9',
        'focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50',
        className,
      )}
      {...props}
    />
  );
}

export { NativeSelect };
