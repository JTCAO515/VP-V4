import { FAILURE_CODES, type FailureCode } from "./server/contracts/errors/index.ts";

export type Locale = "zh" | "en" | "es" | "ru" | "ar";

export type LocaleAttributes = { lang: string; dir: "ltr" | "rtl" };

const localeAttributes: Record<Locale, LocaleAttributes> = {
  zh: { lang: "zh-CN", dir: "ltr" },
  en: { lang: "en", dir: "ltr" },
  es: { lang: "es", dir: "ltr" },
  ru: { lang: "ru", dir: "ltr" },
  ar: { lang: "ar", dir: "rtl" },
};

export function getLocaleAttributes(locale: Locale): LocaleAttributes {
  return localeAttributes[locale];
}

export const localeOptions: ReadonlyArray<{ value: Locale; label: string; flag: string; currencySymbol: string }> = [
  { value: "zh", label: "中文", flag: "🇨🇳", currencySymbol: "¥" },
  { value: "en", label: "English", flag: "🇺🇸", currencySymbol: "$" },
  { value: "es", label: "Español", flag: "🇪🇸", currencySymbol: "€" },
  { value: "ru", label: "Русский", flag: "🇷🇺", currencySymbol: "₽" },
  { value: "ar", label: "العربية", flag: "🇸🇦", currencySymbol: "ر.س" },
];

export const copy = {
  zh: {
    header: {
      home: "VisePanda 首页",
      preferences: "偏好",
      language: "界面语言",
      openMenu: "打开产品菜单",
      productMenu: "产品菜单",
      closeMenu: "关闭菜单",
      menu: ["当前产品", "规划预览", "产品说明", "显示偏好", "语言", "关于 VisePanda", "联系", "使用条款"],
    },
    hero: {
      title: "用 AI 规划中国之旅，再从容地把它走完。",
      subtitle: "VisePanda 将旅行对话与实用的 Trip Canvas 结合，服务于来中国自由行的旅行者。Chatbot 帮你规划和调整，Canvas 让每天的安排可见，Today 在旅途中给出一个可信的下一步或恢复路径。",
      placeholder: "第一次来中国，帮我规划北京 4 天，并检查支付、网络和景点预约",
      promptLabel: "告诉 VisePanda 你的来华旅行计划",
      suggestions: ["第一次来中国", "规划北京和上海 7 天", "检查支付和网络准备", "今天下一步做什么"],
      existingPlan: "已经有计划？",
      canvasPreview: "查看 Trip Canvas 预览",
      submitToast: "已收到这条预览输入；当前原型未连接 AI，也不会保存你的输入。",
      canvasToast: "Trip Canvas 产品预览将在后续版本逐步开放。",
    },
    human: {
      eyebrow: "产品边界优先",
      title: "规划有画布，执行有回退。",
      body: "Chatbot 负责理解和调整；Trip Canvas 记住每天的安排与准备状态；Today 只展示一个符合资格的下一步。证据不足时，VisePanda 会明确说明缺什么，并给出安全替代或恢复路径。",
      cta: "查看工作台预览",
      toast: "当前页面是产品预览，不代表实时人工服务或预订支持。",
    },
    destinations: {
      title: "从一个想法，到可以实际执行的一天。",
      cards: [
        ["第一次来中国", "Planner 示例当前仅为前端预览。"],
        ["当天计划发生变化", "Canvas 示例当前仅为前端预览。"],
        ["现场需要下一步", "Today 示例当前仅为前端预览。"],
      ],
      cta: "查看示例",
    },
    features: {
      title: "规划、记住、执行、恢复。",
      subtitle: "每一步都可见，每一个事实都有边界。",
      items: [
        ["对话式规划", "告诉 VisePanda 城市、日期、节奏、兴趣和限制。Chatbot 将需求整理成可以在 Canvas 中检查的候选计划。"],
        ["Trip Canvas", "每天的安排、地点、准备状态和待确认变化都在同一个可见行程里；修改必须由用户确认。"],
        ["可信执行事实", "支付、中文地址、入场、网络和沟通信息必须带来源、适用范围与复核时间；没有证据时不靠模型记忆补空。"],
        ["Today 与恢复", "旅途中只突出一个符合资格的下一步；失败时给出安全替代、官方渠道或受控人工升级边界。"],
      ],
      more: "查看详情",
      less: "收起详情",
      slide: "切换到产品能力",
    },
    reviews: {
      title: "Chatbot 与 Trip Canvas，在同一个工作台协作。",
      body: "这是静态产品预览，不是实时旅行数据。Chatbot 提出候选与调整建议；Canvas 让你逐日检查；只有确认并通过确定性校验后，变化才可能进入 Trip。",
      status: "当前产品以真实可用状态为准。",
      cta: "查看当前产品",
      toast: "当前产品将以真实可用状态为准。",
      play: "播放产品预览",
      pause: "暂停产品预览",
    },
    planner: {
      title: "VisePanda：AI 规划与执行工作台",
      base: "VisePanda 不只是生成一段行程文字。你可以通过 Chatbot 形成或调整计划，在 Trip Canvas 中逐日查看地点、路线和准备状态，再通过 Today 处理旅途中的下一步与变化。模型只能提出候选；事实资格、用户确认、TripPatch、审计和持久化边界仍由确定性系统控制。",
      expanded: "当前仍处于 Early Access 与产品预览阶段。Planner、Canvas 与 Today 会按事实和接口门槛逐步交付；页面不代表实时票务、自动预订、付款或完整城市覆盖。",
      cta: "查看当前产品",
      toast: "当前产品入口将在后续真实接入时开放。",
    },
    trust: {
      title: "信任不是一面 Logo 墙。",
      body: "对来华旅行真正重要的是：事实从哪里来、什么时候复核、谁确认了修改，以及失败后怎样恢复。",
      badges: ["来源可追溯", "用户确认", "复核时间", "失败恢复"],
      secondTitle: "覆盖正在按城市和场景扩展。",
      secondBody: "当前页面不宣称完整中国覆盖、实时库存或已激活合作伙伴。Early Access 的任务是先验证哪些信息和执行时刻最值得优先解决。",
      secondBadges: ["北京", "上海", "广州", "成都", "支付准备", "网络准备", "现场恢复"],
    },
    faq: {
      title: "常见问题",
      subtitle: "关于 VisePanda 产品预览与 Early Access 的诚实说明。",
      items: [
        ["VisePanda 是什么？", "VisePanda 是面向来中国自由行的 AI 规划与执行工作台，结合一个对话式 Chatbot 与可见、可持续的 Trip Canvas。"],
        ["VisePanda 是怎样工作的？", "你先通过对话说明城市、日期、节奏、兴趣和限制；候选计划进入可见 Canvas 供你检查。旅途中，Today 会突出一个有资格的下一步或说明缺什么。"],
        ["Chatbot 和 Trip Canvas 有什么区别？", "Chatbot 负责理解、解释和提出候选；Trip Canvas 负责展示唯一的当前行程状态。模型不能直接改写 Trip。"],
        ["VisePanda 可以直接预订机票、酒店或门票吗？", "当前不可以。产品预览不代表实时库存、价格、预订或订单服务已经接通。"],
        ["VisePanda 可以替我付款吗？", "不可以。VisePanda 不代付；未来商业入口也必须通过已审核伙伴、明确披露和可审计账本后才能开放。"],
        ["VisePanda 的旅行信息来自哪里？", "可执行信息需要记录来源、适用范围、复核时间和过期状态。没有合格事实时，VisePanda 应明确未知或不可用。"],
        ["六个执行时刻都已经上线了吗？", "还没有。六个时刻会按事实覆盖和运行证据逐步交付。"],
        ["Human Help 是实时客服或紧急救援吗？", "不是。健康与安全问题应优先使用官方紧急渠道；任何人工协助都必须先明确城市、时段、任务范围、容量和服务限制。"],
        ["VisePanda 覆盖中国所有城市吗？", "不覆盖。内容和执行事实正在按城市、场景和 POI 逐步扩展。"],
        ["Early Access 当前包括什么？", "首批体验将逐步开放规划、Canvas 和执行准备能力；邀请与功能开放取决于事实覆盖和运行门槛。"],
        ["VisePanda 是免费的吗？", "Early Access 的首批受邀体验可以免费；长期定价和伙伴收入都需独立验证，当前页面不公布正式价格。"],
        ["这个页面会保存我的输入吗？", "当前不会。它是前端产品原型，不调用真实 AI，也不保存 Prompt。"],
      ],
    },
    cta: {
      title: "准备好把中国之旅看得更清楚了吗？",
      body: "查看 VisePanda 如何把对话、Trip Canvas 与执行恢复组织在一起。",
      button: "查看当前产品",
      toast: "当前页面是前端原型；真实产品入口以 go2china.space 为准。",
    },
    footer: {
      columns: [
        ["产品", ["产品预览", "Planner", "Trip Canvas", "Today"]],
        ["了解", ["产品定位", "项目开发", "商业计划", "GitHub"]],
        ["信任", ["隐私", "条款", "Affiliate Disclosure", "Human Help Limits", "Emergency Disclaimer"]],
        ["覆盖", ["北京", "上海", "广州", "成都", "更多城市逐步扩展"]],
        ["规划", ["第一次来中国", "多城市行程"]],
      ],
      previewToast: "当前为前端产品预览。",
      copyright: "© 2026 VisePanda · 产品预览",
      tagline: "Independent travel in China, thoughtfully prepared.",
    },
    modals: {
      close: "关闭",
      languageTitle: "界面语言",
      languageToast: "界面语言已切换：",
      displayTitle: "显示偏好预览",
      displayToast: "显示偏好已更新：",
      privacyTitle: "隐私说明",
      privacyBody: "当前原型不启用分析或营销 Cookie。真实产品的 Cookie 与隐私选项将以正式隐私政策和实际部署配置为准。",
      privacyOptions: ["必要功能（未启用）", "分析（未启用）", "营销（未启用）", "旅行画像（未启用）"],
      privacyHint: "当前仅用于展示正式产品可能提供的隐私控制位置。",
      displayOptions: [["美元", "$ - USD"], ["欧元", "€ - EUR"], ["人民币", "¥ - CNY"], ["英镑", "£ - GBP"], ["日元", "¥ - JPY"], ["新加坡元", "S$ - SGD"], ["泰铢", "฿ - THB"], ["澳大利亚元", "A$ - AUD"]],
    },
    auth: {
      language: "界面语言", eyebrow: "仅限受邀测试用户", title: "登录 VisePanda", body: "请使用 closed beta 账户对应的邮箱和独立应用密码。", emailLabel: "邮箱", emailPlaceholder: "you@example.com", passwordLabel: "密码", passwordPlaceholder: "应用密码", submit: "登录", submitting: "正在登录…", checking: "正在检查会话…", invalid: "邮箱或密码不正确。", notProvisioned: "此邀请目前无法继续。请联系邀请发放方。", rateLimited: "尝试次数过多，请稍后再试。", unavailable: "登录暂时不可用。", expired: "会话已失效，请重新登录。", signedInTitle: "已登录", signedInBody: "当前浏览器已建立 VisePanda 认证会话。", firstRunKicker: "开始之前", firstRunTitle: "还没有创建行程", firstRunBody: "登录后，VisePanda 会在此展示可检查的 Trip Canvas。此页面不会自动创建或保存行程。", continue: "进入工作台", signOut: "退出登录", signingOut: "正在退出…", closedBeta: "Invitation-only closed beta", noSignup: "此处不开放公众注册或密码找回。",
    },
    common: { attachment: "添加附件", voice: "语音输入", send: "发送", backTop: "返回顶部", referenceImage: "VisePanda 中国旅行场景" },
  },
  en: {
    header: {
      home: "VisePanda home",
      preferences: "Preferences",
      language: "Interface language",
      openMenu: "Open product menu",
      productMenu: "Product menu",
      closeMenu: "Close menu",
      menu: ["Current product", "Planner preview", "Product notes", "Display preferences", "Language", "About VisePanda", "Contact", "Terms of use"],
    },
    hero: {
      title: "Plan your trip to China with AI, then move through it with confidence.",
      subtitle: "VisePanda combines travel conversation with a practical Trip Canvas for independent visitors to China. Chatbot helps you plan and adjust, Canvas keeps each day visible, and Today gives you one trustworthy next step or a recovery path on the road.",
      placeholder: "First time in China: plan four days in Beijing and check payments, connectivity, and attraction reservations",
      promptLabel: "Tell VisePanda about your trip to China",
      suggestions: ["First time in China", "Plan Beijing and Shanghai in 7 days", "Check payment and connectivity prep", "What should I do next today?"],
      existingPlan: "Already have a plan?",
      canvasPreview: "View the Trip Canvas preview",
      submitToast: "Preview input received. This prototype is not connected to AI and does not save your input.",
      canvasToast: "The Trip Canvas preview will open gradually in a later release.",
    },
    human: {
      eyebrow: "Product boundaries first",
      title: "A canvas for the plan. A fallback for execution.",
      body: "Chatbot understands and adjusts; Trip Canvas remembers each day and its preparation status; Today shows only one eligible next step. When evidence is missing, VisePanda says what is missing and offers a safe alternative or recovery path.",
      cta: "View workspace preview",
      toast: "This page is a product preview, not live human support or booking assistance.",
    },
    destinations: {
      title: "From an idea to a day you can actually carry out.",
      cards: [["First time in China", "The Planner example is a frontend preview."], ["The day changes", "The Canvas example is a frontend preview."], ["You need the next step on site", "The Today example is a frontend preview."]],
      cta: "View example",
    },
    features: {
      title: "Plan, remember, execute, recover.",
      subtitle: "Every step is visible. Every fact has a boundary.",
      items: [["Conversational planning", "Tell VisePanda your cities, dates, pace, interests, and constraints. Chatbot turns them into a candidate plan you can inspect in Canvas."], ["Trip Canvas", "Daily plans, places, preparation status, and pending changes stay in one visible trip. You must confirm every change."], ["Qualified execution facts", "Payment, Chinese addresses, entry, connectivity, and communication details need a source, scope, and review time. Missing evidence stays missing."], ["Today and recovery", "On the road, Today highlights one eligible next step. When it fails, you get a safe alternative, an official channel, or a controlled escalation boundary."]],
      more: "View details",
      less: "Hide details",
      slide: "Switch to capability",
    },
    reviews: {
      title: "Chatbot and Trip Canvas work in one workspace.",
      body: "This is a static product preview, not live travel data. Chatbot proposes candidates and adjustments; Canvas lets you review each day; changes can enter the Trip only after confirmation and deterministic checks.",
      status: "The current product is defined by what is genuinely available.",
      cta: "View current product",
      toast: "The current product is defined by what is genuinely available.",
      play: "Play product preview",
      pause: "Pause product preview",
    },
    planner: {
      title: "VisePanda: an AI planning and execution workspace",
      base: "VisePanda does more than generate itinerary text. Form or adjust a plan with Chatbot, inspect places, routes, and preparation status day by day in Trip Canvas, then use Today to handle the next step and changes on the road. The model can only propose candidates; deterministic systems still control fact eligibility, user confirmation, TripPatch, audit, and persistence boundaries.",
      expanded: "The product is still in Early Access and preview. Planner, Canvas, and Today will ship against fact and interface gates. This page does not represent live tickets, automatic booking, payment, or complete city coverage.",
      cta: "View current product",
      toast: "The current product entry will open when a real integration is ready.",
    },
    trust: {
      title: "Trust is not a wall of logos.",
      body: "For travel in China, what matters is where a fact came from, when it was reviewed, who confirmed a change, and how you recover when something fails.",
      badges: ["Traceable sources", "User confirmation", "Review time", "Failure recovery"],
      secondTitle: "Coverage is expanding by city and scenario.",
      secondBody: "This page does not claim complete China coverage, live inventory, or activated partners. Early Access first validates which facts and execution moments matter most.",
      secondBadges: ["Beijing", "Shanghai", "Guangzhou", "Chengdu", "Payment prep", "Connectivity prep", "On-site recovery"],
    },
    faq: {
      title: "Frequently asked questions",
      subtitle: "An honest explanation of the VisePanda preview and Early Access.",
      items: [["What is VisePanda?", "VisePanda is an AI planning and execution workspace for independent travel in China, combining a conversational Chatbot with a visible, persistent Trip Canvas."], ["How does VisePanda work?", "Describe your cities, dates, pace, interests, and constraints. A candidate plan enters a visible Canvas for review. On the road, Today highlights one qualified next step or tells you what is missing."], ["What is the difference between Chatbot and Trip Canvas?", "Chatbot understands, explains, and proposes candidates. Trip Canvas shows the single current trip state. The model cannot directly rewrite the Trip."], ["Can VisePanda book flights, hotels, or tickets?", "Not currently. The preview does not mean live inventory, prices, bookings, or orders are connected."], ["Can VisePanda pay for me?", "No. VisePanda does not pay on your behalf. Future commercial entry points require reviewed partners, clear disclosure, and an auditable ledger."], ["Where does VisePanda get travel information?", "Executable information needs a source, scope, review time, and expiry state. Without a qualified fact, VisePanda must say that it is unknown or unavailable."], ["Are all six execution moments live?", "Not yet. They will open gradually as fact coverage and operating evidence become ready."], ["Is Human Help live customer service or emergency rescue?", "No. Use official emergency channels for health and safety. Any human help must first define city, hours, task scope, capacity, and service limits."], ["Does VisePanda cover every city in China?", "No. Content and execution facts are expanding by city, scenario, and POI."], ["What is included in Early Access?", "The first invitations will gradually open planning, Canvas, and execution-preparation capabilities, subject to fact coverage and operating gates."], ["Is VisePanda free?", "The first invited Early Access experience may be free. Long-term pricing and partner revenue still need independent validation."], ["Does this page save my input?", "No. It is a frontend prototype. It does not call real AI or save prompts."]],
    },
    cta: {
      title: "Ready to see your trip to China more clearly?",
      body: "See how VisePanda organizes conversation, Trip Canvas, execution, and recovery.",
      button: "View current product",
      toast: "This is a frontend prototype. The real product entry is go2china.space.",
    },
    footer: {
      columns: [["Product", ["Product preview", "Planner", "Trip Canvas", "Today"]], ["Learn", ["Positioning", "Development", "Business plan", "GitHub"]], ["Trust", ["Privacy", "Terms", "Affiliate Disclosure", "Human Help Limits", "Emergency Disclaimer"]], ["Coverage", ["Beijing", "Shanghai", "Guangzhou", "Chengdu", "More cities gradually"]], ["Plan", ["First time in China", "Multi-city trip"]]],
      previewToast: "This is currently a frontend product preview.",
      copyright: "© 2026 VisePanda · Product preview",
      tagline: "Independent travel in China, thoughtfully prepared.",
    },
    modals: {
      close: "Close",
      languageTitle: "Interface language",
      languageToast: "Interface language changed to: ",
      displayTitle: "Display preferences preview",
      displayToast: "Display preference updated: ",
      privacyTitle: "Privacy note",
      privacyBody: "This prototype does not enable analytics or marketing cookies. The real product will follow its published privacy policy and deployment configuration.",
      privacyOptions: ["Essential features (off)", "Analytics (off)", "Marketing (off)", "Travel profile (off)"],
      privacyHint: "Shown only to indicate where privacy controls may appear in the real product.",
      displayOptions: [["US dollar", "$ - USD"], ["Euro", "€ - EUR"], ["Chinese yuan", "¥ - CNY"], ["British pound", "£ - GBP"], ["Japanese yen", "¥ - JPY"], ["Singapore dollar", "S$ - SGD"], ["Thai baht", "฿ - THB"], ["Australian dollar", "A$ - AUD"]],
    },
    auth: {
      language: "Interface language", eyebrow: "Invitation-only access", title: "Sign in to VisePanda", body: "Use the email and separate application password for your closed-beta account.", emailLabel: "Email", emailPlaceholder: "you@example.com", passwordLabel: "Password", passwordPlaceholder: "Application password", submit: "Sign in", submitting: "Signing in…", checking: "Checking session…", invalid: "The email or password is incorrect.", notProvisioned: "This invitation cannot continue right now. Contact the operator who issued it.", rateLimited: "Too many attempts. Try again later.", unavailable: "Sign-in is temporarily unavailable.", expired: "Your session expired. Sign in again.", signedInTitle: "You are signed in", signedInBody: "This browser now has an authenticated VisePanda session.", firstRunKicker: "Before you begin", firstRunTitle: "No trip has been created yet", firstRunBody: "After you enter the workspace, VisePanda will show an inspectable Trip Canvas here. This page does not create or save a trip automatically.", continue: "Continue to workspace", signOut: "Sign out", signingOut: "Signing out…", closedBeta: "Invitation-only closed beta", noSignup: "Public signup and password recovery are not available here.",
    },
    common: { attachment: "Add attachment", voice: "Voice input", send: "Send", backTop: "Back to top", referenceImage: "VisePanda China travel scene" },
  },
  es: {
    header: {
      home: "Inicio de VisePanda",
      preferences: "Preferencias",
      language: "Idioma de la interfaz",
      openMenu: "Abrir menú del producto",
      productMenu: "Menú del producto",
      closeMenu: "Cerrar menú",
      menu: ["Producto actual", "Vista previa del planificador", "Información del producto", "Preferencias de visualización", "Idioma", "Acerca de VisePanda", "Contacto", "Términos de uso"],
    },
    hero: {
      title: "Planifica tu viaje a China con IA y recórrelo con confianza.",
      subtitle: "VisePanda combina la conversación de viaje con un Trip Canvas práctico para quienes recorren China de forma independiente. Chatbot ayuda a planificar y ajustar, Canvas mantiene cada día visible y Today ofrece un siguiente paso fiable o una vía de recuperación.",
      placeholder: "Es mi primera vez en China: planifica 4 días en Pekín y revisa pagos, conexión y reservas",
      promptLabel: "Cuéntale a VisePanda tu plan de viaje a China",
      suggestions: ["Primera vez en China", "Pekín y Shanghái en 7 días", "Revisar pagos y conexión", "¿Cuál es el siguiente paso de hoy?"],
      existingPlan: "¿Ya tienes un plan?",
      canvasPreview: "Ver vista previa de Trip Canvas",
      submitToast: "Entrada de vista previa recibida. Este prototipo no usa IA ni guarda tus datos.",
      canvasToast: "La vista previa de Trip Canvas se abrirá gradualmente en una versión posterior.",
    },
    human: {
      eyebrow: "Primero, los límites del producto",
      title: "Un lienzo para el plan. Una salida cuando algo falla.",
      body: "Chatbot comprende y ajusta; Trip Canvas recuerda cada día y su preparación; Today muestra solo un siguiente paso apto. Si faltan pruebas, VisePanda explica qué falta y ofrece una alternativa segura o una vía de recuperación.",
      cta: "Ver vista previa del espacio",
      toast: "Esta página es una vista previa, no asistencia humana ni reservas en tiempo real.",
    },
    destinations: {
      title: "De una idea a un día que realmente puedes ejecutar.",
      cards: [["Primera vez en China", "El ejemplo de Planner es una vista previa frontend."], ["El plan del día cambia", "El ejemplo de Canvas es una vista previa frontend."], ["Necesitas el siguiente paso", "El ejemplo de Today es una vista previa frontend."]],
      cta: "Ver ejemplo",
    },
    features: {
      title: "Planificar, recordar, ejecutar, recuperar.",
      subtitle: "Cada paso es visible. Cada dato tiene límites.",
      items: [["Planificación conversacional", "Indica ciudades, fechas, ritmo, intereses y límites. Chatbot los ordena en un plan candidato que puedes revisar en Canvas."], ["Trip Canvas", "Los días, lugares, preparativos y cambios pendientes permanecen en un viaje visible. Tú confirmas cada cambio."], ["Datos de ejecución fiables", "Pagos, direcciones en chino, acceso, conexión y comunicación necesitan fuente, alcance y fecha de revisión. Sin pruebas, el dato queda ausente."], ["Today y recuperación", "Durante el viaje, Today resalta un solo siguiente paso apto. Si falla, ofrece una alternativa segura, un canal oficial o un límite de escalado controlado."]],
      more: "Ver detalles",
      less: "Ocultar detalles",
      slide: "Cambiar a capacidad",
    },
    reviews: {
      title: "Chatbot y Trip Canvas colaboran en un mismo espacio.",
      body: "Esta es una vista previa estática, no datos de viaje en tiempo real. Chatbot propone opciones y ajustes; Canvas permite revisar cada día; los cambios entran en el Trip solo tras confirmación y controles deterministas.",
      status: "El producto actual se define por lo que está realmente disponible.",
      cta: "Ver producto actual",
      toast: "El producto actual se define por lo que está realmente disponible.",
      play: "Reproducir vista previa",
      pause: "Pausar vista previa",
    },
    planner: {
      title: "VisePanda: espacio de planificación y ejecución con IA",
      base: "VisePanda no se limita a generar un itinerario. Forma o ajusta el plan con Chatbot, revisa lugares, rutas y preparación por día en Trip Canvas y usa Today para el siguiente paso y los cambios del viaje. El modelo solo propone opciones; los sistemas deterministas controlan datos, confirmación, TripPatch, auditoría y persistencia.",
      expanded: "El producto sigue en Early Access y vista previa. Planner, Canvas y Today se entregarán según umbrales de datos e interfaces. La página no representa billetes, reservas automáticas, pagos ni cobertura completa.",
      cta: "Ver producto actual",
      toast: "La entrada al producto se abrirá cuando exista una integración real.",
    },
    trust: {
      title: "La confianza no es una pared de logotipos.",
      body: "Para viajar por China importa saber de dónde sale un dato, cuándo se revisó, quién confirmó un cambio y cómo recuperarse de un fallo.",
      badges: ["Fuentes trazables", "Confirmación del usuario", "Fecha de revisión", "Recuperación"],
      secondTitle: "La cobertura crece por ciudad y escenario.",
      secondBody: "Esta página no afirma cobertura total de China, inventario en vivo ni socios activos. Early Access valida primero qué datos y momentos importan más.",
      secondBadges: ["Pekín", "Shanghái", "Guangzhou", "Chengdu", "Preparar pagos", "Preparar conexión", "Recuperación local"],
    },
    faq: {
      title: "Preguntas frecuentes",
      subtitle: "Explicación honesta de la vista previa y Early Access de VisePanda.",
      items: [["¿Qué es VisePanda?", "VisePanda es un espacio de planificación y ejecución con IA para viajar por China de forma independiente, con Chatbot y Trip Canvas."], ["¿Cómo funciona VisePanda?", "Describe ciudades, fechas, ritmo, intereses y límites. Un plan candidato entra en Canvas para revisión. Durante el viaje, Today muestra un siguiente paso apto o indica qué falta."], ["¿En qué se diferencian Chatbot y Trip Canvas?", "Chatbot comprende, explica y propone. Trip Canvas muestra el único estado actual del viaje. El modelo no puede reescribir el Trip directamente."], ["¿VisePanda puede reservar vuelos, hoteles o entradas?", "Todavía no. La vista previa no implica inventario, precios, reservas ni pedidos en tiempo real."], ["¿VisePanda puede pagar por mí?", "No. Los futuros accesos comerciales necesitan socios revisados, información clara y un registro auditable."], ["¿De dónde obtiene la información?", "Los datos ejecutables necesitan fuente, alcance, fecha de revisión y caducidad. Sin un dato válido, VisePanda debe indicar que es desconocido o no disponible."], ["¿Están activos los seis momentos?", "Aún no. Se abrirán según la cobertura de datos y la evidencia operativa."], ["¿Human Help es atención en vivo o rescate?", "No. Usa canales oficiales para salud y seguridad. La ayuda humana debe definir ciudad, horario, alcance, capacidad y límites."], ["¿Cubre todas las ciudades de China?", "No. El contenido y los datos crecen por ciudad, escenario y POI."], ["¿Qué incluye Early Access?", "Las primeras invitaciones abrirán gradualmente planificación, Canvas y preparación para la ejecución según sus umbrales."], ["¿VisePanda es gratis?", "Las primeras experiencias invitadas pueden ser gratuitas. El precio a largo plazo aún debe validarse."], ["¿Esta página guarda mis datos?", "No. Es un prototipo frontend: no llama a IA real ni guarda prompts."]],
    },
    cta: { title: "¿Listo para ver tu viaje a China con más claridad?", body: "Descubre cómo VisePanda organiza conversación, Trip Canvas, ejecución y recuperación.", button: "Ver producto actual", toast: "Esta página es un prototipo frontend. El producto real está en go2china.space." },
    footer: {
      columns: [["Producto", ["Vista previa", "Planner", "Trip Canvas", "Today"]], ["Conocer", ["Posicionamiento", "Desarrollo", "Plan de negocio", "GitHub"]], ["Confianza", ["Privacidad", "Términos", "Affiliate Disclosure", "Límites de Human Help", "Aviso de emergencias"]], ["Cobertura", ["Pekín", "Shanghái", "Guangzhou", "Chengdu", "Más ciudades gradualmente"]], ["Planificar", ["Primera vez en China", "Viaje multidestino"]]],
      previewToast: "Actualmente es una vista previa frontend.", copyright: "© 2026 VisePanda · Vista previa", tagline: "Viajes independientes por China, preparados con cuidado.",
    },
    modals: {
      close: "Cerrar", languageTitle: "Idioma de la interfaz", languageToast: "Idioma cambiado a: ", displayTitle: "Vista previa de preferencias", displayToast: "Preferencia actualizada: ", privacyTitle: "Nota de privacidad", privacyBody: "Este prototipo no activa cookies de análisis ni marketing. El producto real seguirá su política de privacidad y configuración de despliegue.", privacyOptions: ["Funciones esenciales (desactivadas)", "Analítica (desactivada)", "Marketing (desactivado)", "Perfil de viaje (desactivado)"], privacyHint: "Solo muestra dónde podrían aparecer los controles de privacidad.", displayOptions: [["Dólar estadounidense", "$ - USD"], ["Euro", "€ - EUR"], ["Yuan chino", "¥ - CNY"], ["Libra esterlina", "£ - GBP"], ["Yen japonés", "¥ - JPY"], ["Dólar de Singapur", "S$ - SGD"], ["Baht tailandés", "฿ - THB"], ["Dólar australiano", "A$ - AUD"]],
    },
    auth: {
      language: "Idioma de la interfaz", eyebrow: "Acceso solo por invitación", title: "Inicia sesión en VisePanda", body: "Usa el correo y la contraseña de aplicación independiente de tu cuenta closed beta.", emailLabel: "Correo electrónico", emailPlaceholder: "you@example.com", passwordLabel: "Contraseña", passwordPlaceholder: "Contraseña de la aplicación", submit: "Iniciar sesión", submitting: "Iniciando sesión…", checking: "Comprobando la sesión…", invalid: "El correo o la contraseña no son correctos.", notProvisioned: "Esta invitación no puede continuar ahora. Contacta al operador que la emitió.", rateLimited: "Demasiados intentos. Inténtalo más tarde.", unavailable: "El inicio de sesión no está disponible temporalmente.", expired: "Tu sesión expiró. Inicia sesión de nuevo.", signedInTitle: "Sesión iniciada", signedInBody: "Este navegador ya tiene una sesión autenticada de VisePanda.", firstRunKicker: "Antes de empezar", firstRunTitle: "Aún no se ha creado un viaje", firstRunBody: "Al entrar al espacio de trabajo, VisePanda mostrará aquí un Trip Canvas revisable. Esta página no crea ni guarda un viaje automáticamente.", continue: "Continuar al espacio de trabajo", signOut: "Cerrar sesión", signingOut: "Cerrando sesión…", closedBeta: "Closed beta solo por invitación", noSignup: "Aquí no están disponibles el registro público ni la recuperación de contraseña.",
    },
    common: { attachment: "Añadir archivo", voice: "Entrada de voz", send: "Enviar", backTop: "Volver arriba", referenceImage: "Escena de viaje VisePanda en China" },
  },
  ru: {
    header: {
      home: "Главная VisePanda", preferences: "Настройки", language: "Язык интерфейса", openMenu: "Открыть меню продукта", productMenu: "Меню продукта", closeMenu: "Закрыть меню", menu: ["Текущий продукт", "Предпросмотр Planner", "О продукте", "Настройки отображения", "Язык", "О VisePanda", "Контакты", "Условия использования"],
    },
    hero: {
      title: "Спланируйте поездку по Китаю с ИИ — и путешествуйте уверенно.",
      subtitle: "VisePanda объединяет диалог о поездке и практичный Trip Canvas для самостоятельных путешественников по Китаю. Chatbot помогает планировать и менять маршрут, Canvas показывает каждый день, а Today предлагает один надёжный следующий шаг или путь восстановления.",
      placeholder: "Впервые в Китае: составь план на 4 дня в Пекине и проверь оплату, связь и бронирования",
      promptLabel: "Расскажите VisePanda о поездке в Китай",
      suggestions: ["Впервые в Китае", "Пекин и Шанхай за 7 дней", "Проверить оплату и связь", "Что делать дальше сегодня?"],
      existingPlan: "Уже есть план?", canvasPreview: "Открыть предпросмотр Trip Canvas", submitToast: "Данные предпросмотра получены. Прототип не подключён к ИИ и не сохраняет ввод.", canvasToast: "Предпросмотр Trip Canvas будет открываться постепенно в следующих версиях.",
    },
    human: {
      eyebrow: "Сначала границы продукта", title: "План на Canvas. Восстановление при сбое.", body: "Chatbot понимает и корректирует; Trip Canvas хранит дни и состояние подготовки; Today показывает только один допустимый следующий шаг. Если фактов не хватает, VisePanda объясняет, чего именно, и предлагает безопасную альтернативу.", cta: "Открыть предпросмотр", toast: "Это предпросмотр продукта, а не живая поддержка или сервис бронирования.",
    },
    destinations: {
      title: "От идеи — к дню, который можно выполнить.", cards: [["Впервые в Китае", "Пример Planner — только frontend-предпросмотр."], ["План дня изменился", "Пример Canvas — только frontend-предпросмотр."], ["Нужен следующий шаг на месте", "Пример Today — только frontend-предпросмотр."]], cta: "Открыть пример",
    },
    features: {
      title: "Планировать, помнить, выполнять, восстанавливаться.", subtitle: "Каждый шаг видим. У каждого факта есть границы.", items: [["Диалоговое планирование", "Укажите города, даты, темп, интересы и ограничения. Chatbot собирает их в кандидатный план для проверки в Canvas."], ["Trip Canvas", "Дни, места, подготовка и ожидающие изменения остаются в одном видимом маршруте. Каждое изменение подтверждает пользователь."], ["Проверенные факты исполнения", "Оплата, китайские адреса, вход, связь и коммуникация требуют источника, области действия и даты проверки."], ["Today и восстановление", "В поездке Today выделяет один допустимый шаг. При сбое показывает безопасную альтернативу, официальный канал или границы эскалации."]], more: "Подробнее", less: "Скрыть", slide: "Переключить возможность",
    },
    reviews: {
      title: "Chatbot и Trip Canvas работают вместе.", body: "Это статический предпросмотр, а не данные в реальном времени. Chatbot предлагает варианты, Canvas позволяет проверить каждый день; изменения попадают в Trip только после подтверждения и детерминированных проверок.", status: "Текущий продукт определяется реально доступными возможностями.", cta: "Открыть текущий продукт", toast: "Текущий продукт определяется реально доступными возможностями.", play: "Запустить предпросмотр", pause: "Приостановить предпросмотр",
    },
    planner: {
      title: "VisePanda: пространство планирования и исполнения с ИИ", base: "VisePanda не просто генерирует текст маршрута. Создавайте и меняйте план с Chatbot, проверяйте места, маршруты и подготовку по дням в Trip Canvas, а Today используйте для следующего шага и изменений в пути. Модель лишь предлагает варианты; факты, подтверждение, TripPatch, аудит и сохранение контролируются детерминированной системой.", expanded: "Продукт остаётся в Early Access. Planner, Canvas и Today выпускаются по мере готовности фактов и интерфейсов. Страница не означает живые билеты, автоматическое бронирование, оплату или полное покрытие городов.", cta: "Открыть текущий продукт", toast: "Вход в продукт появится после готовности реальной интеграции.",
    },
    trust: {
      title: "Доверие — не стена логотипов.", body: "Для поездки по Китаю важно знать источник факта, время проверки, кто подтвердил изменение и как восстановиться после сбоя.", badges: ["Проверяемые источники", "Подтверждение пользователя", "Время проверки", "Восстановление"], secondTitle: "Покрытие растёт по городам и сценариям.", secondBody: "Страница не заявляет полного покрытия Китая, живого инвентаря или активных партнёров. Early Access сначала проверяет самые важные факты и моменты исполнения.", secondBadges: ["Пекин", "Шанхай", "Гуанчжоу", "Чэнду", "Подготовка оплаты", "Подготовка связи", "Восстановление на месте"],
    },
    faq: {
      title: "Частые вопросы", subtitle: "Честное описание предпросмотра VisePanda и Early Access.", items: [["Что такое VisePanda?", "VisePanda — пространство планирования и исполнения поездки по Китаю с Chatbot и видимым Trip Canvas."], ["Как работает VisePanda?", "Опишите города, даты, темп, интересы и ограничения. Кандидатный план появляется в Canvas. В поездке Today показывает один подходящий шаг или сообщает, чего не хватает."], ["Чем отличаются Chatbot и Trip Canvas?", "Chatbot понимает, объясняет и предлагает. Trip Canvas показывает единственное текущее состояние поездки. Модель не меняет Trip напрямую."], ["Можно ли бронировать билеты и отели?", "Пока нет. Предпросмотр не означает живой инвентарь, цены, бронирования или заказы."], ["Может ли VisePanda платить за меня?", "Нет. Будущие коммерческие функции требуют проверенных партнёров, прозрачного раскрытия и аудита."], ["Откуда берётся информация?", "Исполнимые сведения требуют источника, области действия, даты проверки и срока годности. Без проверенного факта VisePanda сообщает, что он неизвестен."], ["Все шесть моментов уже доступны?", "Нет. Они будут открываться по мере готовности покрытия и операционных доказательств."], ["Human Help — живая поддержка или спасение?", "Нет. Для здоровья и безопасности используйте официальные экстренные каналы. Любая помощь должна определить город, время, объём и ограничения."], ["Покрыты все города Китая?", "Нет. Контент и факты расширяются по городам, сценариям и POI."], ["Что входит в Early Access?", "Планирование, Canvas и подготовка к исполнению будут открываться постепенно по мере готовности фактов."], ["VisePanda бесплатна?", "Первые приглашённые версии могут быть бесплатными. Долгосрочная цена ещё проверяется."], ["Страница сохраняет мой ввод?", "Нет. Это frontend-прототип: он не вызывает реальный ИИ и не сохраняет запросы."]],
    },
    cta: { title: "Хотите видеть поездку по Китаю яснее?", body: "Посмотрите, как VisePanda объединяет диалог, Trip Canvas, исполнение и восстановление.", button: "Открыть текущий продукт", toast: "Это frontend-прототип. Реальный продукт находится на go2china.space." },
    footer: {
      columns: [["Продукт", ["Предпросмотр", "Planner", "Trip Canvas", "Today"]], ["Узнать", ["Позиционирование", "Разработка", "Бизнес-план", "GitHub"]], ["Доверие", ["Конфиденциальность", "Условия", "Affiliate Disclosure", "Ограничения Human Help", "Экстренное уведомление"]], ["Покрытие", ["Пекин", "Шанхай", "Гуанчжоу", "Чэнду", "Больше городов постепенно"]], ["План", ["Впервые в Китае", "Несколько городов"]]], previewToast: "Сейчас это frontend-предпросмотр.", copyright: "© 2026 VisePanda · Предпросмотр", tagline: "Самостоятельные поездки по Китаю, продуманные заранее.",
    },
    modals: {
      close: "Закрыть", languageTitle: "Язык интерфейса", languageToast: "Язык изменён: ", displayTitle: "Предпросмотр настроек", displayToast: "Настройка обновлена: ", privacyTitle: "О конфиденциальности", privacyBody: "Прототип не включает аналитические и маркетинговые cookie. Реальный продукт будет следовать опубликованной политике и конфигурации.", privacyOptions: ["Основные функции (выкл.)", "Аналитика (выкл.)", "Маркетинг (выкл.)", "Профиль поездки (выкл.)"], privacyHint: "Только показывает возможное расположение настроек конфиденциальности.", displayOptions: [["Доллар США", "$ - USD"], ["Евро", "€ - EUR"], ["Китайский юань", "¥ - CNY"], ["Фунт стерлингов", "£ - GBP"], ["Японская иена", "¥ - JPY"], ["Сингапурский доллар", "S$ - SGD"], ["Тайский бат", "฿ - THB"], ["Австралийский доллар", "A$ - AUD"]],
    },
    auth: {
      language: "Язык интерфейса", eyebrow: "Доступ только по приглашению", title: "Вход в VisePanda", body: "Используйте электронную почту и отдельный пароль приложения для closed beta.", emailLabel: "Электронная почта", emailPlaceholder: "you@example.com", passwordLabel: "Пароль", passwordPlaceholder: "Пароль приложения", submit: "Войти", submitting: "Выполняется вход…", checking: "Проверка сессии…", invalid: "Неверная почта или пароль.", notProvisioned: "Это приглашение сейчас нельзя продолжить. Свяжитесь с оператором, который его выдал.", rateLimited: "Слишком много попыток. Повторите позже.", unavailable: "Вход временно недоступен.", expired: "Сессия истекла. Войдите снова.", signedInTitle: "Вы вошли", signedInBody: "В этом браузере создана подтверждённая сессия VisePanda.", firstRunKicker: "Перед началом", firstRunTitle: "Поездка ещё не создана", firstRunBody: "После входа в рабочее пространство VisePanda покажет здесь проверяемый Trip Canvas. Эта страница не создаёт и не сохраняет поездку автоматически.", continue: "Перейти в рабочее пространство", signOut: "Выйти", signingOut: "Выполняется выход…", closedBeta: "Closed beta по приглашению", noSignup: "Публичная регистрация и восстановление пароля здесь недоступны.",
    },
    common: { attachment: "Добавить файл", voice: "Голосовой ввод", send: "Отправить", backTop: "Наверх", referenceImage: "Сцена поездки VisePanda по Китаю" },
  },
  ar: {
    header: {
      home: "الصفحة الرئيسية لـ VisePanda", preferences: "التفضيلات", language: "لغة الواجهة", openMenu: "فتح قائمة المنتج", productMenu: "قائمة المنتج", closeMenu: "إغلاق القائمة", menu: ["المنتج الحالي", "معاينة التخطيط", "معلومات المنتج", "تفضيلات العرض", "اللغة", "حول VisePanda", "اتصل بنا", "شروط الاستخدام"],
    },
    hero: {
      title: "خطّط لرحلتك إلى الصين بالذكاء الاصطناعي، ثم نفّذها بثقة.", subtitle: "يجمع VisePanda بين محادثة السفر وTrip Canvas عملي للمسافرين المستقلين إلى الصين. يساعدك Chatbot على التخطيط والتعديل، ويُظهر Canvas كل يوم بوضوح، ويقدّم Today خطوة تالية موثوقة أو مساراً للتعافي أثناء الرحلة.", placeholder: "هذه زيارتي الأولى للصين: خطط لأربعة أيام في بكين وتحقق من الدفع والاتصال والحجوزات", promptLabel: "أخبر VisePanda عن رحلتك إلى الصين", suggestions: ["أول زيارة إلى الصين", "بكين وشنغهاي في 7 أيام", "التحقق من الدفع والاتصال", "ما الخطوة التالية اليوم؟"], existingPlan: "لديك خطة بالفعل؟", canvasPreview: "عرض معاينة Trip Canvas", submitToast: "تم استلام الإدخال التجريبي. هذا النموذج غير متصل بالذكاء الاصطناعي ولا يحفظ مدخلاتك.", canvasToast: "ستُفتح معاينة Trip Canvas تدريجياً في إصدار لاحق.",
    },
    human: {
      eyebrow: "حدود المنتج أولاً", title: "لوحة للخطة، ومسار بديل عند التنفيذ.", body: "يفهم Chatbot ويعدّل؛ ويتذكر Trip Canvas كل يوم وحالة الاستعداد؛ ولا يعرض Today إلا خطوة واحدة مؤهلة. عند نقص الأدلة، يوضح VisePanda ما ينقص ويقترح بديلاً آمناً أو مسار تعافٍ.", cta: "عرض معاينة مساحة العمل", toast: "هذه الصفحة معاينة للمنتج وليست دعماً بشرياً مباشراً أو خدمة حجز.",
    },
    destinations: {
      title: "من فكرة إلى يوم يمكنك تنفيذه فعلاً.", cards: [["أول زيارة إلى الصين", "مثال Planner هو معاينة للواجهة فقط."], ["تغيّرت خطة اليوم", "مثال Canvas هو معاينة للواجهة فقط."], ["تحتاج إلى الخطوة التالية في الموقع", "مثال Today هو معاينة للواجهة فقط."]], cta: "عرض المثال",
    },
    features: {
      title: "خطّط، تذكّر، نفّذ، وتعافَ.", subtitle: "كل خطوة ظاهرة، ولكل حقيقة حدود.", items: [["التخطيط بالمحادثة", "أدخل المدن والتواريخ والإيقاع والاهتمامات والقيود. يحولها Chatbot إلى خطة مرشحة يمكنك مراجعتها في Canvas."], ["Trip Canvas", "تبقى الأيام والأماكن وحالة الاستعداد والتغييرات المعلّقة في رحلة واحدة واضحة. يجب أن تؤكد كل تغيير."], ["حقائق تنفيذ مؤهلة", "تحتاج معلومات الدفع والعناوين الصينية والدخول والاتصال والتواصل إلى مصدر ونطاق ووقت مراجعة. ما بلا دليل يبقى غير متاح."], ["Today والتعافي", "أثناء الرحلة يبرز Today خطوة واحدة مؤهلة. وعند الفشل يقدّم بديلاً آمناً أو قناة رسمية أو حدود تصعيد مضبوطة."]], more: "عرض التفاصيل", less: "إخفاء التفاصيل", slide: "الانتقال إلى القدرة",
    },
    reviews: {
      title: "يعمل Chatbot وTrip Canvas في مساحة عمل واحدة.", body: "هذه معاينة ثابتة وليست بيانات سفر مباشرة. يقترح Chatbot الخيارات والتعديلات، ويتيح Canvas مراجعة كل يوم، ولا تدخل التغييرات إلى Trip إلا بعد التأكيد والفحوص الحتمية.", status: "المنتج الحالي هو ما هو متاح فعلياً.", cta: "عرض المنتج الحالي", toast: "المنتج الحالي هو ما هو متاح فعلياً.", play: "تشغيل معاينة المنتج", pause: "إيقاف معاينة المنتج مؤقتاً",
    },
    planner: {
      title: "VisePanda: مساحة عمل للتخطيط والتنفيذ بالذكاء الاصطناعي", base: "لا يكتفي VisePanda بإنشاء نص لمسار الرحلة. كوّن الخطة أو عدّلها عبر Chatbot، وراجع الأماكن والطرق والاستعداد يوماً بيوم في Trip Canvas، ثم استخدم Today للخطوة التالية والتغييرات أثناء الرحلة. لا يقدم النموذج إلا اقتراحات؛ وتظل أهلية الحقائق والتأكيد وTripPatch والتدقيق والحفظ تحت أنظمة حتمية.", expanded: "لا يزال المنتج ضمن Early Access والمعاينة. سيتم تقديم Planner وCanvas وToday وفق جاهزية الحقائق والواجهات. لا تمثل الصفحة تذاكر مباشرة أو حجزاً تلقائياً أو دفعاً أو تغطية كاملة للمدن.", cta: "عرض المنتج الحالي", toast: "سيفتح مدخل المنتج عند جاهزية التكامل الحقيقي.",
    },
    trust: {
      title: "الثقة ليست جداراً من الشعارات.", body: "في السفر إلى الصين، المهم هو مصدر المعلومة ووقت مراجعتها ومن أكد التغيير وكيفية التعافي عند الفشل.", badges: ["مصادر قابلة للتتبع", "تأكيد المستخدم", "وقت المراجعة", "التعافي من الفشل"], secondTitle: "تتوسع التغطية حسب المدينة والسيناريو.", secondBody: "لا تدّعي هذه الصفحة تغطية الصين كاملة أو مخزوناً مباشراً أو شركاء مفعّلين. تتحقق Early Access أولاً من الحقائق ولحظات التنفيذ الأكثر أهمية.", secondBadges: ["بكين", "شنغهاي", "قوانغتشو", "تشنغدو", "الاستعداد للدفع", "الاستعداد للاتصال", "التعافي في الموقع"],
    },
    faq: {
      title: "الأسئلة الشائعة", subtitle: "شرح صريح لمعاينة VisePanda وEarly Access.", items: [["ما هو VisePanda؟", "VisePanda مساحة عمل للتخطيط والتنفيذ بالذكاء الاصطناعي للسفر المستقل في الصين، تجمع Chatbot مع Trip Canvas واضح ومستمر."], ["كيف يعمل VisePanda؟", "صف المدن والتواريخ والإيقاع والاهتمامات والقيود. تدخل الخطة المرشحة إلى Canvas للمراجعة. أثناء الرحلة يبرز Today خطوة مؤهلة أو يوضح ما ينقص."], ["ما الفرق بين Chatbot وTrip Canvas؟", "يفهم Chatbot ويشرح ويقترح؛ ويعرض Trip Canvas الحالة الحالية الوحيدة للرحلة. لا يستطيع النموذج تعديل Trip مباشرة."], ["هل يستطيع VisePanda حجز الرحلات والفنادق والتذاكر؟", "ليس حالياً. لا تعني المعاينة وجود مخزون أو أسعار أو حجوزات أو طلبات مباشرة."], ["هل يستطيع VisePanda الدفع نيابةً عني؟", "لا. تتطلب أي بوابة تجارية مستقبلية شركاء مراجعين وإفصاحاً واضحاً وسجلاً قابلاً للتدقيق."], ["من أين تأتي معلومات السفر؟", "تحتاج المعلومات القابلة للتنفيذ إلى مصدر ونطاق ووقت مراجعة وحالة انتهاء. دون حقيقة مؤهلة، يوضح VisePanda أنها مجهولة أو غير متاحة."], ["هل لحظات التنفيذ الست متاحة؟", "ليس بعد. ستُفتح تدريجياً حسب تغطية الحقائق والأدلة التشغيلية."], ["هل Human Help خدمة مباشرة أو إنقاذ طارئ؟", "لا. استخدم القنوات الرسمية للصحة والسلامة. يجب أن تحدد أي مساعدة بشرية المدينة والساعات والنطاق والسعة والحدود."], ["هل يغطي VisePanda كل مدن الصين؟", "لا. تتوسع المحتويات والحقائق حسب المدينة والسيناريو ونقطة الاهتمام."], ["ماذا تتضمن Early Access؟", "ستفتح الدعوات الأولى التخطيط وCanvas والاستعداد للتنفيذ تدريجياً وفق جاهزية الحقائق."], ["هل VisePanda مجاني؟", "قد تكون التجارب الأولى المدعوة مجانية. لا يزال التسعير طويل الأجل بحاجة إلى تحقق مستقل."], ["هل تحفظ هذه الصفحة مدخلاتي؟", "لا. إنها نموذج frontend ولا تستدعي ذكاءً اصطناعياً حقيقياً ولا تحفظ الأوامر."]],
    },
    cta: { title: "هل أنت مستعد لرؤية رحلتك إلى الصين بوضوح أكبر؟", body: "شاهد كيف ينظم VisePanda المحادثة وTrip Canvas والتنفيذ والتعافي.", button: "عرض المنتج الحالي", toast: "هذه الصفحة نموذج frontend. مدخل المنتج الحقيقي هو go2china.space." },
    footer: {
      columns: [["المنتج", ["معاينة المنتج", "Planner", "Trip Canvas", "Today"]], ["تعرّف", ["تموضع المنتج", "التطوير", "خطة الأعمال", "GitHub"]], ["الثقة", ["الخصوصية", "الشروط", "Affiliate Disclosure", "حدود Human Help", "إخلاء مسؤولية الطوارئ"]], ["التغطية", ["بكين", "شنغهاي", "قوانغتشو", "تشنغدو", "مدن أكثر تدريجياً"]], ["التخطيط", ["أول زيارة إلى الصين", "رحلة متعددة المدن"]]], previewToast: "هذا حالياً نموذج frontend.", copyright: "© 2026 VisePanda · معاينة المنتج", tagline: "سفر مستقل في الصين، مُعد بعناية.",
    },
    modals: {
      close: "إغلاق", languageTitle: "لغة الواجهة", languageToast: "تم تغيير اللغة إلى: ", displayTitle: "معاينة تفضيلات العرض", displayToast: "تم تحديث التفضيل: ", privacyTitle: "ملاحظة الخصوصية", privacyBody: "لا يفعّل هذا النموذج ملفات تعريف ارتباط للتحليلات أو التسويق. سيتبع المنتج الحقيقي سياسة الخصوصية وإعدادات النشر المعلنة.", privacyOptions: ["الميزات الأساسية (متوقفة)", "التحليلات (متوقفة)", "التسويق (متوقف)", "ملف السفر (متوقف)"], privacyHint: "يُعرض فقط لتوضيح مكان ظهور ضوابط الخصوصية مستقبلاً.", displayOptions: [["الدولار الأمريكي", "$ - USD"], ["اليورو", "€ - EUR"], ["اليوان الصيني", "¥ - CNY"], ["الجنيه الإسترليني", "£ - GBP"], ["الين الياباني", "¥ - JPY"], ["الدولار السنغافوري", "S$ - SGD"], ["البات التايلاندي", "฿ - THB"], ["الدولار الأسترالي", "A$ - AUD"]],
    },
    auth: {
      language: "لغة الواجهة", eyebrow: "الدخول بالدعوة فقط", title: "تسجيل الدخول إلى VisePanda", body: "استخدم البريد الإلكتروني وكلمة مرور التطبيق المنفصلة لحساب closed beta.", emailLabel: "البريد الإلكتروني", emailPlaceholder: "you@example.com", passwordLabel: "كلمة المرور", passwordPlaceholder: "كلمة مرور التطبيق", submit: "تسجيل الدخول", submitting: "جارٍ تسجيل الدخول…", checking: "جارٍ التحقق من الجلسة…", invalid: "البريد الإلكتروني أو كلمة المرور غير صحيحة.", notProvisioned: "لا يمكن متابعة هذه الدعوة الآن. تواصل مع المشغّل الذي أصدرها.", rateLimited: "محاولات كثيرة جداً. حاول لاحقاً.", unavailable: "تسجيل الدخول غير متاح مؤقتاً.", expired: "انتهت جلستك. سجّل الدخول مرة أخرى.", signedInTitle: "تم تسجيل الدخول", signedInBody: "لدى هذا المتصفح الآن جلسة VisePanda موثقة.", firstRunKicker: "قبل أن تبدأ", firstRunTitle: "لم يتم إنشاء رحلة بعد", firstRunBody: "بعد دخول مساحة العمل، سيعرض VisePanda هنا Trip Canvas قابلاً للمراجعة. لا تنشئ هذه الصفحة رحلة ولا تحفظها تلقائياً.", continue: "المتابعة إلى مساحة العمل", signOut: "تسجيل الخروج", signingOut: "جارٍ تسجيل الخروج…", closedBeta: "نسخة closed beta بالدعوة فقط", noSignup: "التسجيل العام واستعادة كلمة المرور غير متاحين هنا.",
    },
    common: { attachment: "إضافة مرفق", voice: "إدخال صوتي", send: "إرسال", backTop: "العودة للأعلى", referenceImage: "مشهد سفر VisePanda في الصين" },
  },
} as const;

export type LocalizedCopy = (typeof copy)[Locale];

export const productShellCopy: Readonly<Record<Locale, Readonly<{
  destination: readonly [string, string, string, string, string, string];
  goldenRoute: string; canvas: string; todayTitle: string; preview: string; unavailable: string;
  noLive: string; proposal: string; ask: string; askTitle: string; askBody: string; placeholder: string;
  received: string; disclaimer: string; more: string;
}>>> = {
  zh: { destination: ["今日", "咨询", "协作", "工具", "探索", "我的"], goldenRoute: "Golden Route · 产品预览", canvas: "行程画布 · 只读预览", todayTitle: "清晰的下一步，让旅程稳步开始。", preview: "此预览不加载地图、不调用 AI、不保存输入，也不会修改行程。", unavailable: "能力暂不可用", noLive: "不宣称实时服务、预订、地图或行程数据。", proposal: "未来变更必须在确认前可见。", ask: "咨询 VisePanda", askTitle: "让旅程始终清楚可见。", askBody: "告诉我们城市、日期与限制。未来提案必须先展示，再由你确认。", placeholder: "规划第一次中国之旅", received: "已收到预览输入；未调用 AI、未保存、未写入行程。", disclaimer: "重要旅行信息请以合格证据和官方渠道复核。", more: "更多" },
  en: { destination: ["Today", "Ask", "Copilot", "Tools", "Explore", "Profile"], goldenRoute: "Golden Route · product preview", canvas: "Trip Canvas · read-only preview", todayTitle: "A steady route begins with the next clear step.", preview: "This preview does not load a map, call AI, save input, or change a Trip.", unavailable: "Capability unavailable", noLive: "No live provider, booking, map, or itinerary data is claimed.", proposal: "Future changes must be visible before confirmation.", ask: "Ask VisePanda", askTitle: "Keep the journey legible.", askBody: "Describe your city, dates, and constraints. A future proposal must be visible before confirmation.", placeholder: "Plan a first trip to China", received: "Preview received. No AI call, persistence, or Trip write occurred.", disclaimer: "Check important travel information with eligible evidence and official channels.", more: "More" },
  es: { destination: ["Hoy", "Consultar", "Copiloto", "Herramientas", "Explorar", "Perfil"], goldenRoute: "Golden Route · vista previa", canvas: "Trip Canvas · vista de solo lectura", todayTitle: "Una ruta firme empieza con el siguiente paso claro.", preview: "Esta vista no carga mapas, no llama a IA, no guarda entradas ni cambia un viaje.", unavailable: "Capacidad no disponible", noLive: "No se afirman proveedores, reservas, mapas ni itinerarios en vivo.", proposal: "Los cambios futuros deben ser visibles antes de confirmarlos.", ask: "Consultar VisePanda", askTitle: "Mantén el viaje claro.", askBody: "Describe tu ciudad, fechas y límites. Una propuesta futura debe ser visible antes de confirmarla.", placeholder: "Planear un primer viaje a China", received: "Vista previa recibida. No hubo llamada a IA, guardado ni cambio de viaje.", disclaimer: "Verifica la información importante con evidencia válida y canales oficiales.", more: "Más" },
  ru: { destination: ["Сегодня", "Спросить", "Помощник", "Инструменты", "Обзор", "Профиль"], goldenRoute: "Golden Route · предпросмотр", canvas: "Trip Canvas · только чтение", todayTitle: "Надёжный маршрут начинается с ясного следующего шага.", preview: "Этот предпросмотр не загружает карту, не вызывает ИИ, не сохраняет ввод и не меняет поездку.", unavailable: "Возможность недоступна", noLive: "Мы не заявляем о живых провайдерах, бронированиях, картах или маршрутах.", proposal: "Будущие изменения должны быть видны до подтверждения.", ask: "Спросить VisePanda", askTitle: "Сохраняйте ясность путешествия.", askBody: "Опишите город, даты и ограничения. Будущее предложение должно быть видно до подтверждения.", placeholder: "Спланировать первую поездку в Китай", received: "Предпросмотр получен. ИИ не вызывался, данные не сохранены, поездка не изменена.", disclaimer: "Проверяйте важную информацию по надёжным источникам и официальным каналам.", more: "Ещё" },
  ar: { destination: ["اليوم", "اسأل", "المساعد", "الأدوات", "استكشاف", "الملف"], goldenRoute: "Golden Route · معاينة المنتج", canvas: "Trip Canvas · معاينة للقراءة فقط", todayTitle: "يبدأ المسار الواثق بالخطوة التالية الواضحة.", preview: "لا تحمّل هذه المعاينة خريطة ولا تستدعي الذكاء الاصطناعي ولا تحفظ الإدخال ولا تغيّر الرحلة.", unavailable: "الميزة غير متاحة", noLive: "لا ندّعي توفر مزودين أو حجوزات أو خرائط أو مسارات مباشرة.", proposal: "يجب أن تكون التغييرات المستقبلية مرئية قبل التأكيد.", ask: "اسأل VisePanda", askTitle: "اجعل الرحلة واضحة.", askBody: "صف المدينة والتواريخ والقيود. يجب أن يظهر الاقتراح المستقبلي قبل التأكيد.", placeholder: "خطط لأول رحلة إلى الصين", received: "تم استلام المعاينة. لم يتم استدعاء الذكاء الاصطناعي أو حفظ البيانات أو تغيير الرحلة.", disclaimer: "تحقق من معلومات السفر المهمة عبر الأدلة المؤهلة والقنوات الرسمية.", more: "المزيد" },
};

export const chatThreadCopy: Readonly<Record<Locale, Readonly<{
  title: string; eyebrow: string; body: string; create: string; loading: string; empty: string;
  noTurns: string; signIn: string; unavailable: string; back: string; language: string; state: string;
  active: string; archived: string; recorded: string; startTurn: string; cancelTurn: string; starting: string; cancelling: string;
}>>> = {
  zh: { title: "聊天线程", eyebrow: "咨询 · 私有历史", body: "仅登录用户可查看自己的线程元数据。状态控制不会提交提示词、调用 AI 或写入行程。", create: "新建私有线程", loading: "正在读取你的线程…", empty: "还没有线程。新建线程不会自动发送消息。", noTurns: "尚未开始 Turn。", signIn: "登录后查看私有线程", unavailable: "线程暂不可用，请稍后再试。", back: "返回产品预览", language: "界面语言", state: "线程状态", active: "进行中", archived: "已归档", recorded: "条已记录的状态事件", startTurn: "开始受限 Turn", cancelTurn: "取消 Turn", starting: "正在开始…", cancelling: "正在取消…" },
  en: { title: "Chat threads", eyebrow: "Ask · private history", body: "Only signed-in users can view their own thread metadata. State controls never submit prompts, call AI, or write a Trip.", create: "Start a private thread", loading: "Loading your threads…", empty: "There are no threads yet. Creating one never sends a message automatically.", noTurns: "No Turn has started.", signIn: "Sign in to view private threads", unavailable: "Threads are unavailable right now. Please try again later.", back: "Back to product preview", language: "Interface language", state: "Thread state", active: "Active", archived: "Archived", recorded: "recorded state events", startTurn: "Start a bounded Turn", cancelTurn: "Cancel Turn", starting: "Starting…", cancelling: "Cancelling…" },
  es: { title: "Hilos de chat", eyebrow: "Consultar · historial privado", body: "Solo quienes han iniciado sesión pueden ver los metadatos de sus propios hilos. Los controles de estado no envían prompts, no llaman a IA ni modifican un viaje.", create: "Crear hilo privado", loading: "Cargando tus hilos…", empty: "Aún no hay hilos. Crear uno nunca envía un mensaje automáticamente.", noTurns: "Aún no ha empezado ningún Turn.", signIn: "Inicia sesión para ver hilos privados", unavailable: "Los hilos no están disponibles ahora. Inténtalo más tarde.", back: "Volver a la vista previa", language: "Idioma de la interfaz", state: "Estado del hilo", active: "Activo", archived: "Archivado", recorded: "eventos de estado registrados", startTurn: "Iniciar Turn limitado", cancelTurn: "Cancelar Turn", starting: "Iniciando…", cancelling: "Cancelando…" },
  ru: { title: "Чаты", eyebrow: "Спросить · приватная история", body: "Только вошедшие пользователи видят метаданные своих чатов. Управление состоянием не отправляет запросы, не вызывает ИИ и не меняет поездку.", create: "Создать приватный чат", loading: "Загружаем ваши чаты…", empty: "Чатов пока нет. Создание чата не отправляет сообщение автоматически.", noTurns: "Ни один Turn ещё не начат.", signIn: "Войдите, чтобы увидеть приватные чаты", unavailable: "Чаты сейчас недоступны. Повторите позже.", back: "Вернуться к предпросмотру", language: "Язык интерфейса", state: "Состояние чата", active: "Активен", archived: "В архиве", recorded: "записанных событий состояния", startTurn: "Начать ограниченный Turn", cancelTurn: "Отменить Turn", starting: "Запускаем…", cancelling: "Отменяем…" },
  ar: { title: "سلاسل المحادثة", eyebrow: "اسأل · سجل خاص", body: "لا يرى بيانات سلاسله إلا المستخدمون المسجلون. لا ترسل عناصر التحكم بالحالة المطالبات ولا تستدعي الذكاء الاصطناعي ولا تغيّر الرحلة.", create: "إنشاء سلسلة خاصة", loading: "جارٍ تحميل سلاسلك…", empty: "لا توجد سلاسل بعد. إنشاؤها لا يرسل رسالة تلقائياً.", noTurns: "لم يبدأ أي Turn بعد.", signIn: "سجّل الدخول لعرض السلاسل الخاصة", unavailable: "السلاسل غير متاحة الآن. حاول لاحقاً.", back: "العودة إلى معاينة المنتج", language: "لغة الواجهة", state: "حالة السلسلة", active: "نشطة", archived: "مؤرشفة", recorded: "أحداث حالة مسجلة", startTurn: "بدء Turn محدود", cancelTurn: "إلغاء Turn", starting: "جارٍ البدء…", cancelling: "جارٍ الإلغاء…" },
};

const failureMessages = (messages: readonly string[]): Readonly<Record<FailureCode, string>> =>
  Object.fromEntries(FAILURE_CODES.map((code, index) => [code, messages[index]])) as Readonly<Record<FailureCode, string>>;

// AI-44 is intentionally separate from landing-page copy: these are the future product error messages,
// not proof that a live Chatbot or HTTP/SSE endpoint exists today.
export const failureCopy: Readonly<Record<Locale, Readonly<Record<FailureCode, string>>>> = {
  zh: failureMessages(["请先登录后继续。", "你没有执行此操作的权限。", "请求过于频繁，请稍后再试。", "请检查输入后重试。", "此文件类型暂不支持。", "需要先确认具体范围。", "没有可用的合格证据。", "数据政策不允许此操作。", "相关信息已过期，请重新核实。", "服务暂时不可用，请稍后重试。", "请求超时，尚未产生结果。", "请求超时，结果状态不确定。", "结果未通过验证，请重试。", "为保证安全，此请求未被执行。", "当前额度已用尽，请稍后再试。", "请求已取消。", "行程已更新，请检查最新版本。", "该提案目前无法确认。", "此请求键已用于不同内容。", "数据正在更新，请稍后重试。", "发生了意外错误，请稍后再试。"]),
  en: failureMessages(["Please sign in to continue.", "You do not have permission for this action.", "Too many requests. Please try again later.", "Check your input and try again.", "This media type is not supported.", "Please clarify the scope first.", "No eligible evidence is available.", "Data policy does not allow this action.", "This information has expired; please recheck it.", "The service is temporarily unavailable.", "The request timed out before a result was produced.", "The request timed out and the result state is uncertain.", "The result did not pass validation.", "This request was not completed for safety.", "Your current budget is exhausted.", "The request was cancelled.", "The trip changed; review the latest version.", "This proposal can no longer be confirmed.", "This request key was used with different content.", "Data is updating; please try again shortly.", "An unexpected error occurred. Please try again."]),
  es: failureMessages(["Inicia sesión para continuar.", "No tienes permiso para esta acción.", "Demasiadas solicitudes. Inténtalo más tarde.", "Revisa la entrada e inténtalo de nuevo.", "Este tipo de archivo no es compatible.", "Primero aclara el alcance.", "No hay evidencia válida disponible.", "La política de datos no permite esta acción.", "Esta información ha caducado; vuelve a verificarla.", "El servicio no está disponible temporalmente.", "La solicitud agotó el tiempo antes de producir un resultado.", "La solicitud agotó el tiempo y el resultado es incierto.", "El resultado no superó la validación.", "Esta solicitud no se completó por seguridad.", "Tu cuota actual se ha agotado.", "La solicitud se canceló.", "El viaje cambió; revisa la versión más reciente.", "Esta propuesta ya no se puede confirmar.", "Esta clave de solicitud se usó con contenido distinto.", "Los datos se están actualizando; inténtalo pronto.", "Ocurrió un error inesperado. Inténtalo de nuevo."]),
  ru: failureMessages(["Войдите, чтобы продолжить.", "У вас нет прав для этого действия.", "Слишком много запросов. Повторите позже.", "Проверьте ввод и повторите попытку.", "Этот тип файла не поддерживается.", "Сначала уточните область запроса.", "Нет подходящих подтверждённых данных.", "Политика данных не разрешает это действие.", "Эти сведения устарели; проверьте их снова.", "Сервис временно недоступен.", "Время ожидания истекло до получения результата.", "Время ожидания истекло, статус результата неизвестен.", "Результат не прошёл проверку.", "Запрос не выполнен из соображений безопасности.", "Текущий лимит исчерпан.", "Запрос отменён.", "Поездка изменилась; проверьте последнюю версию.", "Это предложение больше нельзя подтвердить.", "Этот ключ запроса использован с другим содержимым.", "Данные обновляются; повторите попытку позже.", "Произошла непредвиденная ошибка. Повторите позже."]),
  ar: failureMessages(["سجّل الدخول للمتابعة.", "ليس لديك إذن لهذا الإجراء.", "عدد الطلبات كبير، حاول لاحقاً.", "راجع الإدخال ثم حاول مجدداً.", "نوع الملف غير مدعوم.", "يرجى توضيح النطاق أولاً.", "لا تتوفر أدلة مؤهلة.", "سياسة البيانات لا تسمح بهذا الإجراء.", "انتهت صلاحية هذه المعلومات؛ تحقق منها مجدداً.", "الخدمة غير متاحة مؤقتاً.", "انتهت مهلة الطلب قبل ظهور نتيجة.", "انتهت المهلة وحالة النتيجة غير مؤكدة.", "لم تجتز النتيجة التحقق.", "لم يكتمل الطلب لأسباب تتعلق بالسلامة.", "تم استهلاك الحصة الحالية.", "تم إلغاء الطلب.", "تغيّرت الرحلة؛ راجع أحدث إصدار.", "لم يعد بالإمكان تأكيد هذا الاقتراح.", "استُخدم مفتاح الطلب هذا مع محتوى مختلف.", "تجري تحديثات للبيانات؛ حاول قريباً.", "حدث خطأ غير متوقع. حاول مرة أخرى."]),
};
