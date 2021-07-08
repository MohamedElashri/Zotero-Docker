#!/bin/sh
cd /zotero/web-library

if [ -f "/zotero/config/api.json" ]; then
	perl -0777pe "s|(<script .*? id=\"zotero-web-library-config\">).*?(</script>)|\1 `cat /zotero/config/api.json` \2|sg" -i src/html/index.html
fi

if [ -f "/zotero/config/menu.json" ]; then
	perl -0777pe "s|(<script .*? id=\"zotero-web-library-menu-config\">).*?(</script>)|\1 `cat /zotero/config/menu.json` \2|sg" -i src/html/index.html
fi

npm run build:html
npm run serve
