import type { Readable } from 'stream';
import { literal } from '@rdfjs/data-model';
import { DataFactory } from 'n3';
import type { NamedNode, Quad } from 'rdf-js';
import type {
  DataAccessor,
  FileIdentifierMapper, Guarded,
  Representation, ResourceIdentifier, ResourceLink,
} from '@solid/community-server';
import {
  ConflictHttpError,
  CONTENT_TYPE, DC,
  guardStream,
  isContainerIdentifier,
  isSystemError, joinFilePath, LDP,
  NotFoundHttpError, parseQuads, POSIX, RDF,
  RepresentationMetadata, serializeQuads, toLiteral,
  UnsupportedMediaTypeHttpError, XSD,
} from '@solid/community-server';
import type { IPFSHelper, IPFSStats } from '../ipfs/IpfsHelper';
import { IPFS } from '../Vocabularies';
import { addResourceMetadata } from '@solid/community-server/dist/util/ResourceUtil';

/**
 * DataAccessor that uses the file system to store documents as files and containers as folders.
 */
export class IpfsAccessor implements DataAccessor {
  private readonly resourceMapper: FileIdentifierMapper;
  private readonly ipfsHelper: IPFSHelper;
  public constructor(resourceMapper: FileIdentifierMapper, ipfsHelper: IPFSHelper) {
    this.resourceMapper = resourceMapper;
    this.ipfsHelper = ipfsHelper;
  }

  /**
   * Only binary data can be directly stored as files so will error on non-binary data.
   */
  public async canHandle(representation: Representation): Promise<void> {
    if (!representation.binary) {
      throw new UnsupportedMediaTypeHttpError('Only binary data is supported.');
    }
  }

  /**
   * Will return data stream directly to the file corresponding to the resource.
   * Will throw NotFoundHttpError if the input is a container.
   */
  public async getData(identifier: ResourceIdentifier): Promise<Guarded<Readable>> {
    const link = await this.resourceMapper.mapUrlToFilePath(identifier);
    const stats = await this.getStats(link.filePath);

    if (stats.isFile()) {
      return guardStream(await this.ipfsHelper.read(link.filePath));
    }

    throw new NotFoundHttpError();
  }

  /**
   * Will return corresponding metadata by reading the metadata file (if it exists)
   * and adding file system specific metadata elements.
   */
  public async getMetadata(identifier: ResourceIdentifier): Promise<RepresentationMetadata> {
    const link = await this.resourceMapper.mapUrlToFilePath(identifier);
    const stats = await this.getStats(link.filePath);
    if (!isContainerIdentifier(identifier) && stats.isFile()) {
      return this.getFileMetadata(link, stats);
    }
    if (isContainerIdentifier(identifier) && stats.isDirectory()) {
      return this.getDirectoryMetadata(link, stats);
    }
    throw new NotFoundHttpError();
  }

  /**
   * Writes the given data as a file (and potential metadata as additional file).
   * The metadata file will be written first and will be deleted if something goes wrong writing the actual data.
   */
  public async writeDocument(identifier: ResourceIdentifier, data: Guarded<Readable>, metadata: RepresentationMetadata):
  Promise<void> {
    if (this.isMetadataPath(identifier.path)) {
      throw new ConflictHttpError('Not allowed to create files with the metadata extension.');
    }
    const link = await this.resourceMapper.mapUrlToFilePath(identifier, metadata.contentType);

    // Check if we already have a corresponding file with a different extension
    await this.verifyExistingExtension(link);

    const wroteMetadata = await this.writeMetadata(link, metadata);

    try {
      await this.writeDataFile(link.filePath, data);
    } catch (ex: unknown) {
      // Delete the metadata if there was an error writing the file
      if (wroteMetadata) {
        await this.ipfsHelper.unlink((await this.getMetadataLink(link.identifier)).filePath);
      }
      throw ex;
    }
  }

  /**
   * Creates corresponding folder if necessary and writes metadata to metadata file if necessary.
   */
  public async writeContainer(identifier: ResourceIdentifier, metadata: RepresentationMetadata): Promise<void> {
    const link = await this.resourceMapper.mapUrlToFilePath(identifier);
    try {
      await this.ipfsHelper.mkdir(link.filePath);
    } catch (ex: unknown) {
      // Don't throw if directory already exists
      if (!isSystemError(ex) || ex.code !== 'EEXIST') {
        throw ex;
      }
    }

    await this.writeMetadata(link, metadata);
  }

  /**
   * Removes the corresponding file/folder (and metadata file).
   */
  public async deleteResource(identifier: ResourceIdentifier): Promise<void> {
    const link = await this.resourceMapper.mapUrlToFilePath(identifier);
    const stats = await this.getStats(link.filePath);

    try {
      await this.ipfsHelper.unlink((await this.getMetadataLink(link.identifier)).filePath);
    } catch (ex: unknown) {
      // Ignore if it doesn't exist
      if (!isSystemError(ex) || ex.code !== 'ENOENT') {
        throw ex;
      }
    }

    if (!isContainerIdentifier(identifier) && stats.isFile()) {
      await this.ipfsHelper.unlink(link.filePath);
    } else if (isContainerIdentifier(identifier) && stats.isDirectory()) {
      await this.ipfsHelper.rmdir(link.filePath);
    } else {
      throw new NotFoundHttpError();
    }
  }

  /**
   * Gets the Stats object corresponding to the given file path.
   * @param path - File path to get info from.
   *
   * @throws NotFoundHttpError
   * If the file/folder doesn't exist.
   */
  private async getStats(path: string): Promise<IPFSStats> {
    try {
      return await this.ipfsHelper.lstat(path);
    } catch (ex: unknown) {
      if (isSystemError(ex) && ex.code === 'ENOENT') {
        throw new NotFoundHttpError();
      }
      throw ex;
    }
  }

  /**
   * Generates ResourceLink that corresponds to the metadata resource of the given identifier.
   */
  private async getMetadataLink(identifier: ResourceIdentifier): Promise<ResourceLink> {
    const metaIdentifier = { path: `${identifier.path}.meta` };
    return this.resourceMapper.mapUrlToFilePath(metaIdentifier);
  }

  /**
   * Checks if the given path is a metadata path.
   */
  private isMetadataPath(path: string): boolean {
    return path.endsWith('.meta');
  }

  /**
   * Reads and generates all metadata relevant for the given file,
   * ingesting it into a RepresentationMetadata object.
   *
   * @param link - Path related metadata.
   * @param stats - Stats object of the corresponding file.
   */
  private async getFileMetadata(link: ResourceLink, stats: IPFSStats):
  Promise<RepresentationMetadata> {
    return (await this.getBaseMetadata(link, stats, false)).
      set(CONTENT_TYPE, link.contentType);
  }

  /**
   * Reads and generates all metadata relevant for the given directory,
   * ingesting it into a RepresentationMetadata object.
   *
   * @param link - Path related metadata.
   * @param stats - Stats object of the corresponding directory.
   */
  private async getDirectoryMetadata(link: ResourceLink, stats: IPFSStats):
  Promise<RepresentationMetadata> {
    return await this.getBaseMetadata(link, stats, true);
  }

  /**
   * Writes the metadata of the resource to a meta file.
   * @param link - Path related metadata of the resource.
   * @param metadata - Metadata to write.
   *
   * @returns True if data was written to a file.
   */
  private async writeMetadata(link: ResourceLink, metadata: RepresentationMetadata): Promise<boolean> {
    // These are stored by file system conventions
    metadata.remove(RDF.type, LDP.terms.Resource);
    metadata.remove(RDF.type, LDP.terms.Container);
    metadata.remove(RDF.type, LDP.terms.BasicContainer);
    metadata.removeAll(CONTENT_TYPE);
    const quads = metadata.quads();
    const metadataLink = await this.getMetadataLink(link.identifier);
    let wroteMetadata: boolean;

    // Write metadata to file if there are quads remaining
    if (quads.length > 0) {
      // Determine required content-type based on mapper
      const serializedMetadata = serializeQuads(quads, metadataLink.contentType);
      await this.writeDataFile(metadataLink.filePath, serializedMetadata);
      wroteMetadata = true;

      // Delete (potentially) existing metadata file if no metadata needs to be stored
    } else {
      try {
        await this.ipfsHelper.unlink(metadataLink.filePath);
      } catch (ex: unknown) {
        // Metadata file doesn't exist so nothing needs to be removed
        if (!isSystemError(ex) || ex.code !== 'ENOENT') {
          throw ex;
        }
      }
      wroteMetadata = false;
    }
    return wroteMetadata;
  }

  /**
   * Generates metadata relevant for any resources stored by this accessor.
   * @param link - Path related metadata.
   * @param stats - Stats objects of the corresponding directory.
   * @param isContainer - If the path points to a container (directory) or not.
   */
  private async getBaseMetadata(link: ResourceLink, stats: IPFSStats, isContainer: boolean):
  Promise<RepresentationMetadata> {
    const metadata = new RepresentationMetadata(link.identifier).
      addQuads(await this.getRawMetadata(link.identifier));
    addResourceMetadata(metadata, isContainer);
    this.addPosixMetadata(metadata, stats);
    this.addIpfsMetadata(metadata, stats);
    return metadata;
  }

  /**
   * Reads the metadata from the corresponding metadata file.
   * Returns an empty array if there is no metadata file.
   *
   * @param identifier - Identifier of the resource (not the metadata!).
   */
  private async getRawMetadata(identifier: ResourceIdentifier): Promise<Quad[]> {
    try {
      const metadataLink = await this.getMetadataLink(identifier);

      // Check if the metadata file exists first
      await this.ipfsHelper.lstat(metadataLink.filePath);

      const readMetadataStream = guardStream(await this.ipfsHelper.read(metadataLink.filePath));
      return await parseQuads(readMetadataStream, { format: metadataLink.contentType, baseIRI: identifier.path });
    } catch (ex: unknown) {
      // Metadata file doesn't exist so lets keep `rawMetaData` an empty array.
      if (!isSystemError(ex) || ex.code !== 'ENOENT') {
        throw ex;
      }
      return [];
    }
  }

  /**
   * Generate all containment related triples for a container.
   * These include the actual containment triples and specific triples for every child resource.
   *
   * @param link - Path related metadata.
   */
  private async * getChildMetadata(link: ResourceLink): AsyncIterableIterator<RepresentationMetadata> {
    const files = await this.ipfsHelper.readdir(link.filePath);

    // For every child in the container we want to generate specific metadata
    for (const childName of files) {
      // Hide metadata files from containment triples
      if (this.isMetadataPath(childName)) {
        continue;
      }

      // Ignore non-file/directory entries in the folder
      const childStats = await this.ipfsHelper.lstat(joinFilePath(link.filePath, childName));
      if (!childStats.isFile() && !childStats.isDirectory()) {
        continue;
      }

      // Generate the URI corresponding to the child resource
      const childLink = await this.resourceMapper.
        mapFilePathToUrl(joinFilePath(link.filePath, childName), childStats.isDirectory());

      // Generate metadata of this specific child
      const metadata = new RepresentationMetadata(childLink.identifier.path);
      addResourceMetadata(metadata, childStats.isDirectory());
      this.addPosixMetadata(metadata, childStats);
      this.addIpfsMetadata(metadata, childStats);
      yield metadata;
    }
  }

  /**
   * Helper function to add file system related metadata.
   * @param metadata - Metadata object to add to.
   * @param stats - Stats of the file/directory corresponding to the resource.
   */
  private addPosixMetadata(metadata: RepresentationMetadata, stats: IPFSStats): void {
    metadata.add(POSIX.terms.size, toLiteral(stats.size, XSD.terms.integer));
    metadata.add(DC.terms.modified, toLiteral(stats.mtime.toISOString(), XSD.terms.dateTime));
    metadata.add(POSIX.terms.mtime, toLiteral(
      Math.floor(stats.mtime.getTime() / 1_000), XSD.terms.integer,
    ));
  }

  /**
   * Verifies if there already is a file corresponding to the given resource.
   * If yes, that file is removed if it does not match the path given in the input ResourceLink.
   * This can happen if the content-type differs from the one that was stored.
   *
   * @param link - ResourceLink corresponding to the new resource data.
   */
  private async verifyExistingExtension(link: ResourceLink): Promise<void> {
    try {
      // Delete the old file with the (now) wrong extension
      const oldLink = await this.resourceMapper.mapUrlToFilePath(link.identifier);
      if (oldLink.filePath !== link.filePath) {
        await this.ipfsHelper.unlink(oldLink.filePath);
      }
    } catch (ex: unknown) {
      // Ignore it if the file didn't exist yet and couldn't be unlinked
      if (!isSystemError(ex) || ex.code !== 'ENOENT') {
        throw ex;
      }
    }
  }

  /**
   * Helper function without extra validation checking to create a data file.
   * @param path - The filepath of the file to be created.
   * @param data - The data to be put in the file.
   */
  protected async writeDataFile(path: string, data: Readable): Promise<void> {
    return this.ipfsHelper.write({ path, content: data });
  }

  private addIpfsMetadata(metadata: RepresentationMetadata, stats: IPFSStats): void {
    metadata.add(IPFS.cid, literal(stats.cid.toString()));
  }

  public async * getChildren(identifier: ResourceIdentifier): AsyncIterableIterator<RepresentationMetadata> {
    const link = await this.resourceMapper.mapUrlToFilePath(identifier);
    yield * this.getChildMetadata(link);
  }
}
