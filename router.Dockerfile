####### 对于单页面路由访问存在问题
# FROM node:14-alpine as builder

# WORKDIR /code

# # 单独分离 package.json，是为了安装依赖可最大限度利用缓存
# ADD package.json yarn.lock /code/
# # 此时 yarn 可以利用缓存，如果 yarn.lock 内容没有变化，则不会重新安装依赖
# RUN yarn

# ADD . /code
# RUN npm run build

# # 选择更小体积的基础镜像
# FROM nginx:alpine
# COPY --from=builder code/build /usr/share/nginx/html


###### 通过使用 nginx 配置解决服务端路由问题，并提供了静态资源缓存能力
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