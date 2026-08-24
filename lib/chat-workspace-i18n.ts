import type { Locale } from "@/lib/i18n";

export type ChatWorkspaceCopy = {
  nav: readonly string[];
  newChat: string;
  collapse: string;
  language: string;
  canvas: string;
  chat: string;
  list: string;
  map: string;
  tripBrief: string;
  briefItems: readonly string[];
  today: string;
  dayLabel: string;
  poiTitle: string;
  poiSubtitle: string;
  poiKinds: readonly string[];
  selected: string;
  add: string;
  previewOnly: string;
  chatEyebrow: string;
  chatTitle: string;
  chatBody: string;
  assistantLabel: string;
  greeting: string;
  response: string;
  placeholder: string;
  attach: string;
  voice: string;
  send: string;
  suggestionLabel: string;
  suggestions: readonly string[];
  disclaimer: string;
  viewChats: string;
  chatHistory: string;
  historyItem: string;
  close: string;
};

export const chatWorkspaceCopy: Record<Locale, ChatWorkspaceCopy> = {
  zh: {
    nav: ["聊天", "行程画布", "探索", "已保存"],
    newChat: "新对话",
    collapse: "收起导航",
    language: "界面语言",
    canvas: "行程画布",
    chat: "Chatbot",
    list: "列表",
    map: "地点视图",
    tripBrief: "行程摘要",
    briefItems: ["北京 · 4 天", "第一次来中国", "支付与网络准备"],
    today: "今天的准备",
    dayLabel: "第 1 天 · 抵达北京",
    poiTitle: "可加入画布的地点",
    poiSubtitle: "仅为产品预览，不代表实时营业、库存或预约状态。",
    poiKinds: ["景点示例", "文化示例", "街区示例"],
    selected: "已加入",
    add: "加入预览",
    previewOnly: "地点视图仅使用本地视觉素材，不连接地图服务。",
    chatEyebrow: "VisePanda AI · 产品预览",
    chatTitle: "把中国之旅说清楚，再把下一步走稳。",
    chatBody: "告诉 VisePanda 城市、日期和限制。任何建议都会先以可见画布变化呈现，等待你的确认。",
    assistantLabel: "VisePanda",
    greeting: "你好！这是本地 Chatbot 预览。我们可以先整理你的计划，再把候选变化放到 Canvas 中检查。",
    response: "已收到这条预览输入。真实产品会先生成可确认的 Proposal；当前页面不会调用 AI、保存输入或修改行程。",
    placeholder: "例如：第一次来中国，帮我安排北京 4 天，并检查支付和网络准备",
    attach: "添加附件",
    voice: "语音输入",
    send: "发送",
    suggestionLabel: "从这里开始",
    suggestions: ["规划北京 4 天", "检查支付准备", "今天下一步做什么？"],
    disclaimer: "VisePanda 可能出错。重要行程和执行信息请以合格来源与官方渠道复核。",
    viewChats: "查看对话",
    chatHistory: "对话",
    historyItem: "北京首访计划",
    close: "关闭",
  },
  en: {
    nav: ["Chat", "Trip Canvas", "Explore", "Saved"],
    newChat: "New chat",
    collapse: "Collapse navigation",
    language: "Interface language",
    canvas: "Trip Canvas",
    chat: "Chatbot",
    list: "List",
    map: "Place view",
    tripBrief: "Trip brief",
    briefItems: ["Beijing · 4 days", "First trip to China", "Payment and connectivity prep"],
    today: "Today’s preparation",
    dayLabel: "Day 1 · Arrive in Beijing",
    poiTitle: "Places to add to Canvas",
    poiSubtitle: "Product preview only. It does not represent live hours, inventory, or reservations.",
    poiKinds: ["Attraction example", "Culture example", "Neighbourhood example"],
    selected: "Added",
    add: "Add preview",
    previewOnly: "Place view uses project-local visual assets and does not connect to a map provider.",
    chatEyebrow: "VisePanda AI · Product preview",
    chatTitle: "Make the China trip clear, then make the next step steady.",
    chatBody: "Tell VisePanda your cities, dates, and constraints. Every suggestion first appears as a visible Canvas change for your confirmation.",
    assistantLabel: "VisePanda",
    greeting: "Hi! This is a local Chatbot preview. We can shape your plan first, then inspect candidate changes in the Canvas.",
    response: "Preview input received. The real product would create a confirmable Proposal first; this page does not call AI, save input, or change a Trip.",
    placeholder: "For example: plan four days in Beijing for my first China trip and check payment and connectivity prep",
    attach: "Attach",
    voice: "Voice input",
    send: "Send",
    suggestionLabel: "Start here",
    suggestions: ["Plan 4 days in Beijing", "Check payment prep", "What is my next step today?"],
    disclaimer: "VisePanda can make mistakes. Verify important travel and execution information with eligible evidence and official channels.",
    viewChats: "View chats",
    chatHistory: "Chats",
    historyItem: "First Beijing trip",
    close: "Close",
  },
  es: {
    nav: ["Chat", "Trip Canvas", "Explorar", "Guardado"],
    newChat: "Chat nuevo",
    collapse: "Contraer navegación",
    language: "Idioma de la interfaz",
    canvas: "Trip Canvas",
    chat: "Chatbot",
    list: "Lista",
    map: "Vista de lugares",
    tripBrief: "Resumen del viaje",
    briefItems: ["Pekín · 4 días", "Primer viaje a China", "Pagos y conectividad"],
    today: "Preparación de hoy",
    dayLabel: "Día 1 · Llegada a Pekín",
    poiTitle: "Lugares para añadir al Canvas",
    poiSubtitle: "Solo vista previa. No representa horarios, inventario ni reservas en vivo.",
    poiKinds: ["Ejemplo de atracción", "Ejemplo cultural", "Ejemplo de barrio"],
    selected: "Añadido",
    add: "Añadir vista previa",
    previewOnly: "La vista usa recursos visuales locales y no se conecta a un proveedor de mapas.",
    chatEyebrow: "VisePanda AI · Vista previa",
    chatTitle: "Aclara tu viaje a China y avanza con un siguiente paso estable.",
    chatBody: "Cuenta ciudades, fechas y límites. Cada sugerencia aparece primero como cambio visible en Canvas para tu confirmación.",
    assistantLabel: "VisePanda",
    greeting: "¡Hola! Esta es una vista previa local del Chatbot. Primero organizamos el plan y después revisamos los cambios candidatos en Canvas.",
    response: "Entrada de vista previa recibida. El producto real crearía primero una Proposal confirmable; esta página no llama a IA, no guarda datos ni cambia un Trip.",
    placeholder: "Por ejemplo: organiza cuatro días en Pekín para mi primer viaje a China y revisa pagos y conectividad",
    attach: "Adjuntar",
    voice: "Entrada de voz",
    send: "Enviar",
    suggestionLabel: "Empieza aquí",
    suggestions: ["Planear 4 días en Pekín", "Revisar pagos", "¿Cuál es mi siguiente paso hoy?"],
    disclaimer: "VisePanda puede equivocarse. Verifica la información importante con evidencia válida y canales oficiales.",
    viewChats: "Ver chats",
    chatHistory: "Chats",
    historyItem: "Primer viaje a Pekín",
    close: "Cerrar",
  },
  ru: {
    nav: ["Чат", "Trip Canvas", "Обзор", "Сохранённое"],
    newChat: "Новый чат",
    collapse: "Свернуть навигацию",
    language: "Язык интерфейса",
    canvas: "Trip Canvas",
    chat: "Чатбот",
    list: "Список",
    map: "Места",
    tripBrief: "Кратко о поездке",
    briefItems: ["Пекин · 4 дня", "Первая поездка в Китай", "Оплата и связь"],
    today: "Подготовка на сегодня",
    dayLabel: "День 1 · Прибытие в Пекин",
    poiTitle: "Места для Canvas",
    poiSubtitle: "Это только предпросмотр; он не показывает актуальные часы, наличие или бронирования.",
    poiKinds: ["Пример достопримечательности", "Пример культуры", "Пример района"],
    selected: "Добавлено",
    add: "Добавить в предпросмотр",
    previewOnly: "Экран мест использует локальные визуальные материалы и не подключён к картам.",
    chatEyebrow: "VisePanda AI · Предпросмотр",
    chatTitle: "Сделайте поездку в Китай понятной — и уверенно двигайтесь дальше.",
    chatBody: "Укажите города, даты и ограничения. Каждое предложение сначала появится как видимое изменение Canvas для подтверждения.",
    assistantLabel: "VisePanda",
    greeting: "Здравствуйте! Это локальный предпросмотр Чатбота. Сначала соберём план, затем проверим предлагаемые изменения в Canvas.",
    response: "Ввод предпросмотра получен. Реальный продукт сначала создаст подтверждаемую Proposal; эта страница не вызывает ИИ, не сохраняет ввод и не меняет Trip.",
    placeholder: "Например: спланируй 4 дня в Пекине для первой поездки в Китай и проверь оплату и связь",
    attach: "Прикрепить",
    voice: "Голосовой ввод",
    send: "Отправить",
    suggestionLabel: "Начните здесь",
    suggestions: ["4 дня в Пекине", "Проверить оплату", "Какой следующий шаг сегодня?"],
    disclaimer: "VisePanda может ошибаться. Проверяйте важную информацию по надёжным источникам и официальным каналам.",
    viewChats: "Открыть чаты",
    chatHistory: "Чаты",
    historyItem: "Первая поездка в Пекин",
    close: "Закрыть",
  },
  ar: {
    nav: ["الدردشة", "Trip Canvas", "استكشاف", "المحفوظات"],
    newChat: "دردشة جديدة",
    collapse: "طي التنقل",
    language: "لغة الواجهة",
    canvas: "Trip Canvas",
    chat: "Chatbot",
    list: "قائمة",
    map: "عرض الأماكن",
    tripBrief: "ملخص الرحلة",
    briefItems: ["بكين · 4 أيام", "أول زيارة للصين", "الاستعداد للدفع والاتصال"],
    today: "استعداد اليوم",
    dayLabel: "اليوم 1 · الوصول إلى بكين",
    poiTitle: "أماكن لإضافتها إلى Canvas",
    poiSubtitle: "هذه معاينة فقط ولا تمثل ساعات أو مخزوناً أو حجوزات مباشرة.",
    poiKinds: ["مثال لمعْلم", "مثال ثقافي", "مثال لمنطقة"],
    selected: "تمت الإضافة",
    add: "إضافة للمعاينة",
    previewOnly: "يستخدم عرض الأماكن مواد بصرية محلية ولا يتصل بمزود خرائط.",
    chatEyebrow: "VisePanda AI · معاينة المنتج",
    chatTitle: "وضّح رحلتك إلى الصين، ثم خذ الخطوة التالية بثبات.",
    chatBody: "اذكر المدن والتواريخ والقيود. يظهر كل اقتراح أولاً كتغيير مرئي في Canvas لتؤكده.",
    assistantLabel: "VisePanda",
    greeting: "مرحباً! هذه معاينة محلية للـ Chatbot. ننظم الخطة أولاً، ثم نراجع التغييرات المقترحة في Canvas.",
    response: "تم استلام إدخال المعاينة. ينشئ المنتج الحقيقي Proposal قابلة للتأكيد أولاً؛ هذه الصفحة لا تستدعي الذكاء الاصطناعي ولا تحفظ الإدخال ولا تغيّر Trip.",
    placeholder: "مثال: خطط أربعة أيام في بكين لأول زيارة لي إلى الصين وتحقق من الدفع والاتصال",
    attach: "إرفاق",
    voice: "إدخال صوتي",
    send: "إرسال",
    suggestionLabel: "ابدأ من هنا",
    suggestions: ["خطط 4 أيام في بكين", "تحقق من الدفع", "ما الخطوة التالية اليوم؟"],
    disclaimer: "قد يخطئ VisePanda. تحقق من معلومات السفر والتنفيذ المهمة عبر الأدلة المؤهلة والقنوات الرسمية.",
    viewChats: "عرض الدردشات",
    chatHistory: "الدردشات",
    historyItem: "أول رحلة إلى بكين",
    close: "إغلاق",
  },
};
