# Edge 商店素材

## 文件

- `store-icon-300x300.png`：商店大图/品牌图，300×300 PNG。
- `screenshot-01-overview-1280x800.png`：10 项功能总览。
- `screenshot-02-polish-1280x800.png`：润色风格。
- `screenshot-03-reply-1280x800.png`：回复语气。
- `screenshot-04-devtools-1280x800.png`：代码解释与报错诊断。
- `screenshot-05-privacy-1280x800.png`：本地设置与隐私说明。

## 建议上传顺序

1. 功能总览
2. 润色风格
3. 回复语气
4. 开发辅助
5. 隐私与设置

## 截图说明

截图中的界面来自当前扩展 Popup，示例输入和输出均为虚构演示数据；实际结果取决于用户选择的模型和输入内容。隐私设置图中的 API Key 为遮罩假值，不包含真实密钥。

## 尺寸

- 商店大图：300×300 px，PNG。
- 功能截图：1280×800 px，PNG。
- 全部素材均不包含 API Key 或真实用户数据。

## 源文件与重新生成

- `source/composer.html`：1280×800 商店截图版式，支持 `?scene=overview|polish|reply|devtools|privacy`。
- `source/icon-300.html`：300×300 商店图标版式。
- `source/render-assets.mjs`：启动隔离的 Edge 实例，截取真实 Popup，再生成全部最终 PNG。
- `source/popup-*.png`：渲染脚本生成的 420×680 弹窗底图，可单独检查。

重新生成全部素材：

```powershell
node --experimental-websocket store-assets/source/render-assets.mjs
```

脚本默认使用 `C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe`；如安装位置不同，可设置 `EDGE_PATH` 环境变量。脚本使用临时浏览器配置，不读写日常浏览数据。

## 商店文案提醒

上架前仍需准备：

- 可公开访问的隐私政策 URL，可将 `PRIVACY.md` 部署到静态网站。
- 商店列表名称、简短描述、详细描述和分类。
- Edge 开发者账号及加载项提交信息。
