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
2. 将以上几个脚本命令放在 `RUN` 指令中。
3. 启动服务命令放在 `CMD` 指令中。
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
2. 构建镜像文件过大，**优化镜像体积**。
## 三、构建时间优化：构建缓存
一个前端项目的耗时主要集中在两个命令：

1. yarn
2. yarn build

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
2. 第二阶段 Nginx 镜像：使用 nginx 镜像对单页应用的静态资源进行服务化。

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
2. 单页应用多缓存策略


# 单页应用多路由与持久缓存优化
## 路由
使用`react-router-dom`添加路由，`/src/index.js`代码如下
```jsx

import ReactDOM from 'react-dom/client'
import {
  BrowserRouter,
  Routes,
  Route,
  Link
} from 'react-router-dom'

const root = ReactDOM.createRoot(document.getElementById('root'))

root.render(
  <BrowserRouter>
    <Routes>
      <Route path='/' element={<Home />} />
      <Route path='/about' element={<About />} />
    </Routes>
  </BrowserRouter>
)

function Home() {
  return (
    <div>
      <h1>当前在 Home 页面</h1>
      <Link to='/about'>About</Link>
    </div>
  )
}

function About() {
  return (
    <div>
      <h1>当前在 About 页面</h1>
      <Link to='/'>Home</Link>
    </div>
  )
}
```
重新部署
```bash
$ docker-compose up --build simple
```
直接访问 [http://localhost:4000/about](http://localhost:4000/about) 会显示404页面
![image.png](https://cdn.nlark.com/yuque/0/2022/png/1081923/1655874153566-2c9e2fb0-9ee0-4583-be32-b2744c99efa9.png#clientId=u2ea038aa-1558-4&crop=0&crop=0&crop=1&crop=1&from=paste&height=123&id=u11fcef21&margin=%5Bobject%20Object%5D&name=image.png&originHeight=181&originWidth=497&originalType=binary&ratio=1&rotation=0&showTitle=false&size=10611&status=done&style=none&taskId=ub90f9fa5-63b1-4f03-a68d-0ebc634f47f&title=&width=338.5)

这是因为**在静态资源中并没有**`**about**`**或者**`**about.html**`**资源。因此返回**`**404 Not Found**`**。而在单页应用中，**`**/about**`**是由前端通过**`**history API**`**进行控制的。**
解决方法：**在服务端将所有页面路由均指向**`**index.html**`**，而单页应用再通过**`**history API**`**控制当前路由显示哪个页面。**这也是静态资源服务器的重写（`Rewrite`）功能。
我们在使用 nginx 镜像部署前端应用时，可通过挂载 nginx 配置解决该问题。
## nginx 的 try_file 指令
在 nginx 中，可通过 try_files 指令将所有页面导向`index.html`。
```nginx
location / {
  # 如果资源不存在，则回退到 index.html
  try_files $uri $uri/ /index.html;
}
```
这样就解决了服务器端路由的问题
## 长期缓存
在CRA应用中，`./build/static`目录均由 webpack 构建产生，资源路径将会带有 hash 值。
此时可通过`expires`对它们配置一年的长期缓存，实际上是配置了`Cache-Control:max-age=31536000`的相应头。
```nginx
location /static {
  expires 1y;
}
```
## nginx 配置文件
总结缓存策略如下：

1. 带有 hash 的资源一年长期缓存
2. 非带 hash 的资源，需配置 Cache-Control: no-cache，避免浏览器默认为强缓存

`nginx.conf`文件需要维护在项目当中，最终配置如下：
```nginx
server {
    listen       80;
    server_name  localhost;

    root   /usr/share/nginx/html;
    index  index.html index.htm;

    location / {
        # 解决单页应用服务端路由的问题
        try_files  $uri $uri/ /index.html;  

        # 非带 hash 的资源，需要配置 Cache-Control: no-cache，避免浏览器默认为强缓存
        expires -1;
    }

    location /static {
        # 带 hash 的资源，需要配置长期缓存
        expires 1y;
    }
}
```
## Dockerfile 配置文件
在 Dockerfile 部署过程中，需要将`nginx.conf`置于镜像中。
修改`router.Dockerfile`配置文件如下：
```dockerfile
FROM node:14-alpine as builder

WORKDIR /code

# 单独分离 package.json，是为了 yarn 可最大限度利用缓存
ADD package.json yarn.lock /code/
RUN yarn

#  单独分离 public/src，是为了避免 ADD . /code 时，因 README.md/nginx.conf 的更改导致缓存失效
# 也是为了 npm run build 可最大限度利用缓存
ADD public /code/public
ADD src /code/src
RUN npm run build

# 选择更小体积的基础镜像
FROM nginx:alpine
# 使用项目中的 nginx.conf 作为 nginx 的配置文件
ADD nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=builder code/build /usr/share/nginx/html
```
## 校验长期缓存配置
访问 [http://localhost:3000(opens new window)](http://localhost:3000/)页面，打开浏览器控制台网络面板。
此时对于**带有** hash 资源， Cache-Control: max-age=31536000 响应头已配置。
此时对于**非带** hash 资源， Cache-Control: no-cache 响应头已配置。

![image.png](https://cdn.nlark.com/yuque/0/2022/png/1081923/1655879426931-9dae3040-992e-4ab5-9f28-e6998f628e9a.png#clientId=u2ea038aa-1558-4&crop=0&crop=0&crop=1&crop=1&from=paste&height=241&id=u7713bb00&margin=%5Bobject%20Object%5D&name=image.png&originHeight=332&originWidth=668&originalType=binary&ratio=1&rotation=0&showTitle=false&size=66702&status=done&style=none&taskId=u95c382ae-ad5b-4d2b-a9a3-72d8e90406a&title=&width=484)

至此，我们的单页面应用部署就完成了。

# 将静态资源部署在 OSS/CDN
购买 [👉 OSS](https://oss.console.aliyun.com/overview)，很便宜，5块钱半年。
我们将静态资源上传至 OSS，并对 OSS 提供 CDN 服务。仍以上一节的项目为示例，并将静态资源上传至 OSS 。
## OSS 云服务之前的准备
### AccessKey
在将静态资源上传至云服务时，我们需要 AccessKey/AccessSecret 获得权限用以上传。可参考文档 [👉 获取AccessKey](https://help.aliyun.com/document_detail/53045.html)
拿到 AccessKey 相关信息以后可以将其设置成自己的环境变量。[👉 点击看环境变量更多信息](https://q.shanyue.tech/command/env.html)
```bash
export ACCESS_KEY_ID=你的AccessKey ID ACCESS_KEY_SECRET=你的AccessKey Secret
```
> 上面执行后只能在当前 shell 窗口中使用
> 如果你想要永久有效，执行

**如果需要使得配置的环境变量永久有效，需要写入 ~/.bashrc 或者 ~/.zshrc**
```bash
# 判断当前是哪个 shell
# 如果是 zsh，写入 ~/.zshrc
# 如果是 bash，写入 ~/.bashrc
$ echo $SHELL
/bin/zsh

# 写入 ~/.zshrc，如果不存在该文件，请新建
$ vim ~/.zshrc

# 写入变量
export ACCESS_KEY_ID=你的AccessKey ID ACCESS_KEY_SECRET=你的AccessKey Secret

写入后记得使它生效，或者重开一个 shell 窗口
$ source ~/.zshrc
```
### Bucket
Bucket 是 OSS 中的存储空间。**对于生产环境，可对每一个项目创建单独的 Bucket**，而在测试环境，多个项目可共用 Bucket。
创建一个 Bucket
![image.png](https://cdn.nlark.com/yuque/0/2022/png/1081923/1655981946692-8d2452c0-92ab-4a0f-9f5b-d61766708a10.png#clientId=u1539f4b6-c990-4&crop=0&crop=0&crop=1&crop=1&from=paste&height=422&id=u7a76ddfa&margin=%5Bobject%20Object%5D&name=image.png&originHeight=844&originWidth=798&originalType=binary&ratio=1&rotation=0&showTitle=false&size=146748&status=done&style=none&taskId=u531ae256-3c9c-4999-b8cf-2c99e828b16&title=&width=399)
在创建 Bucket 时，**需要注意以下事项**。

1. 权限设置为公共读 (Public Read)
1. 跨域配置 CORS (manifest.json 需要配置 cors)
1. 记住 Endpoint，比如 oss-cn-beijing.aliyuncs.com。将会在配置 PUBLIC_URL 中使用到

Endpoint 如下
![image.png](https://cdn.nlark.com/yuque/0/2022/png/1081923/1655981627247-eb051e15-6a8f-47bc-9ddc-158007e9da17.png#clientId=u1539f4b6-c990-4&crop=0&crop=0&crop=1&crop=1&from=paste&height=264&id=ub2d9abed&margin=%5Bobject%20Object%5D&name=image.png&originHeight=527&originWidth=1065&originalType=binary&ratio=1&rotation=0&showTitle=false&size=88049&status=done&style=none&taskId=ubbb68686-e199-4494-b664-d39b0b54e67&title=&width=532.5)
如果你在创建 Bucket 时没有设置为公共读可在权限管理中设置 Bucket 的读写权限为**公共读 **（权限管理 > 读写权限 > 公共读）
![image.png](https://cdn.nlark.com/yuque/0/2022/png/1081923/1655981736276-da95b640-9ab7-44ec-af2c-a379d72eae2d.png#clientId=u1539f4b6-c990-4&crop=0&crop=0&crop=1&crop=1&from=paste&height=105&id=u73546c37&margin=%5Bobject%20Object%5D&name=image.png&originHeight=210&originWidth=670&originalType=binary&ratio=1&rotation=0&showTitle=false&size=22731&status=done&style=none&taskId=u1e74412b-7f50-4f15-8fea-d273a9497d4&title=&width=335)
跨域设置
![image.png](https://cdn.nlark.com/yuque/0/2022/png/1081923/1655981769017-dc5f777e-3b9c-495f-83f9-133681cd9dbb.png#clientId=u1539f4b6-c990-4&crop=0&crop=0&crop=1&crop=1&from=paste&height=154&id=u419d805f&margin=%5Bobject%20Object%5D&name=image.png&originHeight=307&originWidth=631&originalType=binary&ratio=1&rotation=0&showTitle=false&size=22315&status=done&style=none&taskId=u501fda93-d767-4931-8ee9-c7c4ce7c125&title=&width=315.5)
## 将资源推送到 OSS: ossutil
创建好 Bucket 以后，可以通过官方工具 ossutil 将静态资源上传至 OSS。[👉 ossutil 下载地址](https://help.aliyun.com/document_detail/120075.htm)
按照流程安装好以后。接着将其放到 `usr/local/bin`目录下（这一步是设置环境变量，macOS系统）
```bash
# 进入用户的 bin 目录
$ cd  /usr/local/bin

# 将 ossutil 文件添加到 bin 目录下
$ ln ~/ossutilmac64 ossutil
```
通过`ossutil config`进行权限配置
```bash
# 这里的 $ACCESS_KEY_ID $ACCESS_KEY_SECRET $ENDPOINT 就是我们上面获取的值然后设置的环境变量
# 如果你没有设置成环境变量则需要你自己将这些内容替换成你自己的值
$ ossutil config -i $ACCESS_KEY_ID -k $ACCESS_KEY_SECRET -e $ENDPOINT
```
我们可以使用命令`ossutil cp`将本地资源上传至 OSS。同时缓存策略与上一节保持一致：

1. 带有 hash 的资源一年长期缓存
2. 非带 hash 的资源，需要配置 Cache-Control: no-cache，避免浏览器默认为强缓存。
```bash
# 将本地目录 build 上传到 Bucket oss://你的Bucket名 中
# --meta: 配置响应头，也就是这里的缓存策略
# build: 本地静态资源目录
$ ossutil cp -rf --meta Cache-Control:no-cache build oss://这里填写你的Bucket名/

# 将带有 hash 资源上传到 OSS Bucket，并且配置长期缓存
# 注意此时 build/static 上传了两遍 (可通过脚本进行优化)
$ ossutil cp -rf --meta Cache-Control:max-age=31536000 build/static oss://这里填写你的Bucket名/static
```
为了方便使用，可以讲这两条命令维护到`npm scripts`中，比如我的如下👇
```json
{ 
  "scripts": {
    "oss:cli": "ossutil cp -rf --meta Cache-Control:no-cache build oss://junjiang-cra/ && ossutil cp -rf --meta Cache-Control:max-age=31536000 build/static oss://junjiang-cra/static",
  }
}
```
执行`yarn oss:cli`就可以将打包后的内容上传到自己的 oss 里面了👇
![image.png](https://cdn.nlark.com/yuque/0/2022/png/1081923/1656040232399-b4847ccf-1746-4c86-9b1a-adb5c4c54a50.png#clientId=u1539f4b6-c990-4&crop=0&crop=0&crop=1&crop=1&from=paste&height=294&id=u5bcc3519&margin=%5Bobject%20Object%5D&name=image.png&originHeight=509&originWidth=747&originalType=binary&ratio=1&rotation=0&showTitle=false&size=59902&status=done&style=none&taskId=ub69b591b-8ae1-4a82-a4d8-cfc42fac40b&title=&width=431.5)
## 将资源推送到 OSS:npm scripts
另外也可以通过官方提供的SDK：ali-oss 来上传

1. 对每一条资源进行精准控制
2. 仅仅上传变更的文件
3. 使用 p-queue 控制 N 个资源同时上传

添加脚本命令
```json
{
  scripts: {
    'oss:script': 'node ./scripts/uploadOSS.js'
  }
}
```
添加脚本`script/uploadOSS.js`
```javascript
port OSS from 'ali-oss'
import { createReadStream } from 'fs'
import { resolve } from 'path'
import readdirp from 'readdirp'


const client = new OSS({
  region: 'oss-cn-hangzhou', // Endpoint（地域节点）取自 oss-cn-hangzhou.aliyuncs.com 
  accessKeyId: process.env.ACCESS_KEY_ID, // 通过变量传入
  accessKeySecret: process.env.ACCESS_KEY_SECRET,
  bucket: 'junjiang-cra' // 自己的 bucket
})


// objectName: static/css/main.079c3a.css
// withHash: 该文件名是否携带 hash 值
async function uploadFile (objectName, withHash = false) {
  const file = resolve('./build', objectName)
		// 带 hash 的缓存一年，否则设置为 no-cache
    const cacheControl = withHash ? 'max-age=31536000' : 'no-cache'
    // 为了加速传输速度，这里使用 stream
    await client.putStream(objectName, createReadStream(file), {
      headers: {
        'Cache-Control': cacheControl
      }
    })
    console.log(`Done: ${objectName}`)
}

async function main() {
  // 首先上传不带 hash 的文件
  for await (const entry of readdirp('./build', { depth: 0, type: 'files' })) {
    uploadFile(entry.path)
  }
  // 上传携带 hash 的文件
  for await (const entry of readdirp('./build/static', { type: 'files' })) {
    uploadFile(`static/${entry.path}`, true)
  }
}

main().catch(e => {
  console.error(e)
  process.exitCode = 1
})

```
我们执行`yarn oss:scripts`也能上传了。
## Dockerfile 与环境变量
由于 Dockerfile 是同代码一起进行管理，所以不能将敏感信息（AccessKey等）写入 Dockerfile。所以这里使用 ARG 作为变量传入。而 ARG 可通过 `docker build --build-arg`或者`docker-compose`进行传入。
```dockerfile
# /oss.Dockerfile

FROM node:14-alpine as builder

ARG ACCESS_KEY_ID
ARG ACCESS_KEY_SECRET
ARG ENDPOINT
# Bucket 域名
ENV PUBLIC_URL https://junjiang-cra.oss-cn-hangzhou.aliyuncs.com

WORKDIR /code

# 这个步骤内容跟前面在自己机器上的一样，这里为了更好的缓存，把它放在前边
RUN wget http://gosspublic.alicdn.com/ossutil/1.7.7/ossutil64 -O /usr/local/bin/ossutil \
  && chmod 755 /usr/local/bin/ossutil \
  && ossutil config -i $ACCESS_KEY_ID -k $ACCESS_KEY_SECRET -e $ENDPOINT

ADD package.json yarn.lock /code/
RUN yarn

ADD . /code
RUN npm run build && npm run oss:cli

FROM nginx:alpine
ADD nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=builder code/build /usr/share/nginx/html
```
## docker-compose 配置
在`docker-compose`配置文件中，通过`build.args`可对`Dockerfile`进行传参。
而`docker-compose.yaml`同样不能出现敏感数据，此时通过环境变量进行传参，在`build.args`中，默认从宿主机的同名环境变量中取值。（也就是会读取一开始设置的环境变量）
```yaml
version: "3"
services:
  oss:
    build:
      context: .
      dockerfile: oss.Dockerfile
      args:
        # 此处默认从宿主机(host)环境变量中传参，在宿主机中需要提前配置 ACCESS_KEY_ID/ACCESS_KEY_SECRET 环境变量
        - ACCESS_KEY_ID
        - ACCESS_KEY_SECRET
        - ENDPOINT=你的Endpoint
    ports:
      - 8000:80

```
执行`docker-compose`
```bash
$ docker-compose up --build oss
```
到 OSS中 可以看到资源都上传上去了，说明我们基于 docker 上传静态资源到 oss 中也是成功的

# 静态资源上传与空间优化
在上一节中，我们的前端项目持续跑了 N 年后，部署了上万次后，可能出现几种情况。

1. 时间过长。如构建后的资源全部上传到对象存储，然而**有些资源内容并未发生变更**，将会导致过多的上传时间。
2. 冗余资源。**前端每改一行代码，便会生成一个新的资源，而旧资源将会在 OSS 不断堆积，占用额外体积。** 从而导致更多的云服务费用。
## 静态资源上传优化：按需上传与并发控制
在前端构建过程中存在无处不在的缓存

1. 当源文件内容未发生更改时，将不会对 Module 重新使用 Loader 等进行重新编译。这是利用了 webpack5 的持久化缓存。
2. 当源文件内容未发生更改时，构建生成资源的 hash 将不会发生变更。此举有利于 HTTP 的 Long Term Cache。

那对比生成资源的哈希，如未发生变更，则不向 OSS 进行上传操作。**这一步将会提升静态资源上传时间，进而提升每一次前端部署的时间。**
**对于构建后含有 hash 的资源，对比文件名即可了解资源是否发生变更。**
**整体代码如下👇**
```javascript
import OSS from 'ali-oss'
import { createReadStream } from 'fs'
import { resolve } from 'path'
import readdirp from 'readdirp'
import PQueue from 'p-queue'

// 并发数 10
const queue = new PQueue({ concurrency: 10 })

const client = new OSS({
  region: 'oss-cn-hangzhou', // Endpoint（地域节点）取自 oss-cn-hangzhou.aliyuncs.com 
  accessKeyId: process.env.ACCESS_KEY_ID, // 读取环境变量
  accessKeySecret: process.env.ACCESS_KEY_SECRET,
  bucket: 'junjiang-cra' // 自己的 bucket
})

// 判断文件 (Object)是否在 OSS 中存在
// 对于带有 hash 的文件而言，如果存在该文件名，则在 OSS 中存在
// 对于不带有 hash 的文件而言，可对该 Object 设置一个 X-OSS-META-MTIME 或者 X-OSS-META-HASH 每次对比来判断该文件是否存在更改，本函数跳过
// 如果再严谨点，将会继续对比 header 之类
async function isExistObject (objectName) {
  try {
    await client.head(objectName)
    return true
  } catch (e) {
    return false
  }
}

// objectName: static/css/main.079c3a.css
// withHash: 该文件名是否携带 hash 值
async function uploadFile (objectName, withHash = false) {
  const file = resolve('./build', objectName)
  // 如果路径名称不带有 hash 值，则直接重新上传，不用判断文件是否在 OSS 中存在
  const exist = withHash ? await isExistObject(objectName) : false
  if (!exist) {
		// 带 hash 的缓存一年，否则设置为 no-cache
    const cacheControl = withHash ? 'max-age=31536000' : 'no-cache'
    // 为了加速传输速度，这里使用 stream
    await client.putStream(objectName, createReadStream(file), {
      headers: {
        'Cache-Control': cacheControl
      }
    })
    console.log(`Done: ${objectName}`)
  } else {
    // 如果该文件在 OSS 已存在，则跳过该文件 (Object)
    console.log(`Skip: ${objectName}`)
  }
}

async function main() {
  // 首先上传不带 hash 的文件
  for await (const entry of readdirp('./build', { depth: 0, type: 'files' })) {
    queue.add(() => uploadFile(entry.path))
    // uploadFile(entry.path)
  }
  // 上传携带 hash 的文件
  for await (const entry of readdirp('./build/static', { type: 'files' })) {
    queue.add(() => uploadFile(`static/${entry.path}`, true))
    // uploadFile(`static/${entry.path}`, true)
  }
}

main().catch(e => {
  console.error(e)
  process.exitCode = 1
})
```
在这段代码中我们做了如下优化：

1. 我们利用了`isExistObject`来判断（带hash）资源是否在`OSS`中，如果存在则跳过，否则上传。
2. 根据是否带有hash值来设置关于缓存的响应头
3. 通过`p-queue`控制资源上传的并发量。

利用自定义脚本可以做到大部分`yarn oss:cli`做不到的优化效果。
修改某个文件`yarn build`后执行`yarn oss:script`可以看到只上传了修改的文件以及不带 hash 的文件。
## Rclone：按需上传
在我们上一版优化中，不带 hash 的文件无论你修改与否，都会被直接上传，也属于一种浪费，我们可以利用Rclone 来优化，`rsync for cloud storage`。
Rclone 是实用Go语言编写的一款高性能云文件同步的命令行工具，可理解为更高级的 ossutil。
它支持以下功能：

1. 按需复制，每次仅仅复制更改的文件
2. 断点续传
3. 压缩传输

安装文档在这里[👉 安装文档](https://www.rclone.cn/document/%E5%AE%89%E8%A3%85rclone%E6%96%B9%E6%B3%95/) 。可以根据自己的需求选择安装方式。安装完成以后，需要进行配置，（我们这里选择的是阿里的OSS）根据这个[👉配置文档](https://rclone.org/s3/#alibaba-oss) 进行配置即可。（如果你是其他的存储方式也可以在文档中找到对应的选择方式）
```bash
# 将资源上传到 OSS Bucket
# alioss: 通过 rclone 配置的云存储名称，此处为阿里云的 oss，个人取名为 alioss
# junjiang-cra: oss 中的 bucket 名称
$ rclone copy --exclude 'static/**' --header 'Cache-Control: no-cache' build alioss:/junjiang-cra --progress 

# 将带有 hash 资源上传到 OSS Bucket，并且配置长期缓存
$ rclone copy --header  'Cache-Control: max-age=31536000' build/static alioss:/junjiang-cra/static --progress
```
将这两条命令维护的到`npm scripts`中
```json
{
  "scripts": {
    "oss:rclone": "rclone copy --exclude 'static/**' --header 'Cache-Control: no-cache' build alioss:/junjiang-cra --progress && rclone copy --header  'Cache-Control: max-age=31536000' build/static alioss:/junjiang-cra/static --progress"
  }
}
```
## 删除OSS中冗余资源
在生产环境中，OSS 只需保留最后一次线上环境所依赖的资源。（多版本共存情况下除外）
此时可根据 OSS 中所有资源与最后一次构建生成的资源一一对比文件名，进行删除。
```javascript
async function getCurrentFiles() {
  // ...
}

async function getAllObjects() {
  // ...
}

async function main() {
  const files = await getCurrentFiles()
  const objects = await getAllObjects()
  for (const object of objects) {
    if (!files.includes(object.name)) {
      await client.delete(object.name)
      console.log(`Delete: ${object.name}`)
    }
  }
}
```
维护到`npm scripts`中
```json
{
  "scripts": {
    "oss:prune": "node scripts/deleteOSS.mjs"
  }
}
```
那么每次部署完以后执行这个命令将多余的文件删除掉即可。

