#!/bin/sh
ZOTEROSRC="../zotero"
if [ -e "./config.sh" ]; then
	. ./config.sh
fi

tag=master
if [ -n "$1" ]; then
	tag=$1
fi
echo Downloading tag $tag
sleep 2

outFile="$ZOTEROSRC/chrome/content/zotero/xpcom/citeproc.js"

if [ ! -e "$outFile" ]; then
	>&2 echo "$outFile not found. Looking for Zotero source in $(readlink -f $ZOTEROSRC)"
	exit 78 # EX_CONFIG: configuration error (from sysexits.h)
fi

curl https://raw.githubusercontent.com/Juris-M/citeproc-js/$tag/citeproc.js > "$outFile"

echo

if [ `command -v js` ]; then
	echo "Verifying file..."
	js -c "$outFile"
	if [ $? = 0 ]; then
		echo "OK"
	fi
else
	echo "Warning: js isn't installed -- not verifying file"
fi
