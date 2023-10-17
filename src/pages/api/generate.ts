// 引入所需的模块和依赖项
import { ProxyAgent, fetch } from 'undici' // 使用 undici 库来发起 HTTP 请求
// #vercel-disable-blocks
// 请注意，以下代码块是为 Vercel 部署时禁用的，用于特定环境配置
// 例如，根据环境变量或部署需求来配置代理
// #vercel-end

import { generatePayload, parseOpenAIStream } from '@/utils/openAI' // 导入用于处理 OpenAI 数据的实用函数
import { verifySignature } from '@/utils/auth' // 导入用于验证签名的实用函数
import type { APIRoute } from 'astro' // 导入 Astro 框架的 APIRoute 类型

// 从环境变量中获取 OpenAI API 密钥、代理和基本 URL
const apiKey = process.env.API_KEY
const httpsProxy = import.meta.env.HTTPS_PROXY
const baseUrl = ((import.meta.env.OPENAI_API_BASE_URL) || 'https://api.openai.com').trim().replace(/\/$/, '')
const sitePassword = import.meta.env.SITE_PASSWORD || ''
const passList = sitePassword.split(',') || [] // 如果设置了站点密码，将其拆分为密码列表

// 定义一个处理 POST 请求的 API 路由
export const post: APIRoute = async(context) => {
  // 从请求体中提取 POST 请求的数据
  const body = await context.request.json()
  const { sign, time, messages, pass, temperature } = body

  // 检查是否存在输入文本
  if (!messages) {
    return new Response(JSON.stringify({
      error: {
        message: 'No input text.',
      },
    }), { status: 400 })
  }

  // 如果站点密码存在且与请求中的密码不匹配，返回错误响应
  if (sitePassword && !(sitePassword === pass || passList.includes(pass))) {
    return new Response(JSON.stringify({
      error: {
        message: 'Invalid password.',
      },
    }), { status: 401 })
  }

  // 如果在生产环境中，验证请求的签名是否有效
  if (import.meta.env.PROD && !await verifySignature({ t: time, m: messages?.[messages.length - 1]?.content || '' }, sign)) {
    return new Response(JSON.stringify({
      error: {
        message: 'Invalid signature.',
      },
    }), { status: 401 })
  }

  // 生成 OpenAI 请求的选项和数据
  const initOptions = generatePayload(apiKey, messages, temperature)

  // #vercel-disable-blocks
  // 如果配置了代理，使用 ProxyAgent 来设置代理
  if (httpsProxy)
    initOptions.dispatcher = new ProxyAgent(httpsProxy)
  // #vercel-end

  // 发起 OpenAI 请求并等待响应
  const response = await fetch(`${baseUrl}/v1/chat/completions`, initOptions).catch((err: Error) => {
    // 处理请求错误，返回适当的错误响应
    console.error(err)
    return new Response(JSON.stringify({
      error: {
        code: err.name,
        message: err.message,
      },
    }), { status: 500 })
  }) as Response

  // 解析 OpenAI 响应并返回
  return parseOpenAIStream(response) as Response
}
