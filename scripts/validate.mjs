import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const scriptDir = dirname(fileURLToPath(import.meta.url))
const root = resolve(scriptDir, '..')
const failures = []
const warnings = []

function fail(message) {
  failures.push(message)
}

function warn(message) {
  warnings.push(message)
}

function readText(file) {
  return readFileSync(join(root, file), 'utf8')
}

function requireFile(file, label = file) {
  const fullPath = join(root, file)
  if (!existsSync(fullPath)) {
    fail(`缺少文件：${label}`)
    return false
  }
  return true
}

function checkJavaScript(file) {
  if (!requireFile(file)) return
  try {
    execFileSync(process.execPath, ['--check', join(root, file)], { stdio: 'pipe' })
  } catch (error) {
    const detail = error.stderr ? error.stderr.toString().trim() : error.message
    fail(`${file} 语法错误：${detail}`)
  }
}

function parsePngSize(file) {
  const buffer = readFileSync(join(root, file))
  const signature = buffer.subarray(0, 8).toString('hex')
  if (signature !== '89504e470d0a1a0a' || buffer.length < 24) return null
  return {
    width: buffer.readUInt32BE(16),
    height: buffer.readUInt32BE(20)
  }
}

function checkHtml(file) {
  if (!requireFile(file)) return
  const html = readText(file)

  const requiredTags = ['<!DOCTYPE html>', '<html', '<head>', '</head>', '<body>', '</body>', '</html>']
  for (const tag of requiredTags) {
    if (!html.toLowerCase().includes(tag.toLowerCase())) fail(`${file} 缺少 ${tag}`)
  }
  if (!/<title>[^<]+<\/title>/i.test(html)) fail(`${file} 缺少有效 <title>`)
  if (/<script\b(?![^>]*\bsrc=)[^>]*>/i.test(html)) fail(`${file} 包含内联脚本，与 MV3 默认 CSP 不兼容`)
  if (/\son[a-z]+\s*=/i.test(html)) fail(`${file} 包含内联事件处理器，建议改为 addEventListener`)

  const localReferences = [...html.matchAll(/\b(?:src|href)=["']([^"']+)["']/gi)]
    .map((match) => match[1])
    .filter((value) => !/^(?:https?:|data:|#|mailto:)/i.test(value))

  for (const reference of localReferences) {
    if (!requireFile(reference, `${file} 引用的 ${reference}`)) {
      continue
    }
  }
}

const manifestFile = 'manifest.json'
if (!requireFile(manifestFile)) {
  printResult()
  process.exit(1)
}

let manifest
try {
  manifest = JSON.parse(readText(manifestFile))
} catch (error) {
  fail(`manifest.json 不是合法 JSON：${error.message}`)
  printResult()
  process.exit(1)
}

if (manifest.manifest_version !== 3) fail('manifest_version 必须为 3')
if (!manifest.name) fail('manifest.json 缺少 name')
if (!/^\d+(?:\.\d+){0,3}$/.test(String(manifest.version || ''))) fail('manifest.json 的 version 格式无效')
if (!manifest.description) fail('manifest.json 缺少 description')

const popup = manifest.action && manifest.action.default_popup
const worker = manifest.background && manifest.background.service_worker
if (!popup) fail('manifest.json 缺少 action.default_popup')
if (!worker) fail('manifest.json 缺少 background.service_worker')
if (popup) requireFile(popup)
if (worker) requireFile(worker)

const requiredPermissions = ['storage', 'contextMenus', 'activeTab', 'scripting']
for (const permission of requiredPermissions) {
  if (!Array.isArray(manifest.permissions) || !manifest.permissions.includes(permission)) {
    fail(`manifest.json 缺少权限：${permission}`)
  }
}

if (!Array.isArray(manifest.host_permissions) || !manifest.host_permissions.includes('https://dashscope.aliyuncs.com/*')) {
  fail('manifest.json 缺少 DashScope host_permissions')
}
if (Array.isArray(manifest.host_permissions) && manifest.host_permissions.includes('<all_urls>')) {
  fail('不应申请 <all_urls> 权限')
}
if (Array.isArray(manifest.host_permissions) && manifest.host_permissions.includes('https://ark.cn-beijing.volces.com/*')) {
  warn('仍包含未使用的火山引擎权限，可以删除以缩小权限范围')
}

const iconEntries = [
  ...Object.entries(manifest.icons || {}),
  ...Object.entries((manifest.action && manifest.action.default_icon) || {})
]
const uniqueIcons = new Map(iconEntries)
if (!uniqueIcons.size) fail('manifest.json 未配置图标')

for (const [size, file] of uniqueIcons) {
  if (!requireFile(file, `图标 ${file}`)) continue
  const actual = parsePngSize(file)
  if (!actual) {
    fail(`${file} 不是有效 PNG`)
    continue
  }
  if (actual.width !== Number(size) || actual.height !== Number(size)) {
    fail(`${file} 尺寸为 ${actual.width}x${actual.height}，manifest 声明为 ${size}x${size}`)
  }
}

checkJavaScript('background.js')
checkJavaScript('popup.js')
checkHtml('popup.html')
checkHtml('privacy.html')

if (requireFile('package.json')) {
  try {
    const packageJson = JSON.parse(readText('package.json'))
    if (packageJson.version !== manifest.version) {
      warn(`package.json 版本 ${packageJson.version} 与 manifest.json 版本 ${manifest.version} 不一致`)
    }
  } catch (error) {
    fail(`package.json 不是合法 JSON：${error.message}`)
  }
}

printResult()
process.exit(failures.length ? 1 : 0)

function printResult() {
  for (const warning of warnings) console.warn(`警告：${warning}`)
  for (const failure of failures) console.error(`失败：${failure}`)

  if (failures.length) {
    console.error(`\n检查未通过：${failures.length} 个错误，${warnings.length} 个警告。`)
  } else {
    console.log(`检查通过：扩展结构、图标、HTML 和 JavaScript 均正常${warnings.length ? `（${warnings.length} 个警告）` : ''}。`)
  }
}
