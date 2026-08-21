"use client";

import Image from "next/image";
import {
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  BedDouble,
  CircleDollarSign,
  CircleHelp,
  Diamond,
  FileText,
  HeartHandshake,
  Languages,
  LogIn,
  MessageCircle,
  Mic,
  Paperclip,
  Pause,
  Play,
  Plus,
  Send,
  Settings,
  Sparkles,
  Thermometer,
  UserRound,
  X,
  type IconComponent,
} from "@/components/icons";
import {
  type Dispatch,
  type KeyboardEvent,
  type MouseEvent,
  type ReactNode,
  type SetStateAction,
  useEffect,
  useState,
} from "react";

const ASSET_ROOT = "/assets/source/";

type ModalKind = "language" | "display" | "cookies" | null;
type ToastSetter = (message: string) => void;

type TripCard = {
  title: string;
  image: string;
  toast: string;
};

type FeatureItem = {
  title: string;
  icon: IconComponent;
  body: string;
};

type MediaPill = {
  image: string;
  text: string;
};

type BoundaryCard = {
  image: string;
  title: string;
  body: string;
};

type DeliveryCard = {
  image: string;
  title: string;
  status: string;
  body: string;
};

const trips: TripCard[] = [
  {
    title: "第一次来中国",
    image: "8aed3709273934a0.jpg",
    toast: "Planner 示例当前仅为前端预览。",
  },
  {
    title: "当天计划发生变化",
    image: "687064758b7a3b1a.jpg",
    toast: "Canvas 示例当前仅为前端预览。",
  },
  {
    title: "现场需要下一步",
    image: "853cd27a4a6e390d.jpg",
    toast: "Today 示例当前仅为前端预览。",
  },
];

const featureItems: FeatureItem[] = [
  {
    title: "对话式规划",
    icon: HeartHandshake,
    body: "告诉 VisePanda 城市、日期、节奏、兴趣和限制。Chatbot 将需求整理成可以在 Canvas 中检查的候选计划。",
  },
  {
    title: "Trip Canvas",
    icon: CircleDollarSign,
    body: "每天的安排、地点、准备状态和待确认变化都在同一个可见行程里；修改必须由用户确认。",
  },
  {
    title: "可信执行事实",
    icon: Diamond,
    body: "支付、中文地址、入场、网络和沟通信息必须带来源、适用范围与复核时间；没有证据时不靠模型记忆补空。",
  },
  {
    title: "Today 与恢复",
    icon: UserRound,
    body: "旅途中只突出一个符合资格的下一步；失败时给出安全替代、官方渠道或受控人工升级边界。",
  },
];

const lifestyle: MediaPill[] = [
  { image: "d2f34179e7548e01.jpg", text: "Payment · 支付" },
  { image: "5c3742504a370cff.jpg", text: "Show to Local · 出示给当地人" },
  { image: "66eb7d06cfc2d822.jpg", text: "Entry / Booking · 入场与预约" },
  { image: "b30ba6f68400baab.jpg", text: "Translate / Communicate · 翻译与沟通" },
  { image: "a12b54fa7434259a.jpg", text: "Network · 网络" },
  { image: "a01f3611afdccfa6.jpg", text: "Rescue / Human Help · 恢复与人工协助" },
  { image: "ceffa8a9c7d2428b.jpg", text: "Payment · 支付" },
  { image: "b941bdacaf6a6262.jpg", text: "Rescue / Human Help · 恢复与人工协助" },
];

const partnerAssets = [
  "16a277efaa752b15.svg",
  "6613046bfbff97d7.svg",
  "fa98deb770c7938f.svg",
  "7d13d679ce024167.svg",
];

const pressAssets = [
  "af6ba65b0411c13d.svg",
  "42bfdd9db5788463.png",
  "563830f6964fb3ed.svg",
  "b124d61704339832.svg",
  "cd4de43fe389c172.svg",
  "78c151342977f60f.png",
  "0f5d41baffbb390b.svg",
];

const boundaries: BoundaryCard[] = [
  {
    image: "e99500749db59a7d.jpg",
    title: "不宣称完整中国覆盖",
    body: "城市与场景必须按事实覆盖逐步开放。",
  },
  {
    image: "45949fca2cb9454c.jpg",
    title: "不宣称实时票务或自动预订",
    body: "当前页面没有接入库存、价格或订单系统。",
  },
  {
    image: "776d7652be1c3a0a.jpg",
    title: "不代付、不激活未审核伙伴",
    body: "商业入口必须经过审核、披露与审计。",
  },
  {
    image: "2bfd0461aac96558.jpg",
    title: "不承诺实时 Human Help 或 SLA",
    body: "任何人工协助都必须先明确范围与容量。",
  },
];

const deliveryCards: DeliveryCard[] = [
  {
    image: "4a6d4eb502db2b51.webp",
    title: "Early Access",
    status: "逐步开放",
    body: "收集真实旅行问题，验证哪些准备事项最值得优先解决。",
  },
  {
    image: "7a4447f7d275511a.webp",
    title: "Planner",
    status: "产品预览",
    body: "先完成静态候选、缺失、冲突与不可用状态，再接真实事实。",
  },
  {
    image: "8e8e963cd7ed9618.webp",
    title: "Trip Canvas",
    status: "产品预览",
    body: "只读行程投影；后续修改必须走确认式 Patch。",
  },
  {
    image: "a6cd67d3f1d92abe.webp",
    title: "Today",
    status: "产品预览",
    body: "只显示一个符合资格的动作或明确的缺失与恢复状态。",
  },
  {
    image: "ad58ec98fa2d74a2.webp",
    title: "Execution Facts",
    status: "建设中",
    body: "支付、地址、入场、网络和沟通信息必须带来源与时效。",
  },
  {
    image: "be43bdaf4c330efa.webp",
    title: "Recovery",
    status: "建设中",
    body: "失败时不造假，优先给安全替代、官方渠道或受控升级边界。",
  },
];

const faqs: ReadonlyArray<readonly [string, string]> = [
  [
    "VisePanda 是什么？",
    "VisePanda 是面向来中国自由行的 AI 规划与执行工作台，结合一个对话式 Chatbot 与可见、可持续的 Trip Canvas。",
  ],
  [
    "VisePanda 是怎样工作的？",
    "你先通过对话说明城市、日期、节奏、兴趣和限制；候选计划进入可见 Canvas 供你检查。旅途中，Today 会突出一个有资格的下一步或说明缺什么。",
  ],
  [
    "Chatbot 和 Trip Canvas 有什么区别？",
    "Chatbot 负责理解、解释和提出候选；Trip Canvas 负责展示唯一的当前行程状态。模型不能直接改写 Trip。",
  ],
  [
    "VisePanda 可以直接预订机票、酒店或门票吗？",
    "当前不可以。产品预览不代表实时库存、价格、预订或订单服务已经接通。",
  ],
  [
    "VisePanda 可以替我付款吗？",
    "不可以。VisePanda 不代付；未来商业入口也必须通过已审核伙伴、明确披露和可审计账本后才能开放。",
  ],
  [
    "VisePanda 的旅行信息来自哪里？",
    "可执行信息需要记录来源、适用范围、复核时间和过期状态。没有合格事实时，VisePanda 应明确未知或不可用。",
  ],
  [
    "六个执行时刻都已经上线了吗？",
    "还没有。六个时刻会按事实覆盖和运行证据逐步交付。",
  ],
  [
    "Human Help 是实时客服或紧急救援吗？",
    "不是。健康与安全问题应优先使用官方紧急渠道；任何人工协助都必须先明确城市、时段、任务范围、容量和服务限制。",
  ],
  [
    "VisePanda 覆盖中国所有城市吗？",
    "不覆盖。内容和执行事实正在按城市、场景和 POI 逐步扩展。",
  ],
  [
    "Early Access 当前包括什么？",
    "首批体验将逐步开放规划、Canvas 和执行准备能力；邀请与功能开放取决于事实覆盖和运行门槛。",
  ],
  [
    "VisePanda 是免费的吗？",
    "Early Access 的首批受邀体验可以免费；长期定价和伙伴收入都需独立验证，当前页面不公布正式价格。",
  ],
  [
    "这个页面会保存我的输入吗？",
    "当前不会。它是前端产品原型，不调用真实 AI，也不保存 Prompt。",
  ],
];

const languages = ["English", "中文", "Español", "Русский", "العربية"];

const displayOptions: ReadonlyArray<readonly [string, string]> = [
  ["美元", "$ - USD"],
  ["欧元", "€ - EUR"],
  ["人民币", "¥ - CNY"],
  ["英镑", "£ - GBP"],
  ["日元", "¥ - JPY"],
  ["新加坡元", "S$ - SGD"],
  ["泰铢", "฿ - THB"],
  ["澳大利亚元", "A$ - AUD"],
];

function BrandClip() {
  return (
    <svg aria-hidden="true" className="clip-defs" focusable="false">
      <defs>
        <clipPath id="vp-clover" clipPathUnits="objectBoundingBox">
          <path
            d="M393 118.35C393 53.0155 339.983 0 274.539 0C244.647 0 217.299 11.1208 196.476 29.3838C175.653 11.1208 148.353 0 118.461 0C53.0173 0 0 52.9676 0 118.35C0 149.556 12.0908 177.885 31.8104 199.024C12.0908 220.163 0 248.492 0 279.698C0 345.032 53.0173 398.048 118.461 398.048C148.353 398.048 175.701 386.927 196.524 368.664C217.347 386.927 244.695 398.048 274.587 398.048C339.983 398.048 393.048 345.08 393.048 279.698C393.048 248.492 380.957 220.163 361.238 199.024C380.957 177.885 393.048 149.556 393.048 118.35H393Z"
            transform="scale(0.0025442185178400603, 0.002512259827960447)"
          />
        </clipPath>
      </defs>
    </svg>
  );
}

type OverlayProps = {
  title: string;
  onClose: () => void;
  children: ReactNode;
  wide?: boolean;
};

function Overlay({ title, onClose, children, wide = false }: OverlayProps) {
  const stopPropagation = (event: MouseEvent<HTMLElement>) => event.stopPropagation();

  return (
    <div className="overlay" role="presentation" onMouseDown={onClose}>
      <section
        className={`modal ${wide ? "modal-wide" : ""}`}
        role="dialog"
        aria-label={title}
        onMouseDown={stopPropagation}
      >
        <header>
          <h2>{title}</h2>
          <button className="icon-button" onClick={onClose} aria-label="关闭">
            <X />
          </button>
        </header>
        {children}
      </section>
    </div>
  );
}

type HeaderProps = {
  openMenu: boolean;
  setOpenMenu: Dispatch<SetStateAction<boolean>>;
  setModal: Dispatch<SetStateAction<ModalKind>>;
  unit: string;
  setUnit: Dispatch<SetStateAction<string>>;
};

function Header({ openMenu, setOpenMenu, setModal, unit, setUnit }: HeaderProps) {
  return (
    <nav className="site-nav">
      <a href="#top" className="logo-link" aria-label="VisePanda 首页">
        <Image
          src={`${ASSET_ROOT}7f7773d103c78b77.svg`}
          alt="VisePanda"
          width={59}
          height={24}
          unoptimized
          priority
        />
      </a>
      <div className="desktop-nav-actions">
        <button onClick={() => setModal("display")}>偏好</button>
        <button onClick={() => setModal("language")} aria-label="界面语言预览">
          <Image
            src={`${ASSET_ROOT}978b9feb5e0c792f.svg`}
            alt="中文界面"
            width={18}
            height={18}
            unoptimized
          />
        </button>
        <button onClick={() => setUnit(unit === "公制" ? "英制" : "公制")}>{unit}</button>
        <button
          className="user-button"
          onClick={() => setOpenMenu((current) => !current)}
          aria-expanded={openMenu}
          aria-label="打开产品菜单"
        >
          <UserRound />
          <span>⌄</span>
        </button>
      </div>
      <button className="mobile-user" onClick={() => setOpenMenu(true)} aria-label="打开产品菜单">
        <UserRound />
        <span>⌄</span>
      </button>
      {openMenu ? (
        <AccountMenu
          onClose={() => setOpenMenu(false)}
          setModal={setModal}
          unit={unit}
        />
      ) : null}
    </nav>
  );
}

type AccountMenuProps = {
  onClose: () => void;
  setModal: Dispatch<SetStateAction<ModalKind>>;
  unit: string;
};

function AccountMenu({ onClose, setModal, unit }: AccountMenuProps) {
  const entries: Array<{ icon: IconComponent; label: string; action?: () => void }> = [
    { icon: LogIn, label: "当前产品" },
    { icon: Plus, label: "规划预览" },
    { icon: Settings, label: "产品说明" },
    { icon: CircleDollarSign, label: "显示偏好", action: () => setModal("display") },
    { icon: Languages, label: "语言", action: () => setModal("language") },
    { icon: Thermometer, label: `界面单位（${unit}）` },
    { icon: CircleHelp, label: "关于 VisePanda" },
    { icon: MessageCircle, label: "联系" },
  ];

  return (
    <>
      <button className="menu-scrim" aria-label="关闭菜单" onClick={onClose} />
      <div className="account-menu" role="dialog" aria-label="产品菜单">
        <div className="sheet-handle" />
        {entries.map(({ icon: Icon, label, action }, index) => (
          <button
            key={label}
            className={index === 6 ? "menu-divider" : ""}
            onClick={() => {
              action?.();
              if (action) onClose();
            }}
          >
            <Icon />
            <span>{label}</span>
          </button>
        ))}
        <button>
          <FileText />
          <span>使用条款</span>
        </button>
      </div>
    </>
  );
}

function Hero({ setToast }: { setToast: ToastSetter }) {
  const [prompt, setPrompt] = useState("");
  const prompts = [
    "第一次来中国",
    "规划北京和上海 7 天",
    "检查支付和网络准备",
    "今天下一步做什么",
  ];

  const submit = () => {
    if (!prompt.trim()) return;
    setToast("已收到这条预览输入；当前原型未连接 AI，也不会保存你的输入。");
  };

  return (
    <section className="hero" id="top">
      <div className="hero-inner">
        <div className="hero-media">
          <video
            autoPlay
            muted
            loop
            playsInline
            poster={`${ASSET_ROOT}25e0363beb39642d.png`}
          >
            <source src={`${ASSET_ROOT}6327a8e079c4ad56.mp4`} type="video/mp4" />
          </video>
        </div>
        <div className="hero-copy">
          <h1>用 AI 规划中国之旅，再从容地把它走完。</h1>
          <p className="hero-subtitle">
            VisePanda 将旅行对话与实用的 Trip Canvas 结合，服务于来中国自由行的旅行者。Chatbot
            帮你规划和调整，Canvas 让每天的安排可见，Today
            在旅途中给出一个可信的下一步或恢复路径。
          </p>
          <div className="prompt-box">
            <textarea
              value={prompt}
              onChange={(event) => setPrompt(event.target.value)}
              placeholder="第一次来中国，帮我规划北京 4 天，并检查支付、网络和景点预约"
              aria-label="告诉 VisePanda 你的来华旅行计划"
            />
            <div className="prompt-tools">
              <button aria-label="添加附件">
                <Paperclip />
              </button>
              <span />
              <button aria-label="语音输入">
                <Mic />
              </button>
              <button className="send-button" onClick={submit} disabled={!prompt.trim()} aria-label="发送">
                <Send />
              </button>
            </div>
          </div>
          <div className="suggestions">
            {prompts.map((item) => (
              <button key={item} onClick={() => setPrompt(item)}>
                {item}
              </button>
            ))}
          </div>
          <div className="canvas-hint">
            <b>已经有计划？</b>
            <button onClick={() => setToast("Trip Canvas 产品预览将在后续版本逐步开放。") }>
              <BedDouble />
              查看 Trip Canvas 预览
              <ArrowRight />
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}

function HumanSupport({ setToast }: { setToast: ToastSetter }) {
  return (
    <section className="section human-section">
      <div className="human-card">
        <div>
          <small>产品边界优先</small>
          <h2>规划有画布，执行有回退。</h2>
          <p>
            Chatbot 负责理解和调整；Trip Canvas 记住每天的安排与准备状态；Today
            只展示一个符合资格的下一步。证据不足时，VisePanda
            会明确说明缺什么，并给出安全替代或恢复路径。
          </p>
          <button
            className="primary-button"
            onClick={() => setToast("当前页面是产品预览，不代表实时人工服务或预订支持。")}
          >
            查看工作台预览 <ArrowRight />
          </button>
        </div>
        <div className="experts">
          {["278ca23a2fa86f31.png", "2a404b5a54b86e81.png", "3970e8d3b93646eb.png"].map(
            (image, index) => (
              <Image
                key={image}
                src={`${ASSET_ROOT}${image}`}
                alt={`参考旅行人物素材 ${index + 1}`}
                width={160}
                height={160}
                sizes="160px"
                unoptimized
              />
            ),
          )}
        </div>
      </div>
    </section>
  );
}

function Destinations({ setToast }: { setToast: ToastSetter }) {
  return (
    <section className="section destination-section">
      <div className="content">
        <h2>从一个想法，到可以实际执行的一天。</h2>
        <div className="trip-grid">
          {trips.map((trip) => (
            <article className="trip-card" key={trip.title}>
              <Image
                src={`${ASSET_ROOT}${trip.image}`}
                alt={`${trip.title} 示例素材`}
                width={800}
                height={533}
                sizes="(max-width: 900px) 82vw, 33vw"
                unoptimized
              />
              <h3>{trip.title}</h3>
              <button onClick={() => setToast(trip.toast)}>
                查看示例 <ArrowRight />
              </button>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

function FeatureSection() {
  const [active, setActive] = useState(0);
  const [expanded, setExpanded] = useState<number | null>(null);

  return (
    <section className="section features-section">
      <div className="content">
        <h2>规划、记住、执行、恢复。</h2>
        <p className="section-lede">每一步都可见，每一个事实都有边界。</p>
        <div className="feature-grid">
          {featureItems.map((item, index) => {
            const Icon = item.icon;
            const isExpanded = expanded === index;
            return (
              <article key={item.title} className={`feature-card ${active === index ? "active" : ""}`}>
                <div className="feature-icon">
                  <Icon />
                </div>
                <h3>{item.title}</h3>
                <p className={isExpanded ? "expanded" : ""}>{item.body}</p>
                <button onClick={() => setExpanded(isExpanded ? null : index)}>
                  {isExpanded ? "收起详情" : "查看详情"}
                </button>
              </article>
            );
          })}
        </div>
        <div className="carousel-dots">
          {featureItems.map((item, index) => (
            <button
              key={item.title}
              className={active === index ? "active" : ""}
              onClick={() => setActive(index)}
              aria-label={`切换到产品能力 ${index + 1}`}
            />
          ))}
        </div>
      </div>
    </section>
  );
}

function Reviews({ setToast }: { setToast: ToastSetter }) {
  const [playing, setPlaying] = useState(false);

  return (
    <section className="section reviews-section">
      <div className="content">
        <h2>Chatbot 与 Trip Canvas，在同一个工作台协作。</h2>
        <p className="reviews-note">
          这是静态产品预览，不是实时旅行数据。Chatbot 提出候选与调整建议；Canvas
          让你逐日检查；只有确认并通过确定性校验后，变化才可能进入 Trip。
        </p>
        <div className={`review-media ${playing ? "playing" : ""}`}>
          <Image
            src="/assets/review-video-lavender-background.png"
            alt="静态产品预览背景"
            width={1024}
            height={1024}
            sizes="(max-width: 520px) 100vw, 510px"
            unoptimized
          />
          <button
            onClick={() => setPlaying((current) => !current)}
            aria-label={playing ? "暂停产品预览" : "播放产品预览"}
          >
            {playing ? <Pause /> : <Play />}
          </button>
        </div>
        <div className="expert-call">
          当前产品以真实可用状态为准。{" "}
          <button onClick={() => setToast("当前产品将以真实可用状态为准。") }>
            查看当前产品 <ArrowRight />
          </button>
        </div>
      </div>
    </section>
  );
}

function JoyMarquee() {
  return (
    <section className="joy-section">
      <div className="content">
        <h2>少点猜测，多一步可执行。</h2>
      </div>
      <div className="joy-row">
        {lifestyle.slice(0, 4).map(({ image, text }) => (
          <article key={`${image}-${text}`}>
            <Image src={`${ASSET_ROOT}${image}`} alt="来华旅行执行场景参考素材" width={500} height={400} unoptimized />
            <span>{text}</span>
          </article>
        ))}
      </div>
      <p className="joy-center">
        少点 <i>猜测</i>， 多一步 <i>可执行。</i>
      </p>
      <div className="joy-row reverse">
        {lifestyle.slice(4).map(({ image, text }) => (
          <article key={`${image}-${text}`}>
            <Image src={`${ASSET_ROOT}${image}`} alt="来华旅行恢复场景参考素材" width={500} height={400} unoptimized />
            <span>{text}</span>
          </article>
        ))}
      </div>
      <p className="joy-note">
        六个时刻是 VisePanda 的产品边界；每一项仍按可信事实、失败恢复和真实使用证据逐步开放。
      </p>
    </section>
  );
}

function PlannerSection({ setToast }: { setToast: ToastSetter }) {
  const [expanded, setExpanded] = useState(false);
  const baseCopy =
    "VisePanda 不只是生成一段行程文字。你可以通过 Chatbot 形成或调整计划，在 Trip Canvas 中逐日查看地点、路线和准备状态，再通过 Today 处理旅途中的下一步与变化。模型只能提出候选；事实资格、用户确认、TripPatch、审计和持久化边界仍由确定性系统控制。";
  const expandedCopy =
    " 当前仍处于 Early Access 与产品预览阶段。Planner、Canvas 与 Today 会按事实和接口门槛逐步交付；页面不代表实时票务、自动预订、付款或完整城市覆盖。";

  return (
    <section className="section planner-section">
      <div className="planner-card">
        <div>
          <h2>VisePanda：AI 规划与执行工作台</h2>
          <p className={expanded ? "expanded" : ""}>
            {baseCopy}
            {expanded ? expandedCopy : ""}
          </p>
          <button className="text-button" onClick={() => setExpanded((current) => !current)}>
            {expanded ? "收起详情" : "查看详情"}
          </button>
          <button
            className="primary-button"
            onClick={() => setToast("当前产品入口将在后续真实接入时开放。")}
          >
            查看当前产品 <ArrowRight />
          </button>
        </div>
        <Image
          src={`${ASSET_ROOT}a12b54fa7434259a.jpg`}
          alt="VisePanda 产品预览参考素材"
          width={708}
          height={708}
          sizes="(max-width: 900px) 250px, 280px"
          unoptimized
        />
      </div>
    </section>
  );
}

function TrustSection() {
  return (
    <section className="section trust-section">
      <div className="content">
        <h2>信任不是一面 Logo 墙。</h2>
        <p className="trust-copy">
          对来华旅行真正重要的是：事实从哪里来、什么时候复核、谁确认了修改，以及失败后怎样恢复。
        </p>
        <div className="logo-row partners" aria-label="未迁移的参考标志资产">
          {partnerAssets.map((file, index) => (
            <Image
              key={file}
              src={`${ASSET_ROOT}${file}`}
              alt={`未迁移参考标志素材 ${index + 1}`}
              width={200}
              height={60}
              unoptimized
            />
          ))}
        </div>
        <h2>覆盖正在按城市和场景扩展。</h2>
        <p>
          当前页面不宣称完整中国覆盖、实时库存或已激活合作伙伴。Early Access
          的任务是先验证哪些信息和执行时刻最值得优先解决。
        </p>
        <div className="logo-row press" aria-label="未迁移的参考媒体资产">
          {pressAssets.map((file, index) => (
            <Image
              key={file}
              src={`${ASSET_ROOT}${file}`}
              alt={`未迁移参考媒体素材 ${index + 1}`}
              width={160}
              height={50}
              unoptimized
            />
          ))}
        </div>
      </div>
    </section>
  );
}

function Investors() {
  return (
    <section className="section investors-section">
      <div className="content">
        <h2>四件我们不会提前承诺的事。</h2>
        <div className="investor-grid">
          {boundaries.map((card) => (
            <article key={card.title}>
              <Image
                src={`${ASSET_ROOT}${card.image}`}
                alt="未迁移的人物参考素材"
                width={300}
                height={300}
                sizes="190px"
                unoptimized
              />
              <h3>{card.title}</h3>
              <p>{card.body}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

function Team() {
  const [active, setActive] = useState<number | null>(null);
  const previous = () =>
    setActive((current) => (current === null ? deliveryCards.length - 1 : (current + deliveryCards.length - 1) % deliveryCards.length));
  const next = () => setActive((current) => (current === null ? 0 : (current + 1) % deliveryCards.length));
  const toggle = (index: number) => setActive((current) => (current === index ? null : index));
  const onCardKeyDown = (event: KeyboardEvent<HTMLElement>, index: number) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      toggle(index);
    }
  };

  return (
    <section className="section team-section">
      <div className="content">
        <div className="section-heading-row">
          <h2>VisePanda，按证据逐步交付。</h2>
          <div>
            <button aria-label="上一项交付能力" onClick={previous}>
              <ArrowLeft />
            </button>
            <button aria-label="下一项交付能力" onClick={next}>
              <ArrowRight />
            </button>
          </div>
        </div>
        <div className="team-grid">
          {deliveryCards.map((card, index) => (
            <article
              key={card.title}
              className={active === index ? "active" : ""}
              role="button"
              tabIndex={0}
              aria-expanded={active === index}
              onClick={() => toggle(index)}
              onKeyDown={(event) => onCardKeyDown(event, index)}
            >
              <Image
                src={`${ASSET_ROOT}${card.image}`}
                alt={`${card.title} 参考素材`}
                width={300}
                height={340}
                sizes="190px"
                unoptimized
              />
              <h3>{card.title}</h3>
              <p>{card.status}</p>
              {active === index ? <small>{card.body}</small> : null}
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

function FAQ() {
  const [open, setOpen] = useState<number | null>(null);

  return (
    <section className="section faq-section">
      <div className="faq-wrap">
        <h2>常见问题</h2>
        <p>关于 VisePanda 产品预览与 Early Access 的诚实说明。</p>
        <div className="faq-list">
          {faqs.map(([question, answer], index) => (
            <article key={question} className={open === index ? "open" : ""}>
              <button
                onClick={() => setOpen((current) => (current === index ? null : index))}
                aria-expanded={open === index}
              >
                <span>{question}</span>
                <span>⌄</span>
              </button>
              {open === index ? <div>{answer}</div> : null}
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

function Footer({ setModal, setToast }: { setModal: Dispatch<SetStateAction<ModalKind>>; setToast: ToastSetter }) {
  const columns: ReadonlyArray<readonly [string, readonly string[]]> = [
    ["产品", ["产品预览", "Planner", "Trip Canvas", "Today"]],
    ["了解", ["产品定位", "项目开发", "商业计划", "GitHub"]],
    ["信任", ["隐私", "条款", "Affiliate Disclosure", "Human Help Limits", "Emergency Disclaimer"]],
    ["覆盖", ["北京", "上海", "广州", "成都", "更多城市逐步扩展"]],
    ["规划", ["第一次来中国", "多城市行程"]],
  ];

  return (
    <>
      <section className="final-cta">
        <h2>准备好把中国之旅看得更清楚了吗？</h2>
        <p>查看 VisePanda 如何把对话、Trip Canvas 与执行恢复组织在一起。</p>
        <button
          className="primary-button"
          onClick={() => setToast("当前页面是前端原型；真实产品入口以 go2china.space 为准。")}
        >
          查看当前产品 <ArrowRight />
        </button>
      </section>
      <footer>
        {columns.map(([heading, items]) => (
          <div key={heading}>
            <h2>{heading}</h2>
            {items.map((item) => (
              <button
                key={item}
                onClick={() =>
                  item === "隐私"
                    ? setModal("cookies")
                    : setToast(`${item} 当前为前端产品预览。`)
                }
              >
                {item}
              </button>
            ))}
          </div>
        ))}
        <div className="footer-bottom">
          <Image
            src={`${ASSET_ROOT}7f7773d103c78b77.svg`}
            alt="VisePanda"
            width={59}
            height={24}
            unoptimized
          />
          <p>© 2026 VisePanda · 产品预览</p>
          <p>Independent travel in China, thoughtfully prepared.</p>
        </div>
      </footer>
    </>
  );
}

export function VisePandaLanding() {
  const [openMenu, setOpenMenu] = useState(false);
  const [modal, setModal] = useState<ModalKind>(null);
  const [unit, setUnit] = useState("公制");
  const [toast, setToast] = useState("");
  const [showTop, setShowTop] = useState(false);

  useEffect(() => {
    const onScroll = () => setShowTop(window.scrollY > 700);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    if (!toast) return;
    const timeoutId = window.setTimeout(() => setToast(""), 2800);
    return () => window.clearTimeout(timeoutId);
  }, [toast]);

  return (
    <div className="app-shell min-h-screen bg-vp-paper text-vp-ink">
      <BrandClip />
      <Header
        openMenu={openMenu}
        setOpenMenu={setOpenMenu}
        setModal={setModal}
        unit={unit}
        setUnit={setUnit}
      />
      <main>
        <Hero setToast={setToast} />
        <HumanSupport setToast={setToast} />
        <Destinations setToast={setToast} />
        <FeatureSection />
        <Reviews setToast={setToast} />
        <JoyMarquee />
        <PlannerSection setToast={setToast} />
        <TrustSection />
        <Investors />
        <Team />
        <FAQ />
        <Footer setModal={setModal} setToast={setToast} />
      </main>
      {showTop ? (
        <button
          className="back-to-top"
          aria-label="返回顶部"
          onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
        >
          <ArrowUp />
        </button>
      ) : null}
      {toast ? (
        <div className="toast" role="status">
          <Sparkles />
          {toast}
        </div>
      ) : null}
      {modal === "language" ? (
        <Overlay title="界面语言预览" onClose={() => setModal(null)}>
          <div className="choice-grid">
            {languages.map((language) => (
              <button
                key={language}
                className={language === "中文" ? "selected" : ""}
                onClick={() => {
                  setModal(null);
                  setToast(`界面语言预览：${language}`);
                }}
              >
                {language}
              </button>
            ))}
          </div>
        </Overlay>
      ) : null}
      {modal === "display" ? (
        <Overlay title="显示偏好预览" onClose={() => setModal(null)} wide>
          <div className="currency-grid">
            {displayOptions.map(([name, code]) => (
              <button
                key={code}
                onClick={() => {
                  setModal(null);
                  setToast(`显示偏好已更新：${code}`);
                }}
              >
                <b>{name}</b>
                <span>{code}</span>
              </button>
            ))}
          </div>
        </Overlay>
      ) : null}
      {modal === "cookies" ? (
        <Overlay title="隐私说明" onClose={() => setModal(null)}>
          <p className="modal-copy">
            当前原型不启用分析或营销 Cookie。真实产品的 Cookie
            与隐私选项将以正式隐私政策和实际部署配置为准。
          </p>
          <div className="cookie-options">
            {["必要功能（未启用）", "分析（未启用）", "营销（未启用）", "旅行画像（未启用）"].map(
              (item) => (
                <label key={item}>
                  <span>
                    <b>{item}</b>
                    <small>当前仅用于展示正式产品可能提供的隐私控制位置。</small>
                  </span>
                  <input type="checkbox" disabled />
                </label>
              ),
            )}
          </div>
          <div className="modal-actions">
            <button onClick={() => setModal(null)}>关闭</button>
          </div>
        </Overlay>
      ) : null}
    </div>
  );
}
