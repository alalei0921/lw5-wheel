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

发布沿用原 GitHub Pages 的 `main` 根目录；更改前需获准发布。Service Worker 发布缓存名为 `lw5-home-v63-island-button`，三个新静态资源已加入离线清单。


私人清单可通过 `supplements/setup.html#s=…` 一次带入：fragment 内为 UTF-8 JSON 的 base64url，结构与私有 JSON 相同，仅包含名称和说明。独立页最先移除 fragment，仅运行内联代码；CSP 禁止网络连接与外部资源，没有分析脚本。新浏览器自动写入本地配置，再进入 `#supplements` 面板；相同配置重复打开不会改动记录；已有不同配置时先保留，需要明确点击才能替换。私人链接不进仓库、公开文档或通用审查包，也不能当普通站点链接转发。它不加密，持有链接的人可以读清单；浏览器扩展和分享该链接的渠道不属于页面能控制的范围。


v61 名称兼容：读取时将对应行的旧数字/中文序号占位名显示为通用短名；只有完整四行都严格符合旧品牌前缀+类别格式时，才整体简化旧导入名称。不使用子串猜测，不改其他自定义清单；说明和每日开关保留。兼容显示不重写旧原始存储。显式编辑保存后写入 `labelsVersion:2`，之后完全尊重用户名称，不再套用旧名称转换。


v62 说明兼容：仅为对应默认短名称下的空说明或原“点「编辑」填写名称和用量”占位说明补齐默认小字。读取时不重写原始存储，其他自定义名称、说明与当天开关保留。显式保存写入 `notesVersion:1`，之后尊重用户编辑，包括主动清空说明。默认公开说明仅限已获批准的四句，不上传本地配置或打卡。


## Prerendered lighting film v75 (2026-11-18)

The [full-light film](assets/lights-film/v1/level-09.mp4) and
[900 × 1600 keyframe](assets/lights-film/v1/hero.jpg) use Cycles volume plates
and offline optical compositing. [Production credits and asset licenses](assets/lights-film/v1/credits.html)
accompany these renders.

The phone plays the Mac-rendered `assets/lights-film/v1/level-00.mp4` through
`level-09.mp4`. All ten levels share the same 16-second, 24 fps timeline at
720 × 1280; each has a matching phase-zero JPEG. H.264/yuv420p, no audio,
faststart and a 12-frame GOP allow native playback and short seeks. The player
keeps at most two videos during a transition and switches only when the existing
job snapshot confirms a different count. Video timing never changes progress;
level 9 remains “确认中” until the job separately reports success.

Ordinary portrait hosts (width/height 0.40–0.75) fill their viewport using a
centered cover crop. Wider or unusually tall hosts contain the full composition,
with a dim blurred poster behind it. Reduced motion uses the matching still.
Missing video falls back to that still; loss of both restores the existing
WebGL/2D renderer with the same snapshot. Add `?sceneRenderer=webgl` to explicitly
use the old renderer. The earlier [single film](smart-home/blackhole-loop.mp4)
remains available. The [public preview](smart-home/lights-preview.html) simulates
progress without loading device code; its settings link to the film credits.

The bridge keeps matching files under `assets/lights-film/v1/` and serves only
those files plus `credits.html` at `/lights-film/v1/`, with GET/HEAD and byte-range
support. Control APIs and submission rules are unchanged. Shared film JS/CSS
and the manifest are copied beside `lights-on-http.js` for embedding at startup.
The service worker cache is `lw5-home-v75-prerendered-film`; videos are neither
preloaded during installation nor intercepted by its cache. Use a new asset
directory version when replacing published media, because those URLs are immutable.

Run the player tests with a local QA H.264 fixture (outside production assets):
`LW5_FILM_TEST_VIDEO=/absolute/path/to/16-second-fixture.mp4 node --test tests/lights-film-browser.cjs`.
Without that variable, decoder and public-preview checks use the preserved old
v74 film as read-only test media; it is distinct from the final v75 ten-level
assets. No fixture replaces a production level asset.
Other player cases mock media events; bridge regressions use mock requests only.

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
The [interactive preview](smart-home/lights-preview.html) simulates all nine
confirmations and supports scrubbing to an individual level. Open it with
`#loop` to start at full brightness. The [16-second film](smart-home/blackhole-loop.mp4)
is a 30 fps portrait render of that state.

The frontend and local bridge share the renderer. The bridge embeds the script
at startup and needs a restart to pick up visual changes. The service worker
cache for that release was `lw5-home-v74-smooth-rim`. The first nine-level disk is available
at `b9f7bae`. The nine-star version is available
at `45641ab`, and the earlier black-hole scene at `46e317f`.
