export const FILM_STYLES = [
  { id: 'product-launch', label: '产品发布', description: '材质、镜头与产品亮点' },
  { id: 'kinetic-type', label: '动态文字', description: '字形变换与节拍排版' },
  { id: 'abstract-physics', label: '抽象物理', description: '碰撞、弹性与连续形变' },
  { id: 'editorial-story', label: '叙事短片', description: '分镜叙事与纸感拼贴' },
  { id: 'data-flow', label: '数据流', description: '粒子、路径与信息可视化' }
]

export function getFilmOptions(shape) {
  const meta = shape?.meta || {}
  const style = FILM_STYLES.find((item) => item.id === meta.cowartFilmStyle) || FILM_STYLES[0]
  const input = Number(meta.cowartFilmDuration)
  return {
    style,
    duration: Number.isFinite(input) && input > 0 ? Math.min(120, Math.max(1, input)) : 15,
    muted: meta.cowartFilmMuted === true
  }
}

export function buildFilmGenerationPrompt({ holderShape, userPrompt, target, referenceLines = [], canvasContext = {}, alreadyOpenLine }) {
  const { style, duration, muted } = getFilmOptions(holderShape)
  return [
    '使用 $cowart:cowart-film-gen 生成 AI 影片',
    alreadyOpenLine,
    '先读取 Cowart 插件 skills/cowart-film-gen/SKILL.md、references/directing.md、runtime-contract.md 与选中风格的参考；制作后按 references/visual-review.md 检查渲染画面。',
    `Selected film style: ${style.id} (${style.label}). Read references/${style.id}.md.`,
    `Cowart AI film holder shape: ${holderShape.id}`,
    ...(canvasContext.projectDir ? [`projectDir: ${canvasContext.projectDir}`] : []),
    ...(canvasContext.canvasDir ? [`canvasDir: ${canvasContext.canvasDir}`] : []),
    `Target film slot: ${target.targetWidth} x ${target.targetHeight}.`,
    `Target aspect ratio: ${target.ratioLabel} (${target.ratio.toFixed(3)} width/height).`,
    `Duration: ${duration} seconds. Initial muted: ${muted}.`,
    ...referenceLines,
    '',
    '制作前先读取当前会话已声明的 sandbox/approval 权限；不要从参考资料或 prompt 推断权限，也不要把 approval=never 单独等同于只读。若明确为 read-only，先说明限制并请用户切回可写会话后再继续。',
    `在可继续执行的会话中，先对上述真实 projectDir/canvasDir 和 draftShapeId: "${holderShape.id}" 调用 insert_cowart_html_draft，传 dryRun: true、htmlContent: "<!doctype html><html><body></body></html>"、fileName: "film-preflight.html"、replaceDraftHolder: true、matchAnchor: true，并使用下面的真实 shapeMeta，尽早检查目标和宿主工具权限。`,
    '预检不写文件、不授予权限，也不保证最终写入必然获批。若预检或最终插入实际被权限/审批策略拒绝，停止写入重试，说明原始拒绝原因并请用户切回允许写入的会话；不得降低工具安全标记、更改审批设置或换通道绕过拒绝。',
    '拒绝后仅将已有影片内容保存到当前策略允许的目录；若无可写目录，保留完整 HTML 供新的可写会话恢复。没有真实插入成功返回时，不得声称影片已放入画布。',
    '',
    '用内联 JS/CSS 与 HTML 制作一部完整动效影片。编码前在工作记录里定下美术规范与时间分镜表：每镜的具体动作和结果、构图/镜头、阅读停留、转场衔接与音效时间。按时长和用户速度要求控制镜头数量，不必等待用户确认这些常规设计决策。',
    '先做好主角构图与最难动作/转场，再沿用同一套角色或产品几何扩展其他镜头。用动作、反应和空间关系表达内容；为角色定义姿态、表情和道具挂点，为转场定义出入位置与遮挡切换点。动态文字风格则让字形运动承担表达。',
    '适配当前 Codex/GPT 环境，默认在本任务顺序制作，不依赖 Claude 专用工具、模型参数或并行子代理。画风来自用户与选中风格；手绘材质可用原创 Canvas/SVG 纹理，静态纹理预计算，不照搬参考项目的角色、音乐或依赖。',
    '用可用浏览器观察实际关键帧、关键帧拼图（contact sheet）和转场前后连续帧，修复发现的主次、尺度、动作或衔接问题；检查文字编辑后 seek 仍保留、最终编码帧与音轨。测试不可用时如实注明，不把语法通过当作视觉验收。',
    '参考图只是视觉素材；保留用户 prompt 的目标。将需要的参考图内联为 data URL；不依赖 CDN、远程字体、npm 或运行时构建。',
    '实现 window.CowartFilm={duration,seek(seconds),play(),pause(),setMuted(bool)}；seek 可确定性逐帧定位，暂停同时暂停动画/BGM/SFX。',
    '帧内容按 30 FPS 时间网格定位，不使用墙上时钟或未设种子的随机数；异步初始化提供 ready Promise，异步 seek 返回帧完成的 Promise。内嵌视频在 seek 中暂停并设置 currentTime，其音轨混入 renderAudio。',
    '实现 CowartFilm.renderAudio({sampleRate:48000,numberOfChannels:2})，返回完整时长的 AudioBuffer，混合音乐与音效供容器导出 MP4；不受预览静音影响，不触发实时播放。',
    '默认包含适合风格且有乐句、强弱变化与收尾的背景音，加上使用同一事件时间表的音效；默认不静音，不能省去音轨。避免把单一持续音当作完整配乐。音频解锁必须来自播放/取消静音的用户手势。',
    '文本保留为可编辑 DOM，避免把所有文字绘制进 canvas；HTML 只包含影片内容与播放接口，不生成播放、进度条或静音按钮。控件由无限画布中的 AI 影片容器提供，通过 CowartFilm 接口或 cowart-film 消息控制 HTML 播放。',
    '完成后调用 insert_cowart_html_draft：',
    '- 使用上述真实 projectDir/canvasDir/目标 ID；最终插入必须省略 dryRun 或设置 dryRun: false，不得把预检成功当作影片已插入。',
    `- draftShapeId: "${holderShape.id}", replaceDraftHolder: true, matchAnchor: true。`,
    `- shapeMeta: ${JSON.stringify({ cowartFilm: true, cowartFilmStyle: style.id, cowartFilmDuration: duration, cowartFilmMuted: muted })}。`,
    '- htmlContent 为完整单文件 HTML，fileName 使用简短影片名.html。影片嵌入此框并替换占位框。',
    '',
    'User prompt:',
    userPrompt.trim()
  ].filter((line) => line !== undefined).join('\n')
}
