import {IpfsFs} from "../../dist";
import {promises as fsPromises, ReadStream, WriteStream} from "fs";
import { streamAsAsyncIterator} from "../../src/fs/ipfs/CreateWriteStream";
import {PassThrough} from "stream";

describe("A ipfs fs ", () => {
    let ipfsFs: IpfsFs

    const paths = {
        root: '/tmp/integration-test-data',
        node: '/tmp/integration-test-data/node',
        ipfs: '/tmp/integration-test-data/ipfs',
        mfsPaths: {
            root:  ''
        }
    }

    beforeAll(async () => {
        await fsPromises.mkdir(paths.root)
    })

    afterAll(async () => {
        await fsPromises.rmdir(paths.root, {recursive: true});
    })

    beforeEach(async () => {
        await fsPromises.mkdir(paths.node);
        await fsPromises.mkdir(paths.ipfs);
        ipfsFs = new IpfsFs({repo: paths.ipfs})
    })

    afterEach(() => {
        ipfsFs.stop();
        fsPromises.rmdir(paths.ipfs, {recursive: true})
        fsPromises.rmdir(paths.node, {recursive: true})
    })

    it('should write and read a file with readFil111', async () => {
        const stream = new PassThrough();
        stream.write(new Uint8Array([1, 2]));
        stream.end(new Uint8Array([3, 4, 5]));

        const data = streamAsAsyncIterator(stream)
        await (await (ipfsFs.mfs())).write('/test' , data , { create: true,
            mtime: new Date() });



       const d = await ipfsFs.readFile('/test')

        expect(d).toStrictEqual(Buffer.from([1, 2, 3, 4, 5]))

    })
})
