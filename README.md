# 基于单页应用的前端部署
## 一、创建应用
```bash
# 创建一个 cra 应用
$ npx create-react-app cra-deploy

# 进入 cra 目录
$ cd cra-deploy

# 进行依赖安装
$ yarn

# 对资源进行构建
$ npm run build
```
创建`docker-compose.yaml`文件可以替代构建及运行容器的所有命令
```yaml
# build: 从当前路径构建镜像
version: "3"
services:
  cra-app:
    build: .
    ports:
      # 将容器中的 3000 端口映射到宿主机的 3000 端口，左侧端口为宿主机端口，右侧为容器端口
      - 3000:3000
```
配置好文件以后，只需一行命令 docker-compose up 替代构建及运行容器的所有命令
## 二、Dockerfile
在本地将 CRA 应用跑起来，可通过以下步骤：
```bash
$ yarn
$ npm run build
$ npx serve -s build
```
将命令通过以下几步翻译为一个 Dockerfile：

1. 选择一个基础镜像。由于需要在容器中执行构建操作，我们需要 node 的运行环境，因此 `FROM` 选择 node。
1. 将以上几个脚本命令放在 `RUN` 指令中。
1. 启动服务命令放在 `CMD` 指令中。
```dockerfile
FROM node:14-alpine
# Alpine 操作系统是一个面向安全的轻型 Linux 发行。相比于其他镜像体积更小，运行时占用的资源更小。

WORKDIR /code

ADD . /code
RUN yarn && npm run build

CMD npx serve -s build
EXPOSE 3000
```
使用构建命令
```bash
$ docker-compose up --build

# up: 创建并启动容器
#--build: 每次启动容器前构建镜像
```
运行构建完成。然而还可以针对以下两点进行优化。

1. 构建镜像时间过长，**优化构建时间**。
1. 构建镜像文件过大，**优化镜像体积**。
## 三、构建时间优化：构建缓存
一个前端项目的耗时主要集中在两个命令：

1. yarn
1. yarn build

在 Dockerfile 中，对于`ADD`指令来讲，如果添加文件内容的`checksum`没有发生变化，则可以利用构建缓存。
而前端项目中，如果`package.json/yarn.lock`文件内容没有变化，则无需再次`yarn`了。
将`package.json/yarn.lock`事先置于镜像中，安装依赖就可以获得缓存的优化
```dockerfile
# 构建时间优化：构建缓存
FROM node:14-alpine

WORKDIR /code

# 单独分离 package.json 可以利用缓存
ADD package.json yarn.lock /code/
# 此时 yarn 可以利用缓存，如果 yarn.lock 内容没有变化，则不会重新安装依赖
RUN yarn

ADD . /code/
RUN npm run build

CMD npx serve -s build
EXPOSE 3000
```
重新运行构建命令
```bash
$ docker-compose up --build
```
如果有可利用的缓存，可以在命令行看到，说明构建优化成功
```bash
# ...
=> => transferring context: 2.81MB                                                                                                                            1.5s
=> CACHED [2/6] WORKDIR /code                                                                                                                                 0.0s
=> CACHED [3/6] ADD package.json yarn.lock /code/                                                                                                             0.0s
=> CACHED [4/6] RUN yarn
# ...
```
## 四、构建体积优化：多阶段构建
我们的目标是提供静态服务（资源），完全不需要依赖于 node.js 环境进行服务化。node.js 环境在完成构建后即完成了它的使命，它的继续存在会造成极大的资源浪费。
我们可以使用多阶段构建进行优化，最终使用 nginx 进行服务化。

1. 第一阶段 Node 镜像：使用 node 镜像对单页应用进行构建，生成静态资源。
1. 第二阶段 Nginx 镜像：使用 nginx 镜像对单页应用的静态资源进行服务化。

将`Dockerfile`文件命名为`simple.Dockerfile`，修改内容
```dockerfile
FROM node:14-alpine as builder

WORKDIR /code

# 单独分离 package.json，是为了安装依赖可最大限度利用缓存
ADD package.json yarn.lock /code/
# 此时 yarn 可以利用缓存，如果 yarn.lock 内容没有变化，则不会重新安装依赖
RUN yarn

ADD . /code
RUN npm run build

# 选择更小体积的基础镜像
FROM nginx:alpine
COPY --from=builder code/build /usr/share/nginx/html
```
同时修改`docker compose`内容为
```yaml
version: "3"
services:
  simple:
    build:
      context: .
      dockerfile: simple.Dockerfile
    ports:
      - 4000:80
```
使用`docker-compose up --build simple`启动容器。访问`http://localhost:4000`
## 小结
本节通过构建缓存与多阶段构建优化了体积和时间，然而还有两个小问题需要解决：

1. 单页应用多路由配置
1. 单页应用多缓存策略
