# zotero-sync-standalone
Zotero Standalone Client with the possibility of choosing the sync server address.
Instructions based on [Zotero-prime](https://github.com/SamuelHassine/zotero-prime)

## Instructions

### Configuration

Modify the file `config.sh` to register the URL of your Zotero Server. 

### Build

For Linux, run this code:

```
git clone --recursive https://github.com/MohamedElashri/Zotero-Docker.git
cd zotero-sync-standalone
./build.sh
```
For windows 


For MacOS and Windows, you will need to change `build.sh`. Replace all the occurences `-p l` with `-p m` (for MacOS) and `-p w` (for Windows).

### Run Client

After the build, you will find the binaries in `./zotero-standalone-build/staging/Zotero_OSVersion/zotero`. 
You just need to run it and connect to your Sync server from (Edit/Preferences -> Sync).

