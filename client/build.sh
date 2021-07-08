#!/bin/sh

./config.sh
cd zotero-client
npm install
npm run build

cd ../zotero-standalone-build
./fetch_xulrunner.sh -p l
./fetch_pdftools
./scripts/dir_build -p l
