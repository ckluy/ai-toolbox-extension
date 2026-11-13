import { spawn } from 'node:child_process'
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const sourceDir = dirname(fileURLToPath(import.meta.url))
const root = resolve(sourceDir, '..', '..')
const outputDir = resolve(sourceDir, '..')
const port = Number(process.env.CDP_PORT || 9444)
const edgePath = process.env.EDGE_PATH || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'
const profileDir = resolve(process.env.TEMP || '.', `ai-toolbox-store-${Date.now()}`)

const popupScenes = {
  overview: {
    setup: `
      switchAction('summary');
      elements.inputArea.value = '2026 年第三季度产品复盘：新增用户 12.4 万，环比增长 18%，主要来自搜索与内容分享。付费转化率提升至 4.7%，但第 7 日留存下降到 31%。下季度优先优化新手引导，并验证团队版定价。';
      updateCharCount();
      displayResult({
        action: 'summary',
        model: 'qwen-plus',
        usage: { total_tokens: 842 },
        text: '核心结论\\n• 新增用户 12.4 万，环比 +18%，主要来自搜索与内容分享。\\n• 付费转化率升至 4.7%，但 7 日留存降至 31%。\\n• 下季度优先优化新手引导，并验证团队版定价。'
      });
      setStatus('处理完成。', 'success');
    `
  },
  polish: {
    setup: `
      switchAction('polish');
      elements.polishStyle.value = '营销文案';
      elements.inputArea.value = '我们的新品可以帮你快速整理思路、打磨文案，让每一次表达都更清晰、更有感染力。';
      updateCharCount();
      displayResult({
        action: 'polish',
        polishStyle: '营销文案',
        model: 'qwen-plus',
        usage: { total_tokens: 516 },
        text: '把灵感变成作品，只需一句话。\\n全新 AI 创作助手，帮你快速整理思路、打磨文案、生成内容。现在开始，让每一次表达都更有力量。'
      });
      setStatus('处理完成。', 'success');
    `
  },
  reply: {
    setup: `
      switchAction('reply');
      elements.replyTone.value = '友好亲切';
      elements.inputArea.value = '客户：这周临时有安排，原定周五的沟通可能要改期，抱歉。';
      updateCharCount();
      displayResult({
        action: 'reply',
        replyTone: '友好亲切',
        model: 'qwen-turbo',
        usage: { total_tokens: 438 },
        text: '没问题，这周的安排可以往后顺延。你先安心处理事情，等方便时告诉我新的时间，我再提前准备好资料。期待下次见面！'
      });
      setStatus('处理完成。', 'success');
    `
  },
  devtools: {
    setup: `
      switchAction('debug');
      elements.inputArea.value = 'TypeError: Cannot read properties of undefined (reading \\'map\\')\\n    at renderList (app.js:42:18)\\n\\nconst rows = items.map(item => createRow(item));';
      updateCharCount();
      displayResult({
        action: 'debug',
        model: 'qwen-plus',
        usage: { total_tokens: 693 },
        text: '根因：items 在首次渲染时为 undefined，renderList 直接调用了 items.map。\\n排查：检查接口返回结构，确认 items 字段存在且为数组。\\n修复：使用 const list = Array.isArray(items) ? items : []，再进行渲染。'
      });
      setStatus('处理完成。', 'success');
    `
  },
  settings: {
    setup: `
      switchAction('summary');
      toggleSettings(true);
      elements.apiKeyInput.value = 'sk-demo000000000000000000000000';
      elements.modelSelect.value = 'qwen-plus';
      state.hasApiKey = true;
      setStatus('设置已保存。', 'success');
    `
  }
}

const popupFiles = {
  overview: 'popup-overview.png',
  polish: 'popup-polish.png',
  reply: 'popup-reply.png',
  devtools: 'popup-devtools.png',
  settings: 'popup-settings.png'
}

const finals = [
  ['composer.html?scene=overview', 'screenshot-01-overview-1280x800.png', 1280, 800],
  ['composer.html?scene=polish', 'screenshot-02-polish-1280x800.png', 1280, 800],
  ['composer.html?scene=reply', 'screenshot-03-reply-1280x800.png', 1280, 800],
  ['composer.html?scene=devtools', 'screenshot-04-devtools-1280x800.png', 1280, 800],
  ['composer.html?scene=privacy', 'screenshot-05-privacy-1280x800.png', 1280, 800],
  ['icon-300.html', 'store-icon-300x300.png', 300, 300]
]

class CdpClient {
  constructor(url) {
    this.url = url
    this.nextId = 0
    this.pending = new Map()
  }

  async connect() {
    this.socket = new WebSocket(this.url)
    this.socket.addEventListener('message', (event) => {
      const message = JSON.parse(typeof event.data === 'string' ? event.data : String(event.data))
      if (!message.id || !this.pending.has(message.id)) return
      const { resolve: done, reject } = this.pending.get(message.id)
      this.pending.delete(message.id)
      if (message.error) reject(new Error(`${message.error.message} (${message.error.code})`))
      else done(message.result || {})
    })
    await new Promise((done, reject) => {
      this.socket.addEventListener('open', done, { once: true })
      this.socket.addEventListener('error', () => reject(new Error('CDP WebSocket connection failed')), { once: true })
    })
  }

  send(method, params = {}) {
    const id = ++this.nextId
    return new Promise((done, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id)
        reject(new Error(`CDP timeout: ${method}`))
      }, 15000)
      this.pending.set(id, {
        resolve: (value) => { clearTimeout(timer); done(value) },
        reject: (error) => { clearTimeout(timer); reject(error) }
      })
      this.socket.send(JSON.stringify({ id, method, params }))
    })
  }

  close() {
    this.socket?.close()
  }
}

async function waitForHttp(url, timeout = 20000) {
  const started = Date.now()
  while (Date.now() - started < timeout) {
    try {
      const response = await fetch(url)
      if (response.ok) return await response.json()
    } catch {}
    await delay(250)
  }
  throw new Error(`Timed out waiting for ${url}`)
}

async function waitForExtensionTargets(timeout = 20000) {
  const started = Date.now()
  while (Date.now() - started < timeout) {
    try {
      const targets = await waitForHttp(`http://127.0.0.1:${port}/json/list`, 2000)
      const worker = targets.find((target) => target.type === 'service_worker' && target.url.includes('/background.js'))
      const page = targets.find((target) => target.type === 'page')
      if (worker && page) return { worker, page }
    } catch {}
    await delay(250)
  }
  throw new Error('Extension service worker or page target not found')
}

function delay(ms) {
  return new Promise((done) => setTimeout(done, ms))
}

async function evaluate(client, expression) {
  const result = await client.send('Runtime.evaluate', {
    expression,
    awaitPromise: true,
    returnByValue: true
  })
  if (result.exceptionDetails) {
    throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text)
  }
  return result.result?.value
}

async function waitFor(client, expression, timeout = 10000) {
  const started = Date.now()
  while (Date.now() - started < timeout) {
    if (await evaluate(client, expression)) return
    await delay(100)
  }
  throw new Error(`Timed out waiting for: ${expression}`)
}

async function setViewport(client, width, height) {
  await client.send('Emulation.setDeviceMetricsOverride', {
    width,
    height,
    deviceScaleFactor: 1,
    mobile: false,
    screenWidth: width,
    screenHeight: height
  })
}

async function capture(client, file) {
  const result = await client.send('Page.captureScreenshot', {
    format: 'png',
    fromSurface: true,
    captureBeyondViewport: false
  })
  await writeFile(file, Buffer.from(result.data, 'base64'))
}

async function navigate(client, url) {
  await client.send('Page.navigate', { url })
}

const edge = spawn(edgePath, [
  '--headless=new',
  `--remote-debugging-port=${port}`,
  `--user-data-dir=${profileDir}`,
  '--no-first-run',
  '--no-default-browser-check',
  '--disable-features=msEdgeFirstRunExperience',
  `--disable-extensions-except=${root}`,
  `--load-extension=${root}`,
  'about:blank'
], { stdio: 'ignore', windowsHide: true })

let pageClient
let browserClient

try {
  const version = await waitForHttp(`http://127.0.0.1:${port}/json/version`)
  const { worker, page } = await waitForExtensionTargets()

  const extensionId = new URL(worker.url).host
  pageClient = new CdpClient(page.webSocketDebuggerUrl)
  await pageClient.connect()
  await pageClient.send('Page.enable')
  await pageClient.send('Runtime.enable')
  await setViewport(pageClient, 420, 680)

  for (const [scene, config] of Object.entries(popupScenes)) {
    await navigate(pageClient, `chrome-extension://${extensionId}/popup.html`)
    await waitFor(pageClient, "document.readyState === 'complete' && typeof switchAction === 'function'")
    await evaluate(pageClient, "document.getElementById('demoStyle') || document.head.appendChild(Object.assign(document.createElement('style'), { id: 'demoStyle', textContent: '::-webkit-scrollbar{display:none!important}body{min-height:0!important;padding-bottom:10px!important}.footer-hint{display:none!important}textarea{min-height:92px!important;max-height:92px!important}.output{min-height:112px!important;max-height:112px!important}.status{min-height:15px!important;margin:2px 2px 6px!important}.actions .btn{min-height:36px!important}' }))")
    await evaluate(pageClient, config.setup)
    if (scene !== 'settings') await evaluate(pageClient, 'toggleSettings(false)')
    await evaluate(pageClient, 'document.fonts.ready.then(() => new Promise((done) => setTimeout(done, 250)))')
    await capture(pageClient, resolve(sourceDir, popupFiles[scene]))
    console.log(`Popup: ${popupFiles[scene]}`)
  }

  for (const [file, output, width, height] of finals) {
    const [htmlFile, query] = file.split('?')
    const url = pathToFileURL(resolve(sourceDir, htmlFile)).href + (query ? `?${query}` : '')
    await navigate(pageClient, url)
    await waitFor(pageClient, "document.readyState === 'complete'")
    await waitFor(pageClient, "document.body.dataset.ready === 'true' || !document.querySelector('img#screenshot')")
    await evaluate(pageClient, 'document.fonts.ready.then(() => new Promise((done) => setTimeout(done, 250)))')
    await setViewport(pageClient, width, height)
    await evaluate(pageClient, 'new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done)))')
    await capture(pageClient, resolve(outputDir, output))
    console.log(`Final: ${output}`)
  }

  browserClient = new CdpClient(version.webSocketDebuggerUrl)
  await browserClient.connect()
  await browserClient.send('Browser.close')
} catch (error) {
  edge.kill()
  throw error
} finally {
  pageClient?.close()
  browserClient?.close()
}

