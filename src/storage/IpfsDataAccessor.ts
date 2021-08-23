import type { Readable } from 'stream';
import type { Quad } from 'rdf-js';
import type { DataAccessor,
  FileIdentifierMapper,
  Guarded,
  ResourceIdentifier, ResourceLink,

  RepresentationMetadata } from '@solid/community-server';
import { DC,
  guardStream, isSystemError, joinFilePath, NotFoundHttpError, parseQuads, POSIX, SOLID_META, toLiteral, XSD } from '@solid/community-server';
import type { IpfsFs, IPFSStats } from '../fs/ipfs/IpfsFs';
import { BinaryDataAccessor } from './BinaryDataAccessor';

import { PassThrough } from 'stream';
import { createReadStream } from '../util/stream/CreateIpfsReadStream';
import { streamAsAsyncIterator } from '../util/stream/StreamAsAyncIterator';
import type { Stats } from 'fs';
import { IPFS } from '../Vocabularies';
import { namedNode } from '@rdfjs/data-model';

/**
 * DataAccessor that uses the Interplanetary File System to store documents as files and containers as folders.
 */
export class IpfsDataAccessor extends BinaryDataAccessor implements DataAccessor {
  public constructor(
    resourceMapper: FileIdentifierMapper,
    fsPromises: IpfsFs,
  ) {
    super(resourceMapper, fsPromises);
  }

  /**
   * Will return data stream directly to the file corresponding to the resource.
   * Will throw NotFoundHttpError if the input is a container.
   */
  public async getData(identifier: ResourceIdentifier): Promise<Guarded<Readable>> {
    const mfs = await ((this.fsPromises) as IpfsFs).mfs();
    const link = await this.resourceMapper.mapUrlToFilePath(identifier, false);
    const stats = await this.getStats(link.filePath);
    if (stats.isFile()) {
      return guardStream(createReadStream(link.filePath, mfs));
    }

    throw new NotFoundHttpError();
  }

  /**
   * Reads the metadata from the corresponding metadata file.
   * Returns an empty array if there is no metadata file.
   *
   * @param identifier - Identifier of the resource (not the metadata!).
   */
  protected async getRawMetadata(identifier: ResourceIdentifier): Promise<Quad[]> {
    try {
      const mfs = await ((this.fsPromises) as IpfsFs).mfs();
      const metadataLink = await this.resourceMapper.mapUrlToFilePath(identifier, true);

      // Check if the metadata file exists first
      await this.fsPromises.lstat(metadataLink.filePath);

      const readMetadataStream = guardStream(createReadStream(metadataLink.filePath, mfs));
      return await parseQuads(readMetadataStream, { format: metadataLink.contentType, baseIRI: identifier.path });
    } catch (error: unknown) {
      // Metadata file doesn't exist so lets keep `rawMetaData` an empty array.
      if (!isSystemError(error) || error.code !== 'ENOENT') {
        throw error;
      }
      return [];
    }
  }

  protected addAdditionalMetadata(metadata: RepresentationMetadata, childStats: IPFSStats): void {
    this.addIpfsMetadata(metadata, childStats);
  }

  /**
   * Helper function to add ipfs file system related metadata.
   * @param metadata - metadata object to add to
   * @param stats - Stats of the file/directory corresponding to the resource.
   */
  private addIpfsMetadata(metadata: RepresentationMetadata, stats: IPFSStats): void {
    metadata.add(IPFS.cid,
      toLiteral(stats.cid.toString(), namedNode('http://www.w3.org/2001/XMLSchema#string')));
  }

  /**
   * Helper function without extra validation checking to create a data file.
   * @param path - The filepath of the file to be created.
   * @param data - The data to be put in the file.
   */
  protected async writeDataFile(path: string, data: Readable): Promise<void> {
    const pass = new PassThrough();
    data.pipe(pass);
    const mfs = await (this.fsPromises as IpfsFs).mfs();
    await mfs.write(path, streamAsAsyncIterator(pass), { create: true });
  }
}
