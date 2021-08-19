import 'jest-rdf';
import { rmdirSync } from 'fs';
import { Readable } from 'stream';
import {
  APPLICATION_OCTET_STREAM, DataAccessor,
  ExtensionBasedMapper,
  Guarded, guardedStreamFrom, NotFoundHttpError, readableToString,
  Representation,
  RepresentationMetadata, UnsupportedMediaTypeHttpError,
} from "@solid/community-server";
import {BinaryDataAccessor, IpfsFs} from "../../../dist";
import {IpfsDataAccessor} from "../../../src/storage/IpfsDataAccessor";

/* eslint-disable capitalized-comments */
/* eslint-disable multiline-comment-style */
/* eslint-disable @typescript-eslint/no-unused-vars */

const rootFilePath = '/';


describe('A FileDataAccessor', (): void => {
  let setUpResource: (path: string, data: string) => Promise<void>;
  let readCache: (path: string) => Promise<string | undefined>;

  const base = 'http://test.com/';
  let metadata: RepresentationMetadata;
  let data: Guarded<Readable>;
  let config: any;
  let fsPromises: IpfsFs
  let accessor: DataAccessor

  beforeEach(async(): Promise<void> => {
    config = { repo: '/tmp/ipfs' };
    fsPromises = new IpfsFs(config);
    accessor = new IpfsDataAccessor(new ExtensionBasedMapper(base, rootFilePath), fsPromises);
    metadata = new RepresentationMetadata(APPLICATION_OCTET_STREAM);
    data = guardedStreamFrom([ 'data' ]);
  });

  it('can only handle binary data.', async(): Promise<void> => {
    await expect(accessor.canHandle({ binary: true } as Representation)).resolves.toBeUndefined();
    const result = accessor.canHandle({ binary: false } as Representation);
    await expect(result).rejects.toThrow(UnsupportedMediaTypeHttpError);
    await expect(result).rejects.toThrow('Only binary data is supported.');
  });

  describe('getting data', (): void => {
    it('throws a 404 if the identifier does not start with the base.', async(): Promise<void> => {
      await expect(accessor.getData({ path: 'badpath' })).rejects.toThrow(NotFoundHttpError);
    });
  });

  it('throws a 404 if the identifier does not match an existing file.', async(): Promise<void> => {
    await expect(accessor.getData({ path: `${base}resource` })).rejects.toThrow(NotFoundHttpError);
  });

  it('throws a 404 if the identifier matches a directory.', async(): Promise<void> => {
    await fsPromises.mkdir('/resourece');
    await expect(accessor.getData({ path: `${base}resource` })).rejects.toThrow(NotFoundHttpError);
  });

  it('returns the corresponding data.', async(): Promise<void> => {
    await fsPromises.writeFile('/resource', 'data');
    const a = await fsPromises.readFile('/resource');

    const stream = await accessor.getData({ path: `${base}resource` });
    await expect(readableToString(stream)).resolves.toBe('data');
  });

    it('throws a 404 if the identifier does not start with the base.', async(): Promise<void> => {
      await expect(accessor.writeDocument({ path: 'badpath' }, data, metadata))
        .rejects.toThrow(NotFoundHttpError);
    });

  it('writes the data to the corresponding file.', async(): Promise<void> => {
    await expect(accessor.writeDocument({ path: `${base}resource` }, data, metadata)).resolves.toBeUndefined();
    const result = await fsPromises.readFile('/resource', {encoding: 'utf8'});
    expect(result).toBe('data');
  });



  afterEach(async(): Promise<void> => {
    await fsPromises.stop();
    rmdirSync(config.repo, { recursive: true });
  });
});
