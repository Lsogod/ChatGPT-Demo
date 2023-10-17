import { Index, Show, createEffect, createSignal, onCleanup, onMount } from 'solid-js'
import { useThrottleFn } from 'solidjs-use'
import axios from 'axios'
import Cropper from 'cropperjs'
import { generateSignature } from '@/utils/auth'
import IconClear from './icons/Clear'
import IconCamera from './icons/Camera'
import MessageItem from './MessageItem'
import SystemRoleSettings from './SystemRoleSettings'
import ErrorMessageItem from './ErrorMessageItem'
import type React from 'react'
import type { ChatMessage, ErrorMessage } from '@/types'
import 'cropperjs/dist/cropper.css' // 导入 react-cropper 的 CSS

export default () => {
  // 引用输入框和文件输入的DOM元素
  let inputRef: HTMLTextAreaElement
  let fileInputRef: HTMLInputElement

  // 创建状态变量，用于跟踪各种组件状态
  const [imagePreviewUrl, setImagePreviewUrl] = createSignal<string | null>(null) // 图片预览URL
  const [setSelectedImage] = createSignal<File | null>(null) // 选择的图像文件
  const [recognizedText, setRecognizedText] = createSignal<string | null>(null) // 识别的文本
  const [currentSystemRoleSettings, setCurrentSystemRoleSettings] = createSignal('') // 当前系统角色设置
  const [systemRoleEditing, setSystemRoleEditing] = createSignal(false) // 是否正在编辑系统角色
  const [messageList, setMessageList] = createSignal<ChatMessage[]>([]) // 消息列表
  const [currentError, setCurrentError] = createSignal<ErrorMessage>() // 当前错误信息
  const [currentAssistantMessage, setCurrentAssistantMessage] = createSignal('') // 当前助手消息
  const [loading, setLoading] = createSignal(false) // 加载状态
  const [controller, setController] = createSignal<AbortController>(null) // 控制器
  const [isStick, setStick] = createSignal(false) // 是否粘贴到底部
  const [temperature, setTemperature] = createSignal(0.6) // 温度设置
  const [cropper, setCropper] = createSignal<Cropper | null>(null)
  // 设置温度的函数
  const temperatureSetting = (value: number) => { setTemperature(value) }
  // 获取最大历史消息数（从环境变量中读取）
  const maxHistoryMessages = parseInt(import.meta.env.PUBLIC_MAX_HISTORY_MESSAGES || '9')

  // 当 isStick 状态变化时，平滑滚动到底部
  createEffect(() => (isStick() && smoothToBottom()))

  // 处理文件上传事件
  const handleFileUpload = async(e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files[0]
    if (file) {
      const reader = new FileReader()
      reader.onloadend = async() => {
        // 读取上传的图片文件并将其转换为 base64 编码的数据
        const imgData = reader.result as string

        // 创建新的 Cropper 实例
        const imageElement = document.getElementById('image-preview')
        if (imageElement) {
          if (cropper()) {
            // 如果已经存在 Cropper 实例，销毁它
            cropper().destroy()
          }
          // 设置预览图像和选择的图像
          setImagePreviewUrl(imgData)
          setSelectedImage(file)
          const cropperInstance = new Cropper(imageElement, {
            aspectRatio: NaN,
            viewMode: 1,
            autoCrop: true,
          })
          setCropper(cropperInstance)
        }
      }
      reader.readAsDataURL(file)
      // setRecognizedText(null)
    }
  }

  const handleSaveAndUpload = async() => {
    if (!cropper()) {
      // 如果没有 Cropper 实例，不执行任何操作
      return
    }

    // 获取裁剪后的图像数据
    const croppedCanvas = cropper().getCroppedCanvas()
    const croppedImageData = croppedCanvas.toDataURL('image/jpeg') // 以JPEG格式获取图像数据

    try {
      const data = {
        img: croppedImageData,
      }
      // 调用 requestWithOCR 函数
      requestWithOCR(data)

      // 这里可以使用 ocrResponse 变量来访问响应的 JSON 数据
      // console.log(ocrResponse)
      //   const response = await axios.post('https://shouxiegen.market.alicloudapi.com/ocrservice/shouxie', data, { headers })
      // console.log(response)

      // 处理识别结果，设置识别的文本或其他操作

      // 可以在这里添加上传成功的提示或其他逻辑
    } catch (error) {
      console.error(error)
      // 处理上传失败的情况
      throw new Error('Image upload and recognition failed.')
    }
  }

  // 清除 Cropper 实例
  onCleanup(() => {
    if (cropper()) {
      cropper().destroy()
      setCropper(null)
    }
  })

  // 在组件挂载时执行的操作
  onMount(() => {
    let lastPostion = window.scrollY

    // 监听滚动事件，处理粘贴到底部
    window.addEventListener('scroll', () => {
      const nowPostion = window.scrollY
      nowPostion < lastPostion && setStick(false)
      lastPostion = nowPostion
    })

    try {
      // 从会话存储中恢复消息列表和系统角色设置
      if (sessionStorage.getItem('messageList'))
        setMessageList(JSON.parse(sessionStorage.getItem('messageList')))

      if (sessionStorage.getItem('systemRoleSettings'))
        setCurrentSystemRoleSettings(sessionStorage.getItem('systemRoleSettings'))

      // 恢复粘贴到底部状态
      if (localStorage.getItem('stickToBottom') === 'stick')
        setStick(true)
    } catch (err) {
      console.error(err)
    }

    // 在组件卸载前处理存储和事件监听
    window.addEventListener('beforeunload', handleBeforeUnload)
    onCleanup(() => {
      window.removeEventListener('beforeunload', handleBeforeUnload)
    })
  })

  // 处理页面关闭前的存储
  const handleBeforeUnload = () => {
    sessionStorage.setItem('messageList', JSON.stringify(messageList()))
    sessionStorage.setItem('systemRoleSettings', currentSystemRoleSettings())
    isStick() ? localStorage.setItem('stickToBottom', 'stick') : localStorage.removeItem('stickToBottom')
  }

  // 处理点击"Send"按钮事件
  const handleButtonClick = async() => {
    const inputValue = inputRef.value
    if (!inputValue)
      return

    inputRef.value = ''
    setMessageList([
      ...messageList(),
      {
        role: 'user',
        content: inputValue,
      },
    ])
    requestWithLatestMessage()
    instantToBottom()
    setRecognizedText('')
  }

  // 平滑滚动到页面底部
  const smoothToBottom = useThrottleFn(() => {
    window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' })
  }, 300, false, true)

  // 瞬间滚动到页面底部
  const instantToBottom = () => {
    window.scrollTo({ top: document.body.scrollHeight, behavior: 'instant' })
  }

  // 定义一个名为 requestWithOCR 的异步函数，该函数接受一个参数 ocrData
  const requestWithOCR = async(ocrData) => {
    // 使用 try-catch 结构来捕获可能出现的错误
    try {
      // 使用 fetch 函数向 '/api/ocr' 发起一个 HTTP POST 请求，同时将 ocrData 对象转换为 JSON 字符串后作为请求体发送
      const response = await fetch('/api/ocr', {
        method: 'POST', // 指定请求方法为 POST
        body: JSON.stringify(ocrData), // 将 ocrData 对象转为 JSON 字符串并作为请求体发送
      })

      // 检查服务器响应的状态码是否为 200-299 之间，如果不是，说明请求失败
      if (!response.ok) {
        // 如果响应不成功，则尝试将响应体转换为 JSON 格式，同时将错误信息打印到控制台，并设置当前错误信息
        const error = await response.json()
        console.error(error.error)
        setCurrentError(error.error)
        throw new Error('Request failed') // 抛出一个新的错误以进一步处理
      }

      // 使用 json() 方法将响应体转换为 JSON 数据
      // 如果响应成功，使用 json() 方法获取响应的 JSON 数据
      const data = await response.json()

      // 根据返回的 JSON 数据，设置识别的文本或其他相关操作，这部分根据具体业务逻辑进行实现
      setRecognizedText(data.content) // 根据数据内容设置已识别的文本

    // 在这里可以添加处理成功后的逻辑，例如上传成功的提示等
    // ...成功逻辑
    } catch (error) {
    // 如果在上述过程中出现任何错误，将错误信息打印到控制台，并抛出该错误以进行进一步处理
      console.error('RequestWithOCR error:', error)
      throw error // 抛出错误以进行进一步处理
    }
  }
  // 发送包含最新消息的请求
  const requestWithLatestMessage = async() => {
    setLoading(true)
    setCurrentAssistantMessage('')
    setCurrentError(null)
    const storagePassword = localStorage.getItem('pass')
    try {
      const controller = new AbortController()
      setController(controller)
      const requestMessageList = messageList().slice(-maxHistoryMessages)
      if (currentSystemRoleSettings()) {
        requestMessageList.unshift({
          role: 'system',
          content: currentSystemRoleSettings(),
        })
      }
      const timestamp = Date.now()
      const response = await fetch('/api/generate', {
        method: 'POST',
        body: JSON.stringify({
          messages: requestMessageList,
          time: timestamp,
          pass: storagePassword,
          sign: await generateSignature({
            t: timestamp,
            m: requestMessageList?.[requestMessageList.length - 1]?.content || '',
          }),
          temperature: temperature(),
        }),
        signal: controller.signal,
      })
      if (!response.ok) {
        const error = await response.json()
        console.error(error.error)
        setCurrentError(error.error)
        throw new Error('Request failed')
      }
      const data = response.body
      if (!data)
        throw new Error('No data')

      const reader = data.getReader()
      const decoder = new TextDecoder('utf-8')
      let done = false

      while (!done) {
        const { value, done: readerDone } = await reader.read()
        if (value) {
          const char = decoder.decode(value)
          if (char === '\n' && currentAssistantMessage().endsWith('\n'))
            continue

          if (char)
            setCurrentAssistantMessage(currentAssistantMessage() + char)

          isStick() && instantToBottom()
        }
        done = readerDone
      }
    } catch (e) {
      console.error(e)
      setLoading(false)
      setController(null)
      return
    }
    archiveCurrentMessage()
    isStick() && instantToBottom()
  }

  // 存档当前消息
  const archiveCurrentMessage = () => {
    if (currentAssistantMessage()) {
      setMessageList([
        ...messageList(),
        {
          role: 'assistant',
          content: currentAssistantMessage(),
        },
      ])
      setCurrentAssistantMessage('')
      setLoading(false)
      setController(null)
      // 禁用触摸设备上的自动焦点
      if (!('ontouchstart' in document.documentElement || navigator.maxTouchPoints > 0))
        inputRef.focus()
    }
  }

  // 清除消息
  const clear = () => {
    inputRef.value = ''
    inputRef.style.height = 'auto'
    setMessageList([])
    setCurrentAssistantMessage('')
    setCurrentError(null)
  }

  // 停止流请求
  const stopStreamFetch = () => {
    if (controller()) {
      controller().abort()
      archiveCurrentMessage()
    }
  }

  // 重试最后一次请求
  const retryLastFetch = () => {
    if (messageList().length > 0) {
      const lastMessage = messageList()[messageList().length - 1]
      if (lastMessage.role === 'assistant')
        setMessageList(messageList().slice(0, -1))
      requestWithLatestMessage()
    }
  }

  // 处理键盘按键事件
  const handleKeydown = (e: KeyboardEvent) => {
    if (e.isComposing || e.shiftKey)
      return

    if (e.key === 'Enter') {
      e.preventDefault()
      handleButtonClick()
    }
  }

  return (
    <div my-6>
      {/* 系统角色设置 */}
      <SystemRoleSettings
        canEdit={() => messageList().length === 0}
        systemRoleEditing={systemRoleEditing}
        setSystemRoleEditing={setSystemRoleEditing}
        currentSystemRoleSettings={currentSystemRoleSettings}
        setCurrentSystemRoleSettings={setCurrentSystemRoleSettings}
        temperatureSetting={temperatureSetting}
      />
      {/* 消息列表 */}
      <Index each={messageList()}>
        {(message, index) => (
          <MessageItem
            role={message().role}
            message={message().content}
            showRetry={() => (message().role === 'assistant' && index === messageList().length - 1)}
            onRetry={retryLastFetch}
          />
        )}
      </Index>
      {/* 当前助手消息 */}
      {currentAssistantMessage() && (
        <MessageItem
          role="assistant"
          message={currentAssistantMessage}
        />
      )}
      {/* 当前错误信息 */}
      {currentError() && <ErrorMessageItem data={currentError()} onRetry={retryLastFetch} />}
      {/* 输入框和文件上传 */}
      <Show
        when={!loading()}
        fallback={() => (
          <div class="gen-cb-wrapper">
            <span>AI is thinking...</span>
            <div class="gen-cb-stop" onClick={stopStreamFetch}>Stop</div>
          </div>
        )}
      >
        <div class="gen-text-wrapper" class:op-50={systemRoleEditing()}>
          <textarea
            ref={inputRef!}
            disabled={systemRoleEditing()}
            onKeyDown={handleKeydown}
            placeholder="Enter something..."
            autoComplete="off"
            autoFocus
            onInput={() => {
              inputRef.style.height = 'auto'
              inputRef.style.height = `${inputRef.scrollHeight}px`
            }}
            rows="6" // 增加行数以容纳更多的文本
            class="gen-textarea"
            value={recognizedText() || ''} // 使用 recognizedText 作为 textarea 的值
            onChange={(e) => {
              // 如果文本发生更改，将 recognizedText 更新为用户输入的值
              setRecognizedText(e.target.value)
            }}
          />

          <button
            title="Camera"
            onClick={() => {
              // 打开文件选择对话框
              if (fileInputRef) fileInputRef.click()
            }}
            disabled={systemRoleEditing()}
            gen-slate-btn
          >
            <IconCamera />
          </button>
          {/* 渲染图片预览 */}
          {imagePreviewUrl && (
            <div>
              <img
                id="image-preview"
                src={imagePreviewUrl()}
                alt="Selected"
                style={{ display: 'none' }} // 设置图片的最大宽度和高度
              />
            </div>
          )}
          <input
            type="file"
            accept="image/*"
            onChange={(e) => {
              // 处理图像上传
              handleFileUpload(e)
            }}
            style={{ display: 'none' }}
            ref={fileInputRef}
          />
          {imagePreviewUrl()
            ? (
              <button
                style={{ display: imagePreviewUrl() ? 'block' : 'none' }}
                onClick={handleSaveAndUpload}
                disabled={!imagePreviewUrl()}
                gen-slate-btn
              >
                Scan
              </button>
              )
            : null}
          <button onClick={handleButtonClick} disabled={systemRoleEditing()} gen-slate-btn>
            Send
          </button>
          <button title="Clear" onClick={clear} disabled={systemRoleEditing()} gen-slate-btn>
            <IconClear />
          </button>
        </div>
      </Show>
      {/* 粘贴到底部按钮 */}
      <div class="fixed bottom-5 left-5 rounded-md hover:bg-slate/10 w-fit h-fit transition-colors active:scale-90" class:stick-btn-on={isStick()}>
        <div>
          <button class="p-2.5 text-base" title="stick to bottom" type="button" onClick={() => setStick(!isStick())}>
            <div i-ph-arrow-line-down-bold />
          </button>
        </div>
      </div>
    </div>
  )
}
