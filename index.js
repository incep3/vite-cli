#! /usr/bin/env node
const koa = require('koa')
const send = require('koa-send')
const path = require('path')
const compilerSFC = require('@vue/compiler-sfc')
const { Readable } = require('stream')

const app = new koa()

const streamToString = (stream) =>
  new Promise((rs, rj) => {
    const chunks = []
    stream.on('data', (chunk) => chunks.push(chunk))
    stream.on('end', () => rs(Buffer.concat(chunks).toString('utf-8')))
    stream.on('error', rj)
  })

const stringToSteam = (text) => {
  const steam = new Readable()
  steam.push(text)
  steam.push(null)
  return steam
}

// 3. 加载第三方模块
app.use(async (ctx, next) => {
  // ctx.path --> /@modules/vue
  if (ctx.path.startsWith('/@modules/')) {
    const moduleName = ctx.path.substring(10)
    const pkgPath = path.join(
      process.cwd(),
      'node_modules',
      moduleName,
      'package.json'
    )
    const pkg = require(pkgPath)
    ctx.path = path.join('/node_modules', moduleName, pkg.module)
  }
  await next()
})

// 1. 静态文件服务器
app.use(async (ctx, next) => {
  await send(ctx, ctx.path, { root: process.cwd(), index: 'index.html' })
  await next()
})

// 4. 处理单文件组件
app.use(async (ctx, next) => {
  if (ctx.path.endsWith('.vue')) {
    const contents = await streamToString(ctx.body)
    const { descriptor } = compilerSFC.parse(contents)
    let code
    if (!ctx.query.type) {
      code = descriptor.script.content
      code = code.replace(/export\s+default\s+/g, 'const __script = ')
      code += `
      import { render as __render } from "${ctx.path}?type=template"
      __script.render = __render
      export default __script
      `
    } else if (ctx.query.type === 'template') {
      const templateRender = compilerSFC.compileTemplate({
        source: descriptor.template.content,
      })
      code = templateRender.code
    }
    ctx.type = 'application/javascript'
    ctx.body = stringToSteam(code)
  }
  await next()
})

// 2. 修改第三方模块的路径
app.use(async (ctx, next) => {
  if (ctx.type === 'application/javascript') {
    const contents = await streamToString(ctx.body)
    // import vue from 'vue'
    // import App from './App.vue'
    ctx.body = contents
      .replace(/(from\s+['"])(?![\.\/])/g, '$1/@modules/')
      .replace(/process\.env\.NODE_ENV/g, '"development"')
  }
  await next()
})

app.listen(3000)
console.log('Serer running @ http://localhost:3000')
