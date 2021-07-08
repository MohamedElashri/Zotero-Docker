#!/bin/sh

sed -i 's#https://api.zotero.org/#http://192.168.1.249:8080/#g' zotero-client/resource/config.js
sed -i 's#wss://stream.zotero.org/#ws://192.168.1.249:8081/#g' zotero-client/resource/config.js
sed -i 's#https://www.zotero.org/#http://192.168.1.249:8080/#g' zotero-client/resource/config.js
sed -i 's#https://zoteroproxycheck.s3.amazonaws.com/test##g' zotero-client/resource/config.js
