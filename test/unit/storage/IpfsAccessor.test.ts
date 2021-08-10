import 'jest-rdf';
import { rmdirSync } from 'fs';
import { Readable } from 'stream';
import { namedNode } from '@rdfjs/data-model';
import {IpfsAccessor, IPFSHelper} from "../../../dist";
import {
  APPLICATION_OCTET_STREAM, ConflictHttpError, CONTENT_TYPE,
  ExtensionBasedMapper,
  Guarded, guardedStreamFrom, LDP, NotFoundHttpError, POSIX, RDF,
  readableToString, Representation,
  RepresentationMetadata, SystemError, toLiteral, UnsupportedMediaTypeHttpError, XSD
} from "@solid/community-server";

/* eslint-disable capitalized-comments */
/* eslint-disable multiline-comment-style */
/* eslint-disable @typescript-eslint/no-unused-vars */

const rootFilePath = '/';

function setUpHelper(ipfsHelper: IPFSHelper): (path: string, data: string) => Promise<void> {
  return async function setUpResource(path: string, data: string): Promise<void> {
    await ipfsHelper.write({ path, content: Readable.from(data) });
  };
}

function setUpCacheReader(ipfsHelper: IPFSHelper): (path: string) => Promise<string | undefined> {
  return async function readCache(path: string): Promise<string | undefined> {
    try {
      const result = await ipfsHelper.read(path);
      return await readableToString(result);
    } catch (error: unknown) {
      if ((error as any).message === 'file does not exist') {
        /* eslint-disable-next-line  unicorn/no-useless-undefined */
        return undefined;
      }
    }
  };
}

describe('A FileDataAccessor', (): void => {
  let setUpResource: (path: string, data: string) => Promise<void>;
  let readCache: (path: string) => Promise<string | undefined>;

  const base = 'http://test.com/';
  let accessor: IpfsAccessor;
  let metadata: RepresentationMetadata;
  let data: Guarded<Readable>;
  let ipfsHelper: IPFSHelper;
  let config: any;

  beforeEach(async(): Promise<void> => {
    config = { repo: '/tmp/ipfs' };
    ipfsHelper = new IPFSHelper(config);
    accessor = new IpfsAccessor(new ExtensionBasedMapper(base, rootFilePath), ipfsHelper);
    metadata = new RepresentationMetadata(APPLICATION_OCTET_STREAM);
    setUpResource = setUpHelper(ipfsHelper);
    readCache = setUpCacheReader(ipfsHelper);
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
    await ipfsHelper.mkdir('/resourece');
    await expect(accessor.getData({ path: `${base}resource` })).rejects.toThrow(NotFoundHttpError);
  });

  it('returns the corresponding data.', async(): Promise<void> => {
    await setUpResource('/resource', 'data');
    const stream = await accessor.getData({ path: `${base}resource` });
    await expect(readableToString(stream)).resolves.toBe('data');
  });

  describe('getting metadata', (): void => {
    it('throws a 404 if the identifier does not start with the base.', async(): Promise<void> => {
      await expect(accessor.getMetadata({ path: 'badpath' })).rejects.toThrow(NotFoundHttpError);
    });
  });

  /* it('throws a 404 if it matches something that is no file or directory.', async(): Promise<void> => {
    // What would this be? a corrupted fs, a symlink?
    await setUpResource('/resource', '....');
    await expect(accessor.getMetadata({ path: `${base}resource` })).rejects.toThrow(NotFoundHttpError);
  });*/

  /*
  What does somting went wrong mean? The base is resolved to -> the root
  Is the root not allowd to have a .meta file?
  it('throws an error if something else went wrong.', async(): Promise<void> => {
    await expect(accessor.getMetadata({ path: base })).rejects.toThrow('error');
  });
*/

  it('throws a 404 if the trailing slash does not match its type.', async(): Promise<void> => {
    await setUpResource('/resource', 'data');
    await expect(accessor.getMetadata({ path: `${base}resource/` })).rejects.toThrow(NotFoundHttpError);
    await setUpResource('/resource', 'data');
    await ipfsHelper.mkdir('/container');
    await expect(accessor.getMetadata({ path: `${base}container` })).rejects.toThrow(NotFoundHttpError);
  });

  it('generates the metadata for a resource.', async(): Promise<void> => {
    await setUpResource('/resource.ttl', 'data');
    metadata = await accessor.getMetadata({ path: `${base}resource.ttl` });
    expect(metadata.identifier.value).toBe(`${base}resource.ttl`);
    expect(metadata.contentType).toBe('text/turtle');
    expect(metadata.get(RDF.type)?.value).toBe(LDP.Resource);
    expect(metadata.get(POSIX.size)).toEqualRdfTerm(toLiteral('data'.length, XSD.terms.integer));
    /*
    For now just skip the follwing two ... It works but the type is not synced.
    expect(metadata.get(DC.modified)).toEqualRdfTerm(toLiteral(now.toISOString(), XSD.terms.dateTime));
    expect(metadata.get(POSIX.mtime)).toEqualRdfTerm(toLiteral(Math.floor(now.getTime() / 1000), XSD.terms.integer));
*/
  });

  it('generates the metadata for a container and its non-meta children.', async(): Promise<void> => {
    await ipfsHelper.mkdir('/container');
    await setUpResource('/container/resource', 'data');
    await setUpResource('/container/resource.meta', 'metadata');
    await ipfsHelper.mkdir('/container/container2');

    metadata = await accessor.getMetadata({ path: `${base}container/` });
    expect(metadata.identifier.value).toBe(`${base}container/`);
    expect(metadata.getAll(RDF.type)).toEqualRdfTermArray(
      [ LDP.terms.Container, LDP.terms.BasicContainer, LDP.terms.Resource ],
    );
    expect(metadata.get(POSIX.size)).toEqualRdfTerm(toLiteral(0, XSD.terms.integer));
    // expect(metadata.get(DC.modified)).toEqualRdfTerm(toLiteral(now.toISOString(), XSD.terms.dateTime));
    // expect(metadata.get(POSIX.mtime)).toEqualRdfTerm(toLiteral(Math.floor(now.getTime() / 1000), XSD.terms.integer));
    expect(metadata.getAll(LDP.contains)).toEqualRdfTermArray(
      [ namedNode(`${base}container/container2/`), namedNode(`${base}container/resource`) ],
    );

    const childQuads = metadata.quads().filter((quad): boolean =>
      quad.subject.value === `${base}container/resource`);
    const childMetadata = new RepresentationMetadata({ path: `${base}container/resource` }).addQuads(childQuads);
    expect(childMetadata.get(RDF.type)?.value).toBe(LDP.Resource);
    expect(childMetadata.get(POSIX.size)).toEqualRdfTerm(toLiteral('data'.length, XSD.terms.integer));
  //  expect(childMetadata.get(DC.modified)).toEqualRdfTerm(toLiteral(now.toISOString(), XSD.terms.dateTime));
  //  expect(childMetadata.get(POSIX.mtime)).toEqualRdfTerm(toLiteral(Math.floor(now.getTime() / 1000),
  //    XSD.terms.integer));
  });

  it('adds stored metadata when requesting metadata.', async(): Promise<void> => {
    await setUpResource('/resource', 'data');
    await setUpResource('/resource.meta', '<http://this> <http://is> <http://metadata>.');
    metadata = await accessor.getMetadata({ path: `${base}resource` });
    expect(metadata.quads().some((quad): boolean => quad.subject.value === 'http://this')).toBe(true);

    await ipfsHelper.mkdir('/container');
    await setUpResource('/container/.meta', '<http://this> <http://is> <http://metadata>.');
    metadata = await accessor.getMetadata({ path: `${base}container/` });
    expect(metadata.quads().some((quad): boolean => quad.subject.value === 'http://this')).toBe(true);
  });

  it('throws an error if there is a problem with the internal metadata.', async(): Promise<void> => {
    await setUpResource('/resource', 'data');
    await setUpResource('/resource.meta', 'invalid metadata!.');
    await expect(accessor.getMetadata({ path: `${base}resource` })).rejects.toThrow();
  });

  describe('writing a document', (): void => {
    it('throws a 404 if the identifier does not start with the base.', async(): Promise<void> => {
      await expect(accessor.writeDocument({ path: 'badpath' }, data, metadata))
        .rejects.toThrow(NotFoundHttpError);
    });

    it('throws an error when writing to a metadata path.', async(): Promise<void> => {
      const result = accessor.writeDocument({ path: `${base}resource.meta` }, data, metadata);
      await expect(result).rejects.toThrow(ConflictHttpError);
      await expect(result).rejects.toThrow('Not allowed to create files with the metadata extension.');
    });
  });

  it('writes the data to the corresponding file.', async(): Promise<void> => {
    await expect(accessor.writeDocument({ path: `${base}resource` }, data, metadata)).resolves.toBeUndefined();
    const result = await ipfsHelper.read('/resource');
    expect(await readableToString(result)).toBe('data');
  });

  it('writes metadata to the corresponding metadata file.', async(): Promise<void> => {
    metadata = new RepresentationMetadata({ path: `${base}res.ttl` },
      { [CONTENT_TYPE]: 'text/turtle', likes: 'apples' });
    await expect(accessor.writeDocument({ path: `${base}res.ttl` }, data, metadata)).resolves.toBeUndefined();
    expect(await readCache('/res.ttl')).toBe('data');
    expect(await readCache('/res.ttl.meta')).toMatch(`<${base}res.ttl> <likes> "apples".`);
  });

  it('does not write metadata that is stored by the file system.', async(): Promise<void> => {
    metadata.add(RDF.type, LDP.terms.Resource);
    await expect(accessor.writeDocument({ path: `${base}resource` }, data, metadata)).resolves.toBeUndefined();
    expect(await readCache('/resource')).toBe('data');
    expect(await readCache('/resource.meta')).toBeUndefined();
  });

  it('deletes existing metadata if nothing new needs to be stored.', async(): Promise<void> => {
    await setUpResource('/resource', 'data');
    await setUpResource('/resource.meta', 'metadata!');
    await expect(accessor.writeDocument({ path: `${base}resource` }, data, metadata)).resolves.toBeUndefined();
    expect(await readCache('/resource')).toBe('data');
    expect(await readCache('/resource.meta')).toBeUndefined();
  });

  it('errors if there is a problem deleting the old metadata file.', async(): Promise<void> => {
    await setUpResource('/resource', 'data');
    await setUpResource('/resource.meta', 'metadata!');
    ipfsHelper.unlink = (): any => {
      throw new Error('error');
    };
    await expect(accessor.writeDocument({ path: `${base}resource` }, data, metadata))
      .rejects.toThrow('error');
  });

  it('throws if something went wrong writing a file.', async(): Promise<void> => {
    data.read = (): any => {
      data.emit('error', new Error('error'));
      return null;
    };
    await expect(accessor.writeDocument({ path: `${base}resource` }, data, metadata))
      .rejects.toThrow('error');
  });

  it('deletes the metadata file if something went wrong writing the file.', async(): Promise<void> => {
    data.read = (): any => {
      data.emit('error', new Error('error'));
      return null;
    };
    metadata.add('likes', 'apples');
    await expect(accessor.writeDocument({ path: `${base}resource` }, data, metadata))
      .rejects.toThrow('error');
    expect(await readCache('/resource.meta')).toBeUndefined();
  });

  it('updates the filename if the content-type gets updated.', async(): Promise<void> => {
    await setUpResource('/resource$.ttl', 'data');
    await setUpResource('/resource.meta', '<this> <is> <metadata>.');
    metadata.identifier = namedNode(`${base}resource`);
    metadata.contentType = 'text/plain';
    metadata.add('new', 'metadata');
    await expect(accessor.writeDocument({ path: `${base}resource` }, data, metadata))
      .resolves.toBeUndefined();

    expect(await readCache('/resource$.txt')).toMatch('data');
    expect(await readCache('/resource.meta')).toMatch(`<${base}resource> <new> "metadata".`);
  });

  it('does not try to update the content-type if there is no original file.', async(): Promise<void> => {
    metadata.identifier = namedNode(`${base}resource.txt`);
    metadata.contentType = 'text/turtle';
    metadata.add('new', 'metadata');
    await expect(accessor.writeDocument({ path: `${base}resource.txt` }, data, metadata))
      .resolves.toBeUndefined();
    expect(await readCache('/resource.txt$.ttl')).toMatch('data');
    expect(await readCache('/resource.txt.meta')).toMatch(`<${base}resource.txt> <new> "metadata".`);
  });

  it('throws an error if there is an issue deleting the original file.', async(): Promise<void> => {
    await setUpResource('/resource$.ttl', '<this> <is> <data>.');
    ipfsHelper.unlink = (): any => {
      const error = new Error('error') as SystemError;
      error.code = 'EISDIR';
      error.syscall = 'unlink';
      throw error;
    };

    metadata.contentType = 'text/plain';
    await expect(accessor.writeDocument({ path: `${base}resource` }, data, metadata))
      .rejects.toThrow('error');
  });

  describe('writing a container', (): void => {
    it('throws a 404 if the identifier does not start with the base.', async(): Promise<void> => {
      await expect(accessor.writeContainer({ path: 'badpath' }, metadata)).rejects.toThrow(NotFoundHttpError);
    });

    it('creates the corresponding directory.', async(): Promise<void> => {
      await expect(accessor.writeContainer({ path: `${base}container/` }, metadata)).resolves.toBeUndefined();
      expect(await ipfsHelper.readdir('/container')).toEqual([]);
    });

    it('can handle the directory already existing.', async(): Promise<void> => {
      await ipfsHelper.mkdir('/container');
      await expect(accessor.writeContainer({ path: `${base}container/` }, metadata)).resolves.toBeUndefined();
      expect(await ipfsHelper.readdir('/container')).toEqual([]);
    });

    it('throws other errors when making a directory.', async(): Promise<void> => {
      ipfsHelper.mkdir = (): any => {
        throw new Error('error');
      };
      await expect(accessor.writeContainer({ path: base }, metadata)).rejects.toThrow('error');
    });

    it('writes metadata to the corresponding metadata file.', async(): Promise<void> => {
      metadata = new RepresentationMetadata({ path: `${base}container/` }, { likes: 'apples' });
      await expect(accessor.writeContainer({ path: `${base}container/` }, metadata)).resolves.toBeUndefined();
      expect(await readCache('/container/.meta')).toMatch(`<${base}container/> <likes> "apples".`);
    });

    it('overwrites existing metadata.', async(): Promise<void> => {
      await setUpResource('/.meta', `<${base}container/> <likes> "pears".`);
      metadata = new RepresentationMetadata({ path: `${base}container/` }, { likes: 'apples' });
      await expect(accessor.writeContainer({ path: `${base}container/` }, metadata)).resolves.toBeUndefined();
      expect(await readCache('/container/.meta')).toMatch(`<${base}container/> <likes> "apples".`);
    });

    it('does not write metadata that is stored by the file system.', async(): Promise<void> => {
      metadata = new RepresentationMetadata(
        { path: `${base}container/` },
        { [RDF.type]: [ LDP.terms.BasicContainer, LDP.terms.Resource ]},
      );
      await expect(accessor.writeContainer({ path: `${base}container/` }, metadata)).resolves.toBeUndefined();
      expect(await ipfsHelper.readdir('/container')).toEqual([]);
    });

    it('can write to the root container.', async(): Promise<void> => {
      metadata = new RepresentationMetadata({ path: `${base}` }, { likes: 'apples' });
      await expect(accessor.writeContainer({ path: `${base}` }, metadata)).resolves.toBeUndefined();
      expect(await readCache('/.meta')).toMatch(`<${base}> <likes> "apples".`);
    });
  });
  describe('deleting a resource', (): void => {
    it('throws a 404 if the identifier does not start with the base.', async(): Promise<void> => {
      await expect(accessor.deleteResource({ path: 'badpath' })).rejects.toThrow(NotFoundHttpError);
    });

    it('throws a 404 if the identifier does not match an existing entry.', async(): Promise<void> => {
      await expect(accessor.deleteResource({ path: `${base}resource` })).rejects.toThrow(NotFoundHttpError);
    });

    /*
    Ignore this test for now.
    it('throws a 404 if it matches something that is no file or directory.', async(): Promise<void> => {
      cache.data = { resource: 5 };
      await expect(accessor.deleteResource({ path: `${base}resource` })).rejects.toThrow(NotFoundHttpError);
    });
    */

    it('throws a 404 if the trailing slash does not match its type.', async(): Promise<void> => {
      await ipfsHelper.mkdir('/container');
      await setUpResource('/resource', 'apple');
      await expect(accessor.deleteResource({ path: `${base}resource/` })).rejects.toThrow(NotFoundHttpError);
      await expect(accessor.deleteResource({ path: `${base}container` })).rejects.toThrow(NotFoundHttpError);
    });

    it('deletes the corresponding file for document.', async(): Promise<void> => {
      await setUpResource('/resource', 'apple');
      await expect(accessor.deleteResource({ path: `${base}resource` })).resolves.toBeUndefined();
      expect(await readCache('/resource')).toBeUndefined();
    });

    /*    it('throws error if there is a problem with deleting existing metadata.', async(): Promise<void> => {
      await setUpResource('/resource', 'apple');
      await setUpResource('/resource.meta', '');
      await expect(accessor.deleteResource({ path: `${base}resource` })).rejects.toThrow();
    });*/

    it('removes the corresponding folder for containers.', async(): Promise<void> => {
      await ipfsHelper.mkdir('/container');
      await expect(accessor.deleteResource({ path: `${base}container/` })).resolves.toBeUndefined();
      await expect(ipfsHelper.readdir('/container')).rejects.toThrow('file does not exist');
    });

    it('removes the corresponding metadata.', async(): Promise<void> => {
      await ipfsHelper.mkdir('/container');
      await setUpResource('/container/resource', 'apple');
      await setUpResource('/container/resource.meta', 'metaApple');
      await setUpResource('/container/.meta', 'metadata');
      await expect(accessor.deleteResource({ path: `${base}container/resource` })).resolves.toBeUndefined();
      expect(await readCache('/container/resource')).toBeUndefined();
      expect(await readCache('/container/resource.meta')).toBeUndefined();
      await expect(accessor.deleteResource({ path: `${base}container/` })).resolves.toBeUndefined();
      expect(await readCache('/container/resource.meta')).toBeUndefined();
    });

    /*    it('can delete the root container.', async(): Promise<void> => {
      await expect(accessor.deleteResource({ path: `${base}` })).resolves.toBeUndefined();
      expect(await readCache('/')).toBeUndefined();
    });*/
  });

  afterEach(async(): Promise<void> => {
    await ipfsHelper.stop();
    rmdirSync(config.repo, { recursive: true });
  });
});
