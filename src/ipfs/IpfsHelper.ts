import type { StatsBase } from 'fs';
import { Readable } from 'stream';
import type CID from 'cids';
import { create } from 'ipfs';
import type { IPFS } from 'ipfs';
import type { SystemError } from '@solid/community-server';
/* eslint-disable @typescript-eslint/explicit-function-return-type */
/* eslint-disable @typescript-eslint/naming-convention */

export class IPFSHelper {
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

  public async write(file: { path: string; content: Readable }) {
    // eslint-disable-next-line no-console
    console.log(file.path);
    const mfs = await this.mfs();
    return mfs.write(file.path, file.content, { create: true, mtime: new Date() });
  }

  public async read(path: string) {
    const mfs = await this.mfs();
    return Readable.from(mfs.read(path));
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

