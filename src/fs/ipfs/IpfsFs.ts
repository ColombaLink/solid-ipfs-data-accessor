import type { Dirent, StatsBase } from 'fs';
import { Readable } from 'stream';
import type CID from 'cids';
import type { IPFS } from 'ipfs';
import { create } from 'ipfs';
import type { SystemError } from '@solid/community-server';
import type { BaseEncodingOptions, OpenMode, PathLike, Mode, MakeDirectoryOptions, Dir, OpenDirOptions, RmDirOptions } from 'node:fs';

import type { FileHandle } from 'node:fs/promises';
import {
  systemErrorInvalidArgument,
  systemErrorNotEmptyDir,
  systemErrorNotExists,
} from '../../errors/system/SystemErrors';

/* eslint-disable @typescript-eslint/explicit-function-return-type */
/* eslint-disable @typescript-eslint/naming-convention */

export class IpfsFs {
  private readonly node: Promise<IPFS>;

  public constructor(options: { repo: string }) {
    // (options as any).config = {
    // Bootstrap: [ '/ip4/127.0.0.1/tcp/4002/ipfs/Qmd6r6juE6UAx1TCZUdF9Csz4T9BAJqUgGHT93uGY1ypCk' ],
    // Addresses: {
    //     API: '/ip4/127.0.0.1/tcp/5003',
    //     Gateway: '/ip4/127.0.0.1/tcp/8083',
    //
    // },
    // };
    // // eslint-disable-next-line no-console
    // console.log(options);
    this.node = create(options);
  }

  /**
   * Asynchronously writes data to a file, replacing the file if it already exists.
   * It is unsafe to call `fsPromises.writeFile()` multiple times on the same file without waiting for the `Promise` to be resolved (or rejected).
   * @param path A absolute path of type string. If a URL, Buffer or FileHandle is provided
   * a System Error [EINVAL 22](https://man7.org/linux/man-pages/man3/errno.3.html) will be thrown.
   * @param data The data to write. If something other than a `Buffer` or `Uint8Array` is provided, the value is coerced to a string.
   * @param options Either the encoding for the file, or an object optionally specifying the encoding, file mode, and flag.
   * If `encoding` is not supplied, the default of `'utf8'` is used.
   * If `mode` is not supplied, the default of `0o666` is used.
   * If `mode` is a string, it is parsed as an octal integer.
   * If `flag` is supplied, it will be ignored.
   */
  public async writeFile(
    path: PathLike | FileHandle,
    data: string | Uint8Array,
    options?: BaseEncodingOptions & { mode?: Mode; flag?: OpenMode } | BufferEncoding | null,
  ): Promise<void> {
    this.assertIsString(path);
    this.assertIsAbsolute(path as string);

    let encoding: BufferEncoding = 'utf8';
    if (options) {
      if (typeof options === 'string') {
        encoding = options;
      } else if ((options as BaseEncodingOptions).encoding) {
        encoding = (options as BaseEncodingOptions).encoding!;
      }
    }
    if (typeof data === 'string') {
      data = Buffer.from(data, encoding);
    }

    let mode: Mode = '0o666';
    if (options && (options as { mode: Mode }).mode) {
      // eslint-disable-next-line prefer-destructuring
      mode = (options as { mode: Mode }).mode;
    }
    const mfs = await this.mfs();
    return mfs.write(
      path as string,
      data,
      { create: true,
        mtime: new Date(),
        mode },
    );
  }

  /**
   * Asynchronously reads the entire contents of a file.
   * @param path A absolute path of type string. If a URL, Buffer or FileHandle is provided
   * a System Error [EINVAL 22](https://man7.org/linux/man-pages/man3/errno.3.html) will be thrown.
   * @param options An object that may contain an optional flag.
   */
  public async readFile(path: PathLike | FileHandle, options?: { encoding?: BufferEncoding; flag?: OpenMode } | null): Promise<Buffer | string> {
    this.assertIsString(path);
    this.assertIsAbsolute(path as string);
    const mfs = await this.mfs();
    return new Promise((resolve, reject) => {
      const buffer: any[] = [];
      const fileStream = Readable.from(mfs.read(path as string));
      fileStream.on('data', chunk => buffer.push(chunk));
      fileStream.on('end', () => {
        const resultBuffer = Buffer.concat(buffer);
        if (options && options.encoding) {
          resolve(resultBuffer.toString(options.encoding));
        } else {
          resolve(resultBuffer);
        }
      });
      fileStream.on('error', err => reject(err));
    });
  }

  private assertIsString(path: PathLike | FileHandle) {
    if (typeof path !== 'string') {
      throw systemErrorInvalidArgument(
        new Error(`The provided path parameter is of type ${typeof path}. The readFile function only supports strings.`),
        'readFile',
      );
    }
  }

  private assertIsAbsolute(path: string) {
    if (!path.startsWith('/')) {
      throw systemErrorInvalidArgument(
        new Error(`Only absolute paths are supported.` +
              `The provided path ${path} does not start it the  slash character (/).` +
              `Ex. /some-root/folder`),
        'readFile',
      );
    }
  }

  public async stop() {
    return (await this.node).stop();
  }

  public async stats(path: string) {
    return (await this.mfs()).stat(path);
  }

  private async mfs() {
    return (await this.node).files;
  }

  public async lstat(path: string): Promise<IPFSStats> {
    try {
      const mfs = await this.mfs();
      const stats = await mfs.stat(path);

      if (stats.mode) {
        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        // @ts-expect-error
        return {
          isDirectory: (): boolean => stats.type === 'directory',
          isFile: (): boolean => stats.type === 'file',
          mode: stats.mode,
          // I dont know yet why the date is not set by mfs.stat(x)
          // eslint-disable-next-line no-mixed-operators
          mtime: stats.mtime ? new Date(stats.mtime.secs * 1_000 + stats.mtime.nsecs / 1_000) : new Date(),
          size: stats.size,
          cid: stats.cid,
        };
      }
      throw new Error('error');
    } catch (ex: unknown) {
      if ((ex as any).code && (ex as any).code === 'ERR_NOT_FOUND') {
        const sysError: SystemError = { ...(ex as SystemError),
          code: 'ENOENT',
          syscall: 'stat',
          errno: -2,
          path };
        throw sysError;
      }
      throw ex;
    }
  }

  /**
   * Asynchronous mkdir(2) - create a directory.
   * @param path A absolute path of type string. If a URL, Buffer or FileHandle is provided
   * a System Error [EINVAL 22](https://man7.org/linux/man-pages/man3/errno.3.html) will be thrown.
   * @param options Either the file mode, or an object optionally specifying the file mode and whether parent folders
   * should be created. If a string is passed, it is parsed as an octal integer. If not specified, defaults to `0o777`.
   */
  public async mkdir(path: PathLike, options?: Mode | (MakeDirectoryOptions & { recursive?: boolean }) | null): Promise<void | (undefined | string)> {
    const createDirectory = async(dir: string, mode: Mode) => {
      try {
        const mfs = await this.mfs();
        await mfs.mkdir(dir, { mode });
      } catch (ex: unknown) {
        if ((ex as any).code && (ex as any).code === 'ERR_LOCK_EXISTS') {
          const sysError: SystemError = { ...(ex as SystemError),
            code: 'EEXIST',
            syscall: 'mkdir',
            errno: -17,
            path: dir };
          throw sysError;
        }
      }
    };
    this.assertIsString(path);
    this.assertIsAbsolute(path as string);

    let mode: Mode = '0o666';
    if (options && (options as { mode: Mode }).mode) {
      // eslint-disable-next-line prefer-destructuring
      mode = (options as { mode: Mode }).mode;
    } else if (typeof options === 'string' || typeof options === 'number') {
      mode = options;
    }

    if (options && (options as { recursive: boolean }).recursive) {
      // Find out which is the first non existing directory of a recursive mkdir call.
      // The dir will be returned if the "recursive" option is set.
      const notExistingDirs = await this.getAllNonExistingPaths(path as string);
      if (notExistingDirs.length === 0) {
        return;
      }
      for (const dir of notExistingDirs) {
        await createDirectory(dir, mode);
      }
      return notExistingDirs[0];
    }

    await createDirectory(path as string, mode);
  }

  /**
   * @param path A absolute path of type string. (starts with /)
   * @private
   * @return returns the first non existing directory
   *                 or undefined if all directories exist.
   */
  private async getAllNonExistingPaths(path: string): Promise<string[]> {
    let dir = '';
    const paths = [];
    let previousStat = null;
    let foundFirstNonExistingDirectory = false;
    for (const part of path.slice(1).split('/')) {
      dir = `${dir}/${part}`;
      if (foundFirstNonExistingDirectory) {
        paths.push(dir);
        continue;
      }

      const stats = await this.stats(dir).catch(error => {
        if (error.code === 'ERR_NOT_FOUND') {
          return null;
        }
        throw error;
      });

      if (previousStat === null && stats === null) {
        paths.push(dir);
      } else if (previousStat && stats === null) {
        foundFirstNonExistingDirectory = true;
        paths.push(dir);
      }
      previousStat = stats;
    }

    return paths;
  }

  public async readdir(path: string): Promise<string[]> {
    const mfs = await this.mfs();
    const entries: string[] = [];
    for await (const entry of mfs.ls(path)) {
      entries.push(entry.name);
    }
    return entries;
  }

  private async * readDirent(path: string): AsyncIterableIterator<Dirent> {
    const mfs = await this.mfs();
    for await (const entry of mfs.ls(path)) {
      yield {
        name: entry.name,
        isDirectory: () => entry.type === 'directory',
        isFile: () => entry.type === 'file',
        isBlockDevice: () => false,
        isCharacterDevice: () => false,
        isFIFO: () => false,
        isSocket: () => false,
        isSymbolicLink: () => false,
      };
    }
  }

  /**
   * Asynchronously open a directory.
   * See the POSIX [opendir(3)](https://man7.org/linux/man-pages/man3/opendir.3.html) documentation for more details.
   * @param path
   * @param options
   *  Creates an <fs.Dir>, which contains all further functions for reading from and cleaning up the directory.
   *  The encoding option sets the encoding for the path while opening the directory and subsequent read operations.
   *  The buffer size option is ignored currently.
   */
  public async opendir(path: string | Buffer | URL, options?: OpenDirOptions): Promise<Dir> {
    let dirPath = '';
    if (typeof path === 'string') {
      dirPath = path;
    } else if (path instanceof Buffer) {
      dirPath = path.toString(options?.encoding ? options?.encoding : 'utf8');
    } else if (path instanceof URL) {
      throw systemErrorInvalidArgument(
        new Error(`The provided URL path type is not supported. Only string and buffer paths are supported. `),
        'opendir',
      );
    }
    // Todo [2021-12-31]: decide what to do with functions: close, closeSync, ...
    return {
      [Symbol.asyncIterator]: () => this.readDirent(dirPath),
      async close(): Promise<void> {
        throw new Error('Not Implemented.');
      },
      closeSync() {
        throw new Error('Not Implemented.');
      },
      path: dirPath,
      async read(): Promise<Dirent | null> {
        throw new Error('Not Implemented.');
      },
      readSync(): Dirent | null {
        throw new Error('Not Implemented.');
      },
    };
  }

  /**
   * Asynchronous rmdir(2) - delete a directory.
   * @param path A absolute path of type string. (starts with /)
   *
   *  The recursive option  for the mfs and node.js filesystem have a slightly
   *  different semantics. If the recursive option is not set for
   *  the *node.js fs* and the directory is not empty the method will throw an error.
   *  In comparison the mfs requires the recursive option to be true if a directory
   *  should be deleted. Since the rmdir method will always delete a directory the implementation
   *  sets the recursive option to true while calling the mfs.rm method.
   *   But to mimic the same behavior as the node.js fs the rmdir method first
   *  checks if the directory is empty or the recursive option set to true.
   * If both conditions are false an error is thrown.
  */
  public async rmdir(path: PathLike, options?: RmDirOptions): Promise<void> {
    this.assertIsString(path);
    this.assertIsAbsolute(path as string);
    const mfs = await this.mfs();
    if (!options) {
      options = { maxRetries: 1 };
    }

    if (!options.recursive) {
      // Recursive option is not set, so check if dir is empty
      // eslint-disable-next-line no-unreachable-loop,@typescript-eslint/no-unused-vars,no-unused-vars
      for await (const _ of await this.opendir(path)) {
        throw systemErrorNotEmptyDir(
          new Error(
            `The directory ${typeof path} is not empty. ` +
              `Consider using the recursive option to delete a non empty directory ex. (path, {recursive: true})`,
          ),
          'rmdir',
          path as string,
        );
      }
    }

    const tryRmdir = async(tryCount: number): Promise<void> => {
      if (tryCount < (options as { maxRetries: number }).maxRetries) {
        tryCount += 1;
        try {
          return await mfs.rm(path as string, { recursive: true });
        } catch (error: unknown) {
          if (tryCount < (options as { maxRetries: number }).maxRetries && options?.retryDelay) {
            await new Promise(resolve => setTimeout(resolve, options?.retryDelay));
            return tryRmdir(tryCount);
          }
          throw error;
        }
      }
    };
    return tryRmdir(0);
  }

  /**
   * Asynchronous unlink(2) - delete a name and possibly the file it refers to.
   * @param path A path to a file.
   */
  public async unlink(path: PathLike): Promise<void> {
    this.assertIsString(path);
    this.assertIsAbsolute(path as string);

    try {
      const mfs = await this.mfs();
      await mfs.rm(path as string);
    } catch (ex: unknown) {
      if ((ex as any).code && (ex as any).code === 'ERR_NOT_FOUND') {
        throw systemErrorNotExists(
          new Error(
            `The file with the provided file path ${path} does not exist.`,
          ),
          'unlink',
          path as string,
        );
      }
    }
  }
}

export interface IPFSStats extends StatsBase<number> {
  cid: CID;
}
