
import {promises as fsPromises} from "fs";
import {IpfsFs} from "../../dist";

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

    it('should write and read a file with readFile', async () => {
        const nodeWriteResult = await fsPromises.writeFile(`${paths.node}/test`, "hello");
        const ipfsWriteResult = await ipfsFs.writeFile(`${paths.mfsPaths.root}/test`, "hello")
        expect(ipfsWriteResult).toBe(nodeWriteResult)


        const nodeReadResult = await fsPromises.readFile(`${paths.node}/test`);
        const ipfsReadResult = await ipfsFs.readFile(`${paths.mfsPaths.root}/test`);
        expect(ipfsReadResult).toStrictEqual(nodeReadResult)

        const nodeReadUtf8Result = await fsPromises.readFile(`${paths.node}/test`, {encoding: "utf8"});
        const ipfsReadUtf8Result = await ipfsFs.readFile(`${paths.mfsPaths.root}/test`, {encoding: "utf8"});
        expect(ipfsReadUtf8Result).toStrictEqual(nodeReadUtf8Result);
    })

    it('should write and read a file with string with encoding', async () => {
        let nodeWriteResult = await fsPromises.writeFile(`${paths.node}/test`, "12AA", 'hex');
        let ipfsWriteResult = await ipfsFs.writeFile(`${paths.mfsPaths.root}/test`, "12AA",'hex' )
        expect(ipfsWriteResult).toBe(nodeWriteResult)

        let nodeReadResult = await fsPromises.readFile(`${paths.node}/test`, {encoding: "hex"});
        let ipfsReadResult = await ipfsFs.readFile(`${paths.mfsPaths.root}/test`, {encoding: "hex"});
        expect(ipfsReadResult).toStrictEqual(nodeReadResult);

        nodeWriteResult = await fsPromises.writeFile(`${paths.node}/test`, "12AA", {encoding: "hex"});
        ipfsWriteResult = await ipfsFs.writeFile(`${paths.mfsPaths.root}/test`, "12AA",{encoding: "hex"} )
        expect(ipfsWriteResult).toBe(nodeWriteResult)

        nodeReadResult = await fsPromises.readFile(`${paths.node}/test`, {encoding: "hex"});
        ipfsReadResult = await ipfsFs.readFile(`${paths.mfsPaths.root}/test`, {encoding: "hex"});
        expect(ipfsReadResult).toStrictEqual(nodeReadResult);
    })

})
