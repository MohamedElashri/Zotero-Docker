FROM alpine:20210804
ARG TAG=master

RUN apk add --no-cache npm git rsync perl

WORKDIR /zotero
COPY entrypoint.sh /zotero/

RUN cd /zotero && \
	mkdir config && \
	chmod +x entrypoint.sh

RUN git clone https://github.com/zotero/web-library && \
	cd web-library && \
	git checkout $TAG && \
	npm install && \
	apk del git

RUN cd /zotero/web-library && npm run build

EXPOSE 8084/TCP
VOLUME /zotero/config
ENTRYPOINT ["/zotero/entrypoint.sh"]
