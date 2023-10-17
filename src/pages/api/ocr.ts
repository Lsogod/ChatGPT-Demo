// 引入所需的模块和依赖项
import { fetch } from 'undici' // 使用 undici 库来发起 HTTP 请求
import type { APIRoute } from 'astro' // 导入 Astro 框架的 APIRoute 类型

// 定义一个处理 POST 请求的 API 路由
export const post: APIRoute = async(context) => {
  // API 接口的目标 URL
  const url = 'https://shouxiegen.market.alicloudapi.com/ocrservice/shouxie'

  // 替换为您的授权码，通常从环境变量中获取
  const appcode = process.env.APP_CODE
  const headers = {
    'Authorization': `APPCODE ${appcode}`, // 设置请求头中的授权码
    'Content-Type': 'application/json; charset=UTF-8', // 设置请求头中的内容类型
  }

  // 从 POST 请求中提取图像数据（从请求体中获取 JSON 数据）
  const img = await context.request.json()

  // 提取 POST 请求的数据，这部分不变
  const body = {
    img: img.img, // 替换为实际的图像数据
    prob: false,
    charInfo: false,
    rotate: false,
    table: false,
    sortPage: false,
  }

  // 使用 fetch 发送 POST 请求
  const response = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(body), // 将请求体数据转换为 JSON 字符串
  })
    .then(async(response) => {
      if (response.ok) {
        const data = await response.json() // 解析响应的 JSON 数据
        return new Response(JSON.stringify(data), { headers: { 'Content-Type': 'application/json' } })
      } else {
        throw new Error('Network response was not ok')
      }
    })
    .catch((error) => {
      console.error('Fetch error:', error)
      // 返回一个包含错误信息的 JSON 响应
      return new Response(JSON.stringify({ error: 'Fetch error' }), { status: 500, headers: { 'Content-Type': 'application/json' } })
    })

  return response // 返回最终的 HTTP 响应
}
