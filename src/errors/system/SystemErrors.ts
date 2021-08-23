import type { SystemError } from '@solid/community-server';

// https://man7.org/linux/man-pages/man3/errno.3.html
// https://docs.microsoft.com/en-us/cpp/c-runtime-library/errno-constants?view=msvc-160
// https://filippo.io/linux-syscall-table/

/**
 * Invalid argument. An invalid value was given for one of the arguments to a function.
 * For example, the value given for the origin when positioning a file pointer
 * (by means of a call to fseek) is before the beginning of the file.
 * [DocSource](https://docs.microsoft.com/en-us/cpp/c-runtime-library/errno-constants?view=msvc-160)
 *
 * @param error
 * @param syscall
 */
export function systemErrorInvalidArgument(error: Error, syscall: string): SystemError {
  const systemError: SystemError = error as SystemError;
  systemError.code = 'EINVAL';
  systemError.syscall = syscall;
  systemError.errno = 22;
  return systemError;
}

/**
 * Directory not empty.
 * @param error
 * @param syscall
 * @param path
 */
export function systemErrorNotEmptyDir(error: Error, syscall: string, path: string): SystemError {
  const systemError: SystemError = error as SystemError;
  systemError.code = 'ENOTEMPTY';
  systemError.syscall = syscall;
  systemError.errno = 39;
  systemError.path = path;
  return systemError;
}

/**
 * No such file or directory.
 * The specified file or directory does not exist or cannot be found.
 * This message can occur whenever a specified file does not exist or a component of a path does not specify an existing directory.
 * [DocSource](https://docs.microsoft.com/en-us/cpp/c-runtime-library/errno-constants?view=msvc-160)
 *
 * @param error
 * @param syscall
 * @param path
 */
export function systemErrorNotExists(error: Error, syscall: string, path: string): SystemError {
  const systemError: SystemError = error as SystemError;
  systemError.code = 'ENOENT';
  systemError.syscall = syscall;
  systemError.errno = -2;
  systemError.path = path;
  return systemError;
}

