
import {promises as fsPromises} from "fs";
import {IpfsFs} from "../../dist";
import {systemErrorInvalidArgument, systemErrorNotEmptyDir} from "../../src/errors/system/SystemErrors";
import type {SystemError} from "@solid/community-server";
import {systemErrorNotExists} from "../../dist/errors/system/SystemErrors";

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

    it('should create and read directories', async () => {
        let nodeWriteResult = await fsPromises.mkdir(`${paths.node}/test`);
        let ipfsWriteResult = await ipfsFs.mkdir(`${paths.mfsPaths.root}/test`)
        expect(ipfsWriteResult).toBe(nodeWriteResult)
        expect(ipfsFs.stats(`${paths.mfsPaths.root}/test`)).toBeDefined();

        nodeWriteResult = await fsPromises.mkdir(`${paths.node}/test/withSlash/`);
        ipfsWriteResult = await ipfsFs.mkdir(`${paths.mfsPaths.root}/test/withSlash/`)
        expect(ipfsWriteResult).toBe(nodeWriteResult)
        expect(ipfsFs.stats(`${paths.mfsPaths.root}/test/withSlash/`)).toBeDefined();
    })

    it('should recursively create directories and read directories', async () => {
        // Base case 1: create recursive on root dir that already exists
        let nodeWriteResult = await fsPromises.mkdir(`${paths.node}/`, {recursive: true});
        let ipfsWriteResult = await ipfsFs.mkdir(`${paths.mfsPaths.root}/`, {recursive: true})
        expect(ipfsWriteResult).toBe(nodeWriteResult) // undefined
        expect(ipfsFs.stats(`${paths.mfsPaths.root}/`)).toBeDefined();

        // Base case 2: create recursive dir on root dir
        nodeWriteResult = await fsPromises.mkdir(`${paths.node}/test/create/dirs/recursive`, {recursive: true});
        ipfsWriteResult = await ipfsFs.mkdir(`${paths.mfsPaths.root}/test/create/dirs/recursive`, {recursive: true})
        expect(ipfsWriteResult).toBe(nodeWriteResult!.replace(paths.node, "")) // /test
        expect(ipfsFs.stats(`${paths.mfsPaths.root}/test/create/dirs/recursive`)).toBeDefined();

        nodeWriteResult = await fsPromises.mkdir(`${paths.node}/test/create/dirs/recursive`, {recursive: true});
        ipfsWriteResult = await ipfsFs.mkdir(`${paths.mfsPaths.root}/test/create/dirs/recursive`, {recursive: true})
        expect(ipfsWriteResult).toBe(nodeWriteResult) // undefined
        expect(ipfsFs.stats(`${paths.mfsPaths.root}/test/create/dirs/recursive`)).toBeDefined();
    })

    it('should open a directory with opendir and return a stream of dirents', async () => {
        await fsPromises.mkdir(`${paths.node}/files`);
        await fsPromises.mkdir(`${paths.node}/a`);
        await fsPromises.mkdir(`${paths.node}/b`);
        await fsPromises.mkdir(`${paths.node}/c`);
        const expectedResultDirs = new Set<string>()
        for await (let dirent of await fsPromises.opendir(`${paths.node}`)) {
            expectedResultDirs.add(dirent.name);
        }

        await ipfsFs.mkdir(`${paths.mfsPaths.root}/files`);
        await ipfsFs.mkdir(`${paths.mfsPaths.root}/a`);
        await ipfsFs.mkdir(`${paths.mfsPaths.root}/b`);
        await ipfsFs.mkdir(`${paths.mfsPaths.root}/c`);
        const resultDirs = new Set<string>()
        const direntFunctions = ["isFile", "isDirectory", "isBlockDevice", "isCharacterDevice", "isSymbolicLink", "isFIFO", "isSocket"]
        for await (let dirent of await ipfsFs.opendir(`${paths.mfsPaths.root}/`)) {
            resultDirs.add(dirent.name);
            for(let func of direntFunctions){
                if (func === "isDirectory") {// @ts-ignore
                    expect(dirent[func].call()).toBeTruthy();
                } else {// @ts-ignore
                    expect(dirent[func].call()).toBeFalsy()
                }
            }
        }

        expect(resultDirs).toStrictEqual(expectedResultDirs)


        await fsPromises.writeFile(`${paths.node}/files/a`,"data-a");
        await fsPromises.writeFile(`${paths.node}/files/b`,"data-b");
        await fsPromises.writeFile(`${paths.node}/files/c`,"data-c");
        const expectedResultFiles = new Set<string>()
        for await (let dirent of await fsPromises.opendir(`${paths.node}/files`)) {
            expectedResultFiles.add(dirent.name);
        }

        await ipfsFs.writeFile(`${paths.mfsPaths.root}/files/a`, "data-a");
        await ipfsFs.writeFile(`${paths.mfsPaths.root}/files/b`, "data-b");
        await ipfsFs.writeFile(`${paths.mfsPaths.root}/files/c`, "data-c");

        const resultFiles = new Set<string>()
        for await (let dirent of await ipfsFs.opendir(`${paths.mfsPaths.root}/files`)) {
            resultFiles.add(dirent.name);
            for(let func of direntFunctions){
                if (func === "isFile") {// @ts-ignore
                    expect(dirent[func].call()).toBeTruthy();
                } else {// @ts-ignore
                    expect(dirent[func].call()).toBeFalsy();
                }
            }
        }

        expect(resultFiles).toStrictEqual(expectedResultFiles);

        expect(
            (await ipfsFs.opendir(`${paths.mfsPaths.root}/files`)).path
        ).toBe(
            (await fsPromises.opendir(`${paths.node}/files`)).path.replace(paths.node, "")
        )


    })

    it('should delete a directory', async () => {
        await fsPromises.mkdir(`${paths.node}/test1`);
        await ipfsFs.mkdir(`${paths.mfsPaths.root}/test1`);
        expect(await ipfsFs.rmdir(`${paths.mfsPaths.root}/test1`))
            .toBe(await fsPromises.rmdir(`${paths.node}/test1`));

        await ipfsFs.mkdir(`${paths.mfsPaths.root}/test2/a/b`, {recursive: true});
        await fsPromises.mkdir(`${paths.node}/test2/a/b`, {recursive: true});


        try {await fsPromises.rmdir(`${paths.node}/test2` )}
        catch (e) {
            const expectedError = systemErrorNotEmptyDir(new Error(), 'rmdir', `${paths.node}/test2`);
            expect(e.code).toBe(expectedError.code);
            expect(e.errno).toBe(expectedError.errno);
            expect(e.path).toBe(expectedError.path);
            expect(e.syscall).toBe(expectedError.syscall);
        }

        try {await ipfsFs.rmdir(`${paths.mfsPaths.root}/test2`)}
        catch (e) {
            const expectedError = systemErrorNotEmptyDir(new Error(), 'rmdir', `${paths.mfsPaths.root}/test2`);
            expect(e.message).toBe("The directory string is not empty. Consider using the recursive option to delete a non empty directory ex. (path, {recursive: true})");
            expect(e.code).toBe(expectedError.code);
            expect(e.errno).toBe(expectedError.errno);
            expect(e.path).toBe(expectedError.path);
            expect(e.syscall).toBe(expectedError.syscall);
        }

        expect(await fsPromises.rmdir(`${paths.node}/test2` , {recursive: true})).toBe(undefined)
        expect(await ipfsFs.rmdir(`${paths.mfsPaths.root}/test2` , {recursive: true})).toBe(undefined)

        expect(await ipfsFs.readdir(`${paths.mfsPaths.root}/test2`)).toBe([])
        expect((await fsPromises.readdir(`${paths.node}`)).length).toBe(0)
        expect(await ipfsFs.readdir(`${paths.mfsPaths.root}/`)).toBe([])
    })


    it('should unlink a file', async () => {
        await fsPromises.writeFile(`${paths.node}/test1`, "delete me");
        await ipfsFs.writeFile(`${paths.mfsPaths.root}/test1`, "delete me");

        expect(await ipfsFs.unlink(`${paths.mfsPaths.root}/test1`))
            .toBe(await fsPromises.unlink(`${paths.node}/test1`))

        try {await ipfsFs.unlink(`${paths.mfsPaths.root}/test1`)}
        catch (e) {
            expect(e.message).toBe('The file with the provided file path /test1 does not exist.');
            expect(e.code).toBe("ENOENT");
            expect(e.errno).toBe(-2);
            expect(e.path).toBe('/test1');
            expect(e.syscall).toBe('unlink');
        }

    })

    it('should list the file stats', async () => {
        await fsPromises.writeFile(`${paths.node}/test1`, "delete me");
        await ipfsFs.writeFile(`${paths.mfsPaths.root}/test1`, "delete me");

        expect(await ipfsFs.lstat(`${paths.mfsPaths.root}/test1`))
            .toBe(await fsPromises.lstat(`${paths.node}/test1`))


    })



})
