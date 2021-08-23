import type { PassThrough } from 'stream';

export async function * streamAsAsyncIterator(stream: PassThrough): AsyncIterableIterator<Uint8Array> {
  for await (const chunk of stream) {
    yield new Uint8Array(chunk);
  }
}
