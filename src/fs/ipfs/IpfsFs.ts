import type { StatsBase } from 'fs';
import { Readable } from 'stream';
import type CID from 'cids';
import type { IPFS } from 'ipfs';
import { create } from 'ipfs';
import type { SystemError } from '@solid/community-server';
import type { OpenMode, PathLike } from 'node:fs';
import type { FileHandle } from 'node:fs/promises';
import { systemErrorInvalidArgument } from '../../errors/system/SystemErrors';
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

  public async write(path: string, content: Readable|string) {
    const mfs = await this.mfs();
    return mfs.write(path, content, { create: true, mtime: new Date() });
  }

  public async read(path: string) {
    const mfs = await this.mfs();
    return Readable.from(mfs.read(path));
  }

  /**
   * Asynchronously reads the entire contents of a file.
   * @param path A absolute path of type string. If a URL, Buffer or FileHandle is provided
   * a System Error [EINVAL 22](https://man7.org/linux/man-pages/man3/errno.3.html) will be thrown.
   * @param options An object that may contain an optional flag.
   */
  public async readFile(path: PathLike | FileHandle, options?: { encoding?: BufferEncoding; flag?: OpenMode } | null): Promise<Buffer | string> {
    if (typeof path !== 'string') {
      throw systemErrorInvalidArgument(
        new Error(`The provided path parameter is of type ${typeof path}. The readFile function only supports strings.`),
        'readFile',
      );
    }

    if (!path.startsWith('/')) {
      throw systemErrorInvalidArgument(
        new Error(`Only absolute paths are supported.` +
            `The provided path ${path} does not start it the  slash character (/).` +
            `Ex. /some-root/folder`),
        'readFile',
      );
    }
    const mfs = await this.mfs();
    return new Promise((resolve, reject) => {
      const buffer: any[] = [];
      const fileStream = Readable.from(mfs.read(path));
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

  public async mkdir(path: string): Promise<void> {
    try {
      const mfs = await this.mfs();
      await mfs.mkdir(path);
    } catch (ex: unknown) {
      if ((ex as any).code && (ex as any).code === 'ERR_LOCK_EXISTS') {
        const sysError: SystemError = { ...(ex as SystemError),
          code: 'EEXIST',
          syscall: 'mkdir',
          errno: -17,
          path };
        throw sysError;
      }
    }
  }

  public async readdir(path: string): Promise<string[]> {
    const mfs = await this.mfs();
    const entries: string[] = [];
    for await (const entry of mfs.ls(path)) {
      entries.push(entry.name);
    }
    return entries;
  }

  public async rmdir(path: string): Promise<void> {
    const mfs = await this.mfs();
    return mfs.rm(path, { recursive: true });
  }

  public async unlink(path: string): Promise<void> {
    try {
      const mfs = await this.mfs();
      await mfs.rm(path);
    } catch (ex: unknown) {
      if ((ex as any).code && (ex as any).code === 'ERR_NOT_FOUND') {
        const sysError: SystemError = { ...(ex as SystemError),
          code: 'ENOENT',
          syscall: 'unlink',
          errno: -2,
          path };
        throw sysError;
      }
    }
  }
}

export interface IPFSStats extends StatsBase<number> {
  cid: CID;
}
