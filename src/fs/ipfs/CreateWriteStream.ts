import { Readable } from 'stream';
import type { PassThrough } from 'stream';

export async function * streamAsAsyncIterator(stream: PassThrough): AsyncIterableIterator<Uint8Array> {
  for await (const chunk of stream) {
    yield new Uint8Array(chunk);
  }
}
export function createReadStream(path: string, mfs: any): Readable {
  const stream = new Readable();
  // eslint-disable-next-line no-underscore-dangle,@typescript-eslint/no-empty-function
  stream._read = (): void => {};
  const read = async(): Promise<void> => {
    for await (const chunk of mfs.read(path)) {
      stream.push(chunk);
    }
    stream.push(null);
  };
  const prom = read();
  prom.catch((error): void => stream.destroy(error));
  return stream;
}
