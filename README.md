[![Docker Image CI](https://github.com/MohamedElashri/Zotero-Docker/actions/workflows/docker-image.yml/badge.svg)](https://github.com/MohamedElashri/Zotero-Docker/actions/workflows/docker-image.yml)
# Zotero-Docker
 Docker version of Zotero dataserver and web library combined. This work is based on the original work of [zotero prime](https://github.com/SamuelHassine/zotero-prime)

 # Zotero Prime - On-premise Zotero platform

Zotero Prime is a full packaged repository aimed to make on-premise [Zotero](https://www.zotero.org) deployment easier with the last versions of both Zotero client and server. This is the result of sleepness nights spent to deploy Zotero within my organization on a disconnected network. Feel free to open issues or pull requests if you did not manage to use it.


## Installation

Clone the repository:
```bash
$ git clone --recursive https://github.com/MohamedElashri/Zotero-Docker.git
$ cd /Zotero-Docker/docker
```
*Configure and run*:
```bash
$ sudo docker-compose up -d
```

or you can run this script 

```bash
$ ./bin/run.sh
```



### Initialize databases

*Initialize databases*:
```bash
$ ./bin/init.sh
```


*Available endpoints*:

| Name          | URL                                           |
| ------------- | --------------------------------------------- |
| Zotero API    | http://localhost:8080                         |
| S3 Web UI     | http://localhost:8082                         |
| PHPMyAdmin    | http://localhost:8083                         |
| Web Library   | http://localhost:8084

*Default login/password*:

| Name          | Login                    | Password           |
| ------------- | ------------------------ | ------------------ |
| Zotero API    | admin                    | admin              |
| S3 Web UI     | zotero                   | zoterodocker       |
| PHPMyAdmin    | root                     | zotero             |

### Create users 

to create users, use the create script in bin folder 

```bash
$ ./bin/create-user.sh {UID} {username} {password}
```


## Client installation

[Instruction](https://github.com/MohamedElashri/Zotero-Docker/blob/main/client/README.md)
