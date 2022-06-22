# 原本的构建方式需要每次都运行 yarn 安装依赖
# FROM node:14-alpine

# WORKDIR /code

# ADD . /code
# RUN yarn && npm run build

# CMD npx serve -s build
# EXPOSE 3000


######## 构建时间优化：构建缓存
# FROM node:14-alpine

# WORKDIR /code

# # 单独分离 package.json 可以利用缓存
# ADD package.json yarn.lock /code/
# # 此时 yarn 可以利用缓存，如果 yarn.lock 内容没有变化，则不会重新安装依赖
# RUN yarn

# ADD . /code/
# RUN npm run build

# CMD npx serve -s build
# EXPOSE 3000

####### 构建体积优化：多阶段构建
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
