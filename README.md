# Lw&5 随机大餐 - 微信H5大转盘

## 说明
- 单文件可部署：`index.html`
- 纯前端（无后端），手机/微信内置浏览器可用
- 抽奖逻辑：**先按权重选结果**，再计算角度并动画精准停在该扇区，保证“动画=结果”一致
- 音效：按要求预留 base64 内嵌变量；同时提供 WebAudio 兜底（你不替换也能有声音）

## 部署
把 `index.html` 放到任意静态站点（建议 HTTPS）即可。

## 替换音效（可选）
在 `index.html` 搜索：
- `SFX_START_BASE64`
- `SFX_SPIN_BASE64`
- `SFX_DING_BASE64`
替换为你的 base64（不含 data: 前缀也可以）。

## 微信注意
- iOS 微信对音频解锁更严格：必须由用户手势触发。页面已在第一次点“开始”时执行解锁。


## 每日补剂面板

主页右下角 💊 打开同页面板。四项名称与说明可编辑，开关表示当天已记录，可再次关闭纠正。可选项按自己的安排记录，无需每天全部打开。

- 本地记录使用独立 `lw5.supplements.v1.` localStorage 命名空间，不发送网络请求、不接入家庭接口，也不与配偶或其他设备同步。
- 日期固定使用 `Asia/Shanghai`。状态只在记录日期与今天一致时显示为开；午夜、页面重新进入、后台恢复、窗口获得焦点与跨标签存储变化都会重新核对。无需清空其他数据，也不保留打卡历史。
- 部署代码提供“镁片、鱼油、蛋白粉、肌酸”四个通用类别，附带用户明确批准公开的四句用量说明，不含品牌或打卡记录。用户名称和用量通过面板编辑；可在编辑中导入私有 JSON 清单，检查草稿后保存。私有清单与打卡数据不得放进仓库或静态部署目录。
- 私有清单格式：`{"format":"lw5-supplements","version":1,"items":[{"name":"自定义名称","description":"自己的用量或提醒"}, ...]}`，必须恰好四项；名称最多 60 字、说明最多 240 字、文件小于 16 KB。
- 保存仅对当前浏览器、当前站点生效。普通浏览器和桌面 PWA 不假定共享存储。没有本地清单时，一键更新后直接显示四个通用名称与获准公开的默认说明，无需导入；自定义说明不会跨存储环境同步。清除网站数据会移除这些设置和记录。一键更新仅刷新应用缓存，会保留本地记录。

发布沿用原 GitHub Pages 的 `main` 根目录；更改前需获准发布。Service Worker 发布缓存名为 `lw5-home-v84-auto-dog-status`，补剂静态资源已加入离线清单。


私人清单可通过 `supplements/setup.html#s=…` 一次带入：fragment 内为 UTF-8 JSON 的 base64url，结构与私有 JSON 相同，仅包含名称和说明。独立页最先移除 fragment，仅运行内联代码；CSP 禁止网络连接与外部资源，没有分析脚本。新浏览器自动写入本地配置，再进入 `#supplements` 面板；相同配置重复打开不会改动记录；已有不同配置时先保留，需要明确点击才能替换。私人链接不进仓库、公开文档或通用审查包，也不能当普通站点链接转发。它不加密，持有链接的人可以读清单；浏览器扩展和分享该链接的渠道不属于页面能控制的范围。


v61 名称兼容：读取时将对应行的旧数字/中文序号占位名显示为通用短名；只有完整四行都严格符合旧品牌前缀+类别格式时，才整体简化旧导入名称。不使用子串猜测，不改其他自定义清单；说明和每日开关保留。兼容显示不重写旧原始存储。显式编辑保存后写入 `labelsVersion:2`，之后完全尊重用户名称，不再套用旧名称转换。


v62 说明兼容：仅为对应默认短名称下的空说明或原“点「编辑」填写名称和用量”占位说明补齐默认小字。读取时不重写原始存储，其他自定义名称、说明与当天开关保留。显式保存写入 `notesVersion:1`，之后尊重用户编辑，包括主动清空说明。默认公开说明仅限已获批准的四句，不上传本地配置或打卡。


## 实时开灯动画

右下角灯泡、[开灯预览](smart-home/lights-demo.html) 和[九档调光预览](smart-home/lights-preview.html) 共用 `shared/lights-on-universe.js`。WebGL 实时绘制黑洞、云层、光流和粒子，仅支持软件光栅化或无法使用 WebGL 的设备会用 Canvas 2D 绘制。实际任务根据中控确认的灯数更新，预览使用独立的 16 秒时间轴，每秒模拟点亮一盏灯。离线安装会缓存预览页面、着色器所在的脚本和样式。

局域网中控在启动时嵌入渲染脚本。更新该服务时，复制新版 `shared/lights-on-universe.js` 和 CSS，保留原来的任务状态订阅。如果中控同时嵌入旧影片播放器，也同步更新 `shared/lights-on-film.js`。新版播放器默认使用实时场景。

v77 的[九档影片](assets/lights-film/v1/level-09.mp4?scene=77)及[素材署名](assets/lights-film/v1/credits.html)仍可单独查看。加载了影片播放器和清单的宿主可用 `sceneRenderer=film` 显式选择历史影片。

## Previous WebGL visual v74 (2026-11-18)

Each confirmed circuit raises the luminosity of the same accretion disk by one
level. A travelling heat front follows the orbit as the new light reaches the
lensed arc and rotating dust. The ninth confirmation brings the disk to full
intensity around the central shadow. An opaque central sphere clips rays through
the far half of the rotating disk. Pixels on its silhouette blend their covered
and uncovered areas, with near-side dust rendered at the appropriate depth.
Thick, layered cloud billows roll below the disk with illuminated crests and
shadowed sides. A bright knot follows the rising rose-gold stream, turns
tangentially around the shadow, then broadens and fades into the outer halo.
Background stars bend around the shadow, while nearby dust moves past the camera
in a 16-second loop. Lamp confirmations run on a separate clock. Reduced-motion mode shows
the settled level immediately. A Canvas 2D renderer supports devices without WebGL.
The [interactive preview](smart-home/lights-preview.html?scene=77#loop) simulates all nine
confirmations and supports scrubbing to an individual level. Open it with
`#loop` to start at full brightness. The [16-second film](smart-home/blackhole-loop.mp4)
is a 30 fps portrait render of that state.

The frontend and local bridge share the renderer. The bridge embeds the script
at startup and needs a restart to pick up visual changes. The service worker
cache for that release was `lw5-home-v74-smooth-rim`. The first nine-level disk is available
at `b9f7bae`. The nine-star version is available
at `45641ab`, and the earlier black-hole scene at `46e317f`.


## 回撤观察台入口

主页左下角海岛上方的 📈 直接以顶层原生链接打开 `https://drawdown-observatory.alalei.chatgpt.site`，使用 `no-referrer`，不嵌入页面或附加参数。入口不读取持仓、调用交易接口，也不改变目标站点原有的仅所有者访问限制。

## 狗狗日历 v80

主页右侧灯泡上方的狗狗入口打开本站 `dog-calendar/`。无需 GPT 登录；专属日历口令经既有云端服务核验后才能读写同一份日历。可选在当前设备记住口令；日历记录以云端为准，保存、手动同步和返回前台时刷新。冲突保存会取回最新记录并要求重新确认，不覆盖另一台设备的新修改。

日历需要联网；首页 Service Worker 不缓存日历路由或云端请求。一键更新只刷新应用缓存，保留已有补剂、海岛及其他本地数据。公开源码仅含公开项目标识与 publishable key，没有真实口令或记录。`dog-calendar/backend/index.ts` 是含摘要占位符的审查源码，不能直接用于重新部署；本次仅发布静态前端，保留已经部署和验证的同步后端。


## 当前开始日 v82

日历只使用 `anchor` 这一个当前开始日来显示标记和计算配色；周期设置、设置/更正开始日及“月经来了”都替换它，包括改到更早日期。`starts` 保留旧版历史，不再用于显示多个开始日。读取不自动写回；旧数据优先使用有效 `anchor`，否则取 `starts` 中最晚的有效日期，没有有效项则为空。`startSelectionVersion:1` 配合空 `anchor` 表示主动清除，历史不会因此重新变成当前日期。新保存保留原历史、手动状态及其他扩展字段，撤销只恢复之前的唯一当前日期；版本冲突或过期撤销不会覆盖另一台设备的新状态。旧客户端写回的多日列表在新客户端仍只显示一个当前日期；不修改后端，不能禁止旧客户端自身的旧显示和写入方式，建议两端都更新。


## 主页狗狗入口 v84

日历入口位于右侧灯泡上方，主页不再显示中栏入口与开灯动画预览链接；灯泡和原预览页面保留。首页与日历共用日期、手动状态优先、当前开始日及预估判定代码。

只有在日历成功解锁并选择“在这台设备记住口令”后，首页才会通过同一验证接口只读刷新：首次打开、返回前台、重新获得焦点或前台跨日时刷新。等待期间先显示通用狗图标及不占位的“…”角标，结束后显示当天狗图像；失败、无状态、示例预估、未记住或主动锁定时保持通用图标。并发打开事件合并，隐藏/离开时取消请求，过期结果不能覆盖锁定、新凭据或新日期；后台不轮询。

首页只在内存中读取响应并提取图像标识，不存储日历记录、额外口令或状态摘要；旧 v83 会话摘要会移除。口令失效时沿用日历的忘记口令行为。一键更新保留已有本地设置和记住口令选择；离线无法刷新时显示通用图标。未修改后端、权限或设备控制。
