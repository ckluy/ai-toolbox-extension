const MAX_INPUT_CHARS = 50000
const DEFAULT_MODEL = 'qwen-turbo'
const ALLOWED_MODELS = new Set(['qwen-turbo', 'qwen-plus', 'qwen-max'])
const ALLOWED_LANGUAGES = new Set(['中文', 'English', '日本語', '한국어', 'Français', 'Deutsch', 'Español'])
const POLISH_STYLES = new Set(['正式专业', '活泼口语', '简洁干练', '营销文案', '学术严谨'])
const REPLY_TONES = new Set(['礼貌正式', '友好亲切', '简洁直接', '委婉拒绝'])
const ACTION_CONFIG = {
  summary: {
    label: '摘要',
    description: '提炼 3-5 个要点，保留数字、结论和限制条件。',
    placeholder: '粘贴要总结的长文、会议记录或文章...'
  },
  translate: {
    label: '翻译',
    description: '忠实翻译，只输出译文；可先选择目标语言。',
    placeholder: '粘贴要翻译的文本...'
  },
  polish: {
    label: '润色',
    description: '保持原意改写表达；可先选择润色风格。',
    placeholder: '粘贴要润色改写的文本...'
  },
  proofread: {
    label: '校对',
    description: '检查错别字、语法和标点，并给出修正版。',
    placeholder: '粘贴要检查错别字、语法和标点的文本...'
  },
  json: {
    label: 'JSON',
    description: '提取关键信息并格式化为 JSON，缺失值用 null。',
    placeholder: '粘贴要提取关键信息的文本...'
  },
  reply: {
    label: '回复',
    description: '根据消息生成可直接发送的回复；可先选择语气。',
    placeholder: '粘贴收到的消息，可附上关系、背景和回复目标...'
  },
  quiz: {
    label: '测验',
    description: '生成 3 道单选题和 2 道简答题，附答案解析。',
    placeholder: '粘贴教材、笔记或文章内容...'
  },
  faq: {
    label: 'FAQ',
    description: '根据介绍生成 5 个常见问题和详细解答。',
    placeholder: '粘贴产品、服务或项目介绍，信息越具体越好...'
  },
  code: {
    label: '代码',
    description: '解释代码逻辑和潜在问题，不会实际运行代码。',
    placeholder: '粘贴代码，可附上语言、运行环境和想了解的问题...'
  },
  debug: {
    label: '报错',
    description: '结合报错、堆栈和代码定位原因，并给出修复建议。',
    placeholder: '粘贴报错信息、调用堆栈和相关代码，越完整越准确...'
  }
}

const state = {
  action: 'summary',
  hasApiKey: false,
  busy: false,
  currentRequestId: null,
  sourceTabId: null,
  resultText: ''
}

const elements = {
  tabs: Array.from(document.querySelectorAll('.tab')),
  tabsContainer: document.getElementById('tabs'),
  settingBtn: document.getElementById('settingBtn'),
  settingPanel: document.getElementById('settingPanel'),
  toolDescription: document.getElementById('toolDescription'),
  apiKeyInput: document.getElementById('apiKeyInput'),
  modelSelect: document.getElementById('modelSelect'),
  saveKeyBtn: document.getElementById('saveKeyBtn'),
  clearKeyBtn: document.getElementById('clearKeyBtn'),
  targetRow: document.getElementById('targetRow'),
  targetLanguage: document.getElementById('targetLanguage'),
  polishStyleRow: document.getElementById('polishStyleRow'),
  polishStyle: document.getElementById('polishStyle'),
  replyToneRow: document.getElementById('replyToneRow'),
  replyTone: document.getElementById('replyTone'),
  inputArea: document.getElementById('inputArea'),
  charCount: document.getElementById('charCount'),
  fetchPageBtn: document.getElementById('fetchPageBtn'),
  clearInputBtn: document.getElementById('clearInputBtn'),
  sourceLabel: document.getElementById('sourceLabel'),
  outputArea: document.getElementById('outputArea'),
  resultMeta: document.getElementById('resultMeta'),
  status: document.getElementById('status'),
  copyBtn: document.getElementById('copyBtn'),
  runBtn: document.getElementById('runBtn'),
  cancelBtn: document.getElementById('cancelBtn')
}

document.addEventListener('DOMContentLoaded', init, { once: true })

async function init() {
  bindEvents()
  await loadSettings()
  updateActionUi(state.action)
  updateCharCount()

  const restoredPending = await consumePendingAction()
  if (!restoredPending) await restoreLastResult()
}

function bindEvents() {
  elements.tabs.forEach((tab) => {
    tab.addEventListener('click', () => {
      if (!state.busy) switchAction(tab.dataset.action)
    })
  })

  elements.tabsContainer.addEventListener('keydown', handleTabKeydown)
  elements.settingBtn.addEventListener('click', () => toggleSettings())
  elements.saveKeyBtn.addEventListener('click', saveSettings)
  elements.clearKeyBtn.addEventListener('click', clearApiKey)
  elements.runBtn.addEventListener('click', () => runProcessing())
  elements.cancelBtn.addEventListener('click', cancelProcessing)
  elements.copyBtn.addEventListener('click', copyResult)
  elements.clearInputBtn.addEventListener('click', clearInput)
  elements.fetchPageBtn.addEventListener('click', fetchCurrentPage)
  elements.targetLanguage.addEventListener('change', persistTargetLanguage)
  elements.polishStyle.addEventListener('change', persistPolishStyle)
  elements.replyTone.addEventListener('change', persistReplyTone)
  elements.inputArea.addEventListener('input', updateCharCount)

  document.addEventListener('keydown', (event) => {
    if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
      event.preventDefault()
      if (!state.busy) void runProcessing()
    }
  })
}

async function loadSettings() {
  try {
    const stored = await chrome.storage.local.get([
      'dashscope_api_key',
      'preferred_model',
      'target_language',
      'rewrite_style',
      'reply_tone'
    ])

    const apiKey = String(stored.dashscope_api_key || '').trim()
    state.hasApiKey = Boolean(apiKey)
    if (apiKey) elements.apiKeyInput.value = apiKey

    elements.modelSelect.value = ALLOWED_MODELS.has(stored.preferred_model)
      ? stored.preferred_model
      : DEFAULT_MODEL

    elements.targetLanguage.value = ALLOWED_LANGUAGES.has(stored.target_language)
      ? stored.target_language
      : '中文'

    elements.polishStyle.value = POLISH_STYLES.has(stored.rewrite_style)
      ? stored.rewrite_style
      : '正式专业'

    elements.replyTone.value = REPLY_TONES.has(stored.reply_tone)
      ? stored.reply_tone
      : '礼貌正式'
  } catch (error) {
    console.error('读取本地设置失败', error)
    openSettings()
    setStatus('读取本地设置失败，请重新打开插件后再试。', 'error')
    return
  }

  if (!state.hasApiKey) {
    openSettings()
    setStatus('请先填写 DashScope API Key，Key 只保存在本机。', 'info')
  }
}

async function consumePendingAction() {
  let response
  try {
    response = await sendMessage({ type: 'consumePendingAction' })
  } catch (error) {
    setStatus('无法读取右键菜单内容，请重新打开插件。', 'error')
    return false
  }

  const pending = response && response.ok ? response.pending : null
  if (!pending) return false

  if (ACTION_CONFIG[pending.action]) setAction(pending.action)
  elements.inputArea.value = String(pending.text || '')
  state.sourceTabId = Number.isInteger(pending.sourceTabId) ? pending.sourceTabId : null
  setSourceLabel(pending.sourceTitle, pending.sourceUrl)
  updateCharCount()

  if (!state.hasApiKey) {
    openSettings()
    setStatus('已载入选中文本，请先配置 API Key 再处理。', 'info')
    return true
  }

  await runProcessing()
  return true
}

async function restoreLastResult() {
  try {
    const response = await sendMessage({ type: 'getLastResult' })
    if (!response || !response.ok || !response.result) return

    const result = response.result
    if (ACTION_CONFIG[result.action]) setAction(result.action)
    if (result.action === 'polish' && POLISH_STYLES.has(result.polishStyle)) {
      elements.polishStyle.value = result.polishStyle
    }
    if (result.action === 'reply' && REPLY_TONES.has(result.replyTone)) {
      elements.replyTone.value = result.replyTone
    }
    displayResult(result)
    setStatus('已恢复最近一次处理结果。', 'info')
  } catch (error) {
    console.warn('恢复上次结果失败', error)
  }
}

function setAction(action, options = {}) {
  const nextAction = ACTION_CONFIG[action] ? action : 'summary'
  state.action = nextAction

  elements.tabs.forEach((tab) => {
    const active = tab.dataset.action === nextAction
    tab.classList.toggle('active', active)
    tab.setAttribute('aria-selected', String(active))
    tab.tabIndex = active ? 0 : -1
    if (active && options.focus) tab.focus()
  })

  elements.targetRow.hidden = nextAction !== 'translate'
  elements.polishStyleRow.hidden = nextAction !== 'polish'
  elements.replyToneRow.hidden = nextAction !== 'reply'
  elements.toolDescription.textContent = ACTION_CONFIG[nextAction].description
  elements.inputArea.placeholder = ACTION_CONFIG[nextAction].placeholder
}

function updateActionUi(action) {
  setAction(action)
}

function switchAction(action, options = {}) {
  const nextAction = ACTION_CONFIG[action] ? action : 'summary'
  if (nextAction === state.action) {
    setAction(nextAction, options)
    return
  }

  const hadData = hasWorkspaceData()
  clearWorkspace({ message: hadData ? '已清空上一项内容。' : '' })
  setAction(nextAction, options)
}

function hasWorkspaceData() {
  return Boolean(
    elements.inputArea.value.trim()
    || state.resultText
    || elements.sourceLabel.textContent
  )
}

function handleTabKeydown(event) {
  const keys = ['ArrowLeft', 'ArrowRight', 'Home', 'End']
  if (!keys.includes(event.key) || state.busy) return

  const currentIndex = elements.tabs.findIndex((tab) => tab.dataset.action === state.action)
  let nextIndex = currentIndex
  if (event.key === 'ArrowLeft') nextIndex = (currentIndex - 1 + elements.tabs.length) % elements.tabs.length
  if (event.key === 'ArrowRight') nextIndex = (currentIndex + 1) % elements.tabs.length
  if (event.key === 'Home') nextIndex = 0
  if (event.key === 'End') nextIndex = elements.tabs.length - 1

  event.preventDefault()
  switchAction(elements.tabs[nextIndex].dataset.action, { focus: true })
}

function toggleSettings(forceOpen) {
  const shouldOpen = typeof forceOpen === 'boolean'
    ? forceOpen
    : elements.settingPanel.hidden
  elements.settingPanel.hidden = !shouldOpen
  elements.settingBtn.setAttribute('aria-expanded', String(shouldOpen))
}

function openSettings() {
  toggleSettings(true)
}

async function saveSettings() {
  const apiKey = elements.apiKeyInput.value.trim()
  if (!apiKey) {
    openSettings()
    elements.apiKeyInput.focus()
    setStatus('请输入 DashScope API Key。', 'error')
    return
  }

  const model = ALLOWED_MODELS.has(elements.modelSelect.value)
    ? elements.modelSelect.value
    : DEFAULT_MODEL

  try {
    await chrome.storage.local.set({
      dashscope_api_key: apiKey,
      preferred_model: model
    })

    state.hasApiKey = true
    elements.apiKeyInput.value = apiKey
    toggleSettings(false)
    setStatus('设置已保存。', 'success')
  } catch (error) {
    console.error('保存设置失败', error)
    setStatus('保存设置失败，请重新打开插件后再试。', 'error')
  }
}

async function clearApiKey() {
  if (!state.hasApiKey) {
    elements.apiKeyInput.value = ''
    setStatus('当前没有保存 API Key。', 'info')
    return
  }

  if (!confirm('确定清除本机保存的 API Key 吗？')) return

  try {
    await chrome.storage.local.remove('dashscope_api_key')
    state.hasApiKey = false
    elements.apiKeyInput.value = ''
    openSettings()
    setStatus('API Key 已清除。', 'info')
  } catch (error) {
    console.error('清除 API Key 失败', error)
    setStatus('清除 API Key 失败，请重新打开插件后再试。', 'error')
  }
}

async function persistTargetLanguage() {
  try {
    await chrome.storage.local.set({ target_language: elements.targetLanguage.value })
  } catch (error) {
    console.warn('保存目标语言失败', error)
  }
  clearResultOnOptionChange('已切换翻译目标语言，请重新处理。')
}

async function persistPolishStyle() {
  try {
    await chrome.storage.local.set({ rewrite_style: elements.polishStyle.value })
  } catch (error) {
    console.warn('保存润色风格失败', error)
  }
  clearResultOnOptionChange('已切换润色风格，请重新处理。')
}

async function persistReplyTone() {
  try {
    await chrome.storage.local.set({ reply_tone: elements.replyTone.value })
  } catch (error) {
    console.warn('保存回复语气失败', error)
  }
  clearResultOnOptionChange('已切换回复语气，请重新处理。')
}

async function runProcessing() {
  if (state.busy) return

  const text = elements.inputArea.value.trim()
  if (!text) {
    setStatus('请先输入要处理的文本。', 'error')
    elements.inputArea.focus()
    return
  }
  if (text.length > MAX_INPUT_CHARS) {
    setStatus(`文本超过 ${formatNumber(MAX_INPUT_CHARS)} 字，请缩短后再试。`, 'error')
    elements.inputArea.focus()
    return
  }
  if (!state.hasApiKey) {
    openSettings()
    elements.apiKeyInput.focus()
    setStatus('请先配置 DashScope API Key。', 'error')
    return
  }

  const requestId = createId()
  state.currentRequestId = requestId
  setBusy(true)
  setOutputPlaceholder('正在处理，请稍候...')
  setStatus('正在请求模型...', 'info')

  try {
    const response = await sendMessage({
      type: 'processText',
      payload: {
        requestId,
        text,
        action: state.action,
        model: elements.modelSelect.value,
        targetLanguage: elements.targetLanguage.value,
        polishStyle: elements.polishStyle.value,
        replyTone: elements.replyTone.value
      }
    })

    if (state.currentRequestId !== requestId) return

    if (response && response.ok) {
      displayResult(response)
      setStatus('处理完成。', 'success')
      return
    }

    if (response && response.code === 'API_KEY_MISSING') {
      state.hasApiKey = false
      openSettings()
      elements.apiKeyInput.focus()
    }

    if (response && response.cancelled) {
      setOutputPlaceholder('处理已停止。')
      setStatus(response.error || '已停止处理。', 'info')
      return
    }

    setOutputPlaceholder('处理失败。')
    setStatus((response && response.error) || '处理失败，请稍后重试。', 'error')
  } catch (error) {
    console.error('处理请求失败', error)
    setOutputPlaceholder('处理失败。')
    setStatus('扩展后台没有响应，请关闭弹窗后重新打开。', 'error')
  } finally {
    if (state.currentRequestId === requestId) {
      state.currentRequestId = null
      setBusy(false)
    }
  }
}

async function cancelProcessing() {
  if (!state.busy || !state.currentRequestId) return
  elements.cancelBtn.disabled = true
  setStatus('正在停止处理...', 'info')

  try {
    await sendMessage({ type: 'cancelRequest', requestId: state.currentRequestId })
  } catch (error) {
    console.warn('停止请求失败', error)
    setStatus('停止失败，请稍候或关闭弹窗。', 'error')
  } finally {
    elements.cancelBtn.disabled = false
  }
}

function setBusy(busy) {
  state.busy = busy
  elements.runBtn.hidden = busy
  elements.runBtn.disabled = busy
  elements.runBtn.textContent = busy ? '处理中...' : '开始处理'
  elements.cancelBtn.hidden = !busy
  elements.cancelBtn.disabled = false
  elements.inputArea.readOnly = busy
  elements.targetLanguage.disabled = busy
  elements.polishStyle.disabled = busy
  elements.replyTone.disabled = busy
  elements.fetchPageBtn.disabled = busy
  elements.clearInputBtn.disabled = busy
  elements.tabs.forEach((tab) => {
    tab.disabled = busy
  })
  elements.copyBtn.disabled = busy || !state.resultText
}

async function fetchCurrentPage() {
  if (state.busy) return

  if (elements.inputArea.value.trim() && !confirm('读取网页会替换当前输入内容，是否继续？')) return

  elements.fetchPageBtn.disabled = true
  setStatus('正在读取当前网页...', 'info')

  try {
    const response = await sendMessage({
      type: 'extractPage',
      tabId: state.sourceTabId
    })

    if (!response || !response.ok) {
      setStatus((response && response.error) || '读取网页失败。', 'error')
      return
    }

    const page = response.page
    const selectedText = String(page.selection || '').trim()
    const pageText = String(page.text || '').trim()
    const preferredText = selectedText || pageText

    if (!preferredText) {
      setStatus('当前页面没有可读取的文字。', 'error')
      return
    }

    const wasTruncated = preferredText.length > MAX_INPUT_CHARS || page.truncated
    elements.inputArea.value = preferredText.slice(0, MAX_INPUT_CHARS)
    state.sourceTabId = Number.isInteger(page.tabId) ? page.tabId : state.sourceTabId
    setSourceLabel(page.title, page.url)
    updateCharCount()

    const message = selectedText
      ? '已读取页面中选中的文字。'
      : `已读取网页正文${wasTruncated ? '，超出 50,000 字的部分已截断' : ''}。`
    setStatus(message, 'success')
  } catch (error) {
    console.error('读取网页失败', error)
    setStatus('读取网页失败，请重新打开插件后再试。', 'error')
  } finally {
    elements.fetchPageBtn.disabled = state.busy
  }
}

function displayResult(result) {
  const text = String(result.text || '')
  state.resultText = text
  elements.outputArea.textContent = text || '没有返回内容'
  elements.outputArea.classList.toggle('empty', !text)
  elements.copyBtn.disabled = state.busy || !text

  const parts = []
  if (ACTION_CONFIG[result.action]) parts.push(ACTION_CONFIG[result.action].label)
  if (result.action === 'polish' && POLISH_STYLES.has(result.polishStyle)) {
    parts.push(result.polishStyle)
  }
  if (result.action === 'reply' && REPLY_TONES.has(result.replyTone)) {
    parts.push(result.replyTone)
  }
  if (result.model) parts.push(result.model)
  if (result.usage && Number.isFinite(result.usage.total_tokens)) {
    parts.push(`${formatNumber(result.usage.total_tokens)} tokens`)
  }
  elements.resultMeta.textContent = parts.join(' · ')
}

function setOutputPlaceholder(text) {
  state.resultText = ''
  elements.outputArea.textContent = text
  elements.outputArea.classList.add('empty')
  elements.resultMeta.textContent = ''
  elements.copyBtn.disabled = true
}

function updateCharCount() {
  const length = elements.inputArea.value.length
  elements.charCount.textContent = `${formatNumber(length)} / ${formatNumber(MAX_INPUT_CHARS)}`
  elements.charCount.classList.toggle('over', length > MAX_INPUT_CHARS)
}

function setSourceLabel(title, url) {
  const cleanTitle = String(title || '').trim()
  elements.sourceLabel.textContent = cleanTitle ? `来源：${cleanTitle}` : ''
  elements.sourceLabel.title = url ? String(url) : ''
}

function clearInput() {
  if (state.busy) return
  const hadData = hasWorkspaceData()
  clearWorkspace({
    focus: true,
    message: hadData ? '已清空输入、结果和来源信息。' : '当前没有需要清空的内容。'
  })
}

function clearWorkspace(options = {}) {
  const focus = Boolean(options.focus)
  const message = String(options.message || '')

  elements.inputArea.value = ''
  state.sourceTabId = null
  setSourceLabel('', '')
  updateCharCount()
  setOutputPlaceholder('结果会显示在这里')
  elements.outputArea.scrollTop = 0
  clearStoredLastResult()
  if (focus) elements.inputArea.focus()
  setStatus(message, message ? 'info' : '')
}

function clearResultOnOptionChange(message) {
  if (!state.resultText && !elements.resultMeta.textContent) return
  setOutputPlaceholder('结果会显示在这里')
  elements.outputArea.scrollTop = 0
  clearStoredLastResult()
  setStatus(message, 'info')
}

function clearStoredLastResult() {
  sendMessage({ type: 'clearLastResult' }).catch((error) => {
    console.warn('清除已保存结果失败', error)
  })
}

async function copyResult() {
  if (!state.resultText) return

  try {
    await navigator.clipboard.writeText(state.resultText)
  } catch (error) {
    const helper = document.createElement('textarea')
    helper.value = state.resultText
    helper.style.position = 'fixed'
    helper.style.opacity = '0'
    document.body.appendChild(helper)
    helper.select()
    document.execCommand('copy')
    helper.remove()
  }

  const original = elements.copyBtn.textContent
  elements.copyBtn.textContent = '已复制'
  setStatus('结果已复制到剪贴板。', 'success')
  setTimeout(() => {
    elements.copyBtn.textContent = original
  }, 1200)
}

function setStatus(message, type = '') {
  elements.status.textContent = message || ''
  elements.status.className = `status${type ? ` ${type}` : ''}`
}

function sendMessage(message) {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(message, (response) => {
      const error = chrome.runtime.lastError
      if (error) {
        reject(new Error(error.message))
        return
      }
      if (!response) {
        reject(new Error('后台没有返回响应'))
        return
      }
      resolve(response)
    })
  })
}

function formatNumber(value) {
  return Number(value || 0).toLocaleString('zh-CN')
}

function createId() {
  if (globalThis.crypto && typeof globalThis.crypto.randomUUID === 'function') {
    return globalThis.crypto.randomUUID()
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`
}
