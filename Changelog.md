# v0.0.1

- New Features:
    - Refactor the initial [implementation] 
    - Use Node.js streams to read and write from IPFS.
    - Decouple the Data Accessor from the underlying filesystem.
      As a result, another filesystem can be integrated by implementing the [Node.js Promise Filesystem] interface as a compatibility layer. You can configure
      the filesystem as usual with the CSS configuration, which will inject the
      filesystem instance to all dependent objects at runtime.
- Bug Fixes:
    - To handle requests which do not specify the content type, we implemented a custom ExtensionBasedMapper which makes use of the
      correct underlying filesystem (MFS in our case).
      
[implementation]: https://github.com/FUUbi/community-server/tree/feat/ipfs-accessor
[Node.js Promise Filesystem]: https://nodejs.org/api/fs.html#fs_promises_api

