import type { SystemError } from '@solid/community-server';

// https://man7.org/linux/man-pages/man3/errno.3.html
// https://docs.microsoft.com/en-us/cpp/c-runtime-library/errno-constants?view=msvc-160
// https://filippo.io/linux-syscall-table/

/**
 *
 * @constructor
 */
export function systemErrorInvalidArgument(error: Error, syscall: string): SystemError {
  return { ...error,
    code: 'ENOENT',
    syscall,
    errno: 22 };
}
