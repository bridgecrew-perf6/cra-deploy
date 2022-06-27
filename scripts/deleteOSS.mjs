import OSS from 'ali-oss'
import readdirp from 'readdirp'

const client = new OSS({
  region: 'oss-cn-hangzhou', // Endpoint（地域节点）取自 oss-cn-hangzhou.aliyuncs.com 
  accessKeyId: process.env.ACCESS_KEY_ID, // 通过变量传入
  accessKeySecret: process.env.ACCESS_KEY_SECRET,
  bucket: 'junjiang-cra' // 自己的 bucket
})

async function getCurrentFiles() {
	const files = []
	for await(const entry of readdirp('./build', { type: 'files' })) {
		files.push(entry.path)
	}
	return files
}

async function getAllObjects() {
	let res = []
	async function walk(cursor = null) {
		const { objects, continuationToken } = await client.listV2({
			'max-keys': 160,
			'continuation-token': cursor
		})
		res = [...res, ...objects]
		if (continuationToken) {
			await walk(continuationToken)
		}
	}
	await walk()
	return res
}

// 列举出来最新被使用到的文件: 即当前目录
// 列举出来 OSS 上的所有文件，遍历判断该文件是否在当前目录，如果不在，则删除
async function main() {
  const files = await getCurrentFiles()
  const objects = await getAllObjects()
  for (const object of objects) {
    // 如果当前目录中不存在该文件，则该文件可以被删除
    if (!files.includes(object.name)) {
      await client.delete(object.name)
      console.log(`Delete: ${object.name}`)
    }
  }
}

main().catch(e => {
  console.error(e)
  process.exitCode = 1
})