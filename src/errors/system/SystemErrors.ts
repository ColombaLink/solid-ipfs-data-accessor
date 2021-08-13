import type { SystemError } from '@solid/community-server';

// https://man7.org/linux/man-pages/man3/errno.3.html
// https://docs.microsoft.com/en-us/cpp/c-runtime-library/errno-constants?view=msvc-160
// https://filippo.io/linux-syscall-table/

/**
 *
 * @constructor
 */
export function systemErrorInvalidArgument(error: Error, syscall: string): SystemError {
  const systemError: SystemError = error as SystemError;
  systemError.code = 'ENOENT';
  systemError.syscall = syscall;
  systemError.errno = 22;
  return systemError;
}

export function systemErrorNotEmptyDir(error: Error, syscall: string, path:string): SystemError {
  const systemError: SystemError = error as SystemError;
  systemError.code = 'ENOTEMPTY';
  systemError.syscall = syscall;
  systemError.errno = -39;
  systemError.path = path;
  return systemError;
}
