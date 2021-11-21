# Solid Over IPFS Data Accessor Module for Community Solid Server (CSS)

This CSS module allows configuring and running a Solid Pod over the Interplanetary Filesystem (IPFS).
It is still in early development and should be seen as a proof of concept. 
The initial implementation is described in [this paper] published at [IFIP 2021]. 

## Quickstart
These following commands will start a Solid Pod listening to http://localhost:3000  which persists all data  (under `/tmp/ipfs/`) on a local IPFS node.

```bash
git clone ................
cd solid-ipfs-data-accessor
npm install 
npm start
```

# Cite 
```bibtex
@INPROCEEDINGS{parrillo_ifip_2021,
    author={Parrillo, Fabrizio and Tschudin, Christian},
    booktitle={2021 IFIP Networking Conference (IFIP Networking)},
    title={Solid over the Interplanetary File System},
    year={2021},
    volume={},
    number={},
    pages={1-6},
    doi={10.23919/IFIPNetworking52078.2021.9472772}
}
```


[IFIP 2021]: http://dl.ifip.org/db/conf/networking/networking2021/
[this paper]: http://dl.ifip.org/db/conf/networking/networking2021/1570714032.pdf
[Node.js Promise Filesystem]: https://nodejs.org/api/fs.html#fs_promises_api
