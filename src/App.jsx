import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  BedDouble,
  CircleHelp,
  CircleDollarSign,
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
} from "lucide-react";

const A = "/assets/source/";

const trips = [
  { title: "家庭 - 欧洲之旅", image: "8aed3709273934a0.jpg" },
  { title: "情侣 - 约旦蜜月", image: "687064758b7a3b1a.jpg" },
  { title: "公路旅行 1号公路 - 美国", image: "853cd27a4a6e390d.jpg" },
];

const featureItems = [
  { title: "量身定制", icon: HeartHandshake, body: "让莱拉为你创建一个根据你的喜好和旅行风格量身定制的行程。通过量身定制的计划，发现终极旅行体验，满足你独特的兴趣。" },
  { title: "更便宜", icon: CircleDollarSign, body: "帮你找到最好的优惠和折扣，让你的旅行计划省钱。有了 Layla 的专业指导，你可以探索各种经济实惠的选择。" },
  { title: "隐藏的宝藏", icon: Diamond, body: "莱拉会为你发现隐藏的宝藏和不为人知的目的地，确保你能体验到目的地的最佳面貌。" },
  { title: "专家支持", icon: UserRound, body: "真人旅行专家会为您把关棘手环节——预订、行程衔接以及 AI 可能遗漏的细节。" },
];

const lifestyle = [
  ["d2f34179e7548e01.jpg", "去巴黎过个周末"], ["5c3742504a370cff.jpg", "接下来去哪儿？"],
  ["66eb7d06cfc2d822.jpg", "帮我找个海滩度假"], ["b30ba6f68400baab.jpg", "去东京来场美食之旅"],
  ["a12b54fa7434259a.jpg", "给我个新惊喜"], ["a01f3611afdccfa6.jpg", "巴厘岛什么时候去最好？"],
  ["ceffa8a9c7d2428b.jpg", "在罗马浪漫一周"], ["b941bdacaf6a6262.jpg", "去巴黎过个周末"],
];

const partners = [
  ["16a277efaa752b15.svg", "Viator"], ["6613046bfbff97d7.svg", "Skyscanner"],
  ["fa98deb770c7938f.svg", "GetYourGuide"], ["7d13d679ce024167.svg", "Booking.com"],
];

const press = [
  ["af6ba65b0411c13d.svg", "Phocuswire"], ["42bfdd9db5788463.png", "TechCrunch"],
  ["563830f6964fb3ed.svg", "USA Today"], ["b124d61704339832.svg", "The New York Times"],
  ["cd4de43fe389c172.svg", "Business Insider"], ["78c151342977f60f.png", "Skift"],
  ["0f5d41baffbb390b.svg", "Travolution"],
];

const investors = [
  ["e99500749db59a7d.jpg", "布伦特·霍伯曼", "联合创始人，lastminute.com"],
  ["45949fca2cb9454c.jpg", "巴里·史密斯", "联合创始人 天巡"],
  ["776d7652be1c3a0a.jpg", "安迪·菲利普斯", "创始人 Active Hotels"],
  ["2bfd0461aac96558.jpg", "巴黎希尔顿", "希尔顿酒店 · 商务女性"],
];

const team = [
  ["4a6d4eb502db2b51.webp", "Ana Chuprey", "前端", "打造美丽且直观的用户界面，专注于响应式、可访问的网络体验。"],
  ["7a4447f7d275511a.webp", "Ivan", "前端", "让全球旅行者都能快速、流畅地完成每一步规划。"],
  ["8e8e963cd7ed9618.webp", "萨德·赛义德", "战略", "连接旅行灵感、技术和真人服务。"],
  ["a6cd67d3f1d92abe.webp", "Sari", "客户成功", "在旅程复杂时，为旅行者提供真正可依赖的支持。"],
  ["ad58ec98fa2d74a2.webp", "Gil Shaked", "运营", "让每个交付环节清晰、可靠。"],
  ["be43bdaf4c330efa.webp", "萨尔达尔·巴利", "产品", "把旅行计划变成轻松自然的体验。"],
];

const faqs = [
  ["什么是 Layla.ai？", "我是 Layla，你的 AI 旅行代理兼行程规划师。我会为你创建完整而个性化的行程，涵盖航班、酒店、活动、餐饮以及量身定制的推荐。你可以用 AI 规划、与真人旅行专家合作，或者两者结合。"],
  ["Layla.ai 是怎么工作的？", "只需告诉我你的出行日期、目的地、预算和旅行风格，我就会立即根据实时价格和可用情况，为你生成个性化的逐日计划。"],
  ["真人旅行专家可以为我规划并预订整个行程吗？", "可以。我们的真人旅行专家可以从头到尾打理你的行程，完成规划、推荐、预订与后续调整。"],
  ["Layla.ai 比传统的旅行代理人更好吗？", "Layla 将 AI 的速度与便利，和传统旅行社的个性化服务结合在一起。"],
  ["Layla.ai 能帮我省旅行的钱吗？", "是的。我会比较航班、酒店、火车和活动的实时价格，帮助你找到最划算的选择。"],
  ["Layla.ai 能处理多城市或公路旅行吗？", "当然可以。我擅长多城市行程和自驾游，并能优化目的地之间的路线。"],
  ["Layla.ai 能帮忙规划家庭旅行吗？", "当然可以。家庭旅行规划会在观光和休息之间取得平衡，并加入适合孩子和大人的活动。"],
  ["Layla.ai 对于独自旅行者好吗？", "好。如果你一个人旅行，我会为你设计安全、灵活、实惠的行程。"],
  ["Layla.ai 会为情侣规划旅行吗？", "当然。我会设计浪漫度假，包括精品酒店、风景餐饮和特别体验。"],
  ["我应该在和 Layla.ai 计划的旅行上花多少天呢？", "3–5 天适合城市短途旅行，7–10 天适合多城市或自驾游。"],
  ["Layla.ai 包含哪些类型的体验？", "文化地标、隐藏的宝藏、美食之旅、导览活动、季节性活动和当地社区，我都会涵盖。"],
  ["Layla.ai 是免费使用的吗？", "我提供免费的旅行规划工具，也有可选的高级升级。"],
];

function BrandClip() {
  return <svg aria-hidden="true" className="clip-defs" focusable="false"><defs><clipPath id="layla-clover" clipPathUnits="objectBoundingBox"><path d="M393 118.35C393 53.0155 339.983 0 274.539 0C244.647 0 217.299 11.1208 196.476 29.3838C175.653 11.1208 148.353 0 118.461 0C53.0173 0 0 52.9676 0 118.35C0 149.556 12.0908 177.885 31.8104 199.024C12.0908 220.163 0 248.492 0 279.698C0 345.032 53.0173 398.048 118.461 398.048C148.353 398.048 175.701 386.927 196.524 368.664C217.347 386.927 244.695 398.048 274.587 398.048C339.983 398.048 393.048 345.08 393.048 279.698C393.048 248.492 380.957 220.163 361.238 199.024C380.957 177.885 393.048 149.556 393.048 118.35H393Z" transform="scale(0.0025442185178400603, 0.002512259827960447)" /></clipPath></defs></svg>;
}

function Overlay({ title, onClose, children, wide = false }) {
  return <div className="overlay" role="presentation" onMouseDown={onClose}><section className={`modal ${wide ? "modal-wide" : ""}`} role="dialog" aria-label={title} onMouseDown={(event) => event.stopPropagation()}><header><h2>{title}</h2><button className="icon-button" onClick={onClose} aria-label="关闭"><X /></button></header>{children}</section></div>;
}

function Header({ openMenu, setOpenMenu, setModal, temperature, setTemperature }) {
  return <nav className="site-nav"><a href="#top" className="logo-link" aria-label="Layla 首页"><img src={`${A}7f7773d103c78b77.svg`} alt="Layla" /></a><div className="desktop-nav-actions"><button onClick={() => setModal("currency")}>$</button><button onClick={() => setModal("language")} aria-label="选择语言"><img src={`${A}978b9feb5e0c792f.svg`} alt="中文" /></button><button onClick={() => setTemperature(temperature === "°C" ? "°F" : "°C")}>{temperature}</button><button className="user-button" onClick={() => setOpenMenu(!openMenu)} aria-expanded={openMenu}><UserRound /><span>⌄</span></button></div><button className="mobile-user" onClick={() => setOpenMenu(true)} aria-label="打开账户菜单"><UserRound /><span>⌄</span></button>{openMenu && <AccountMenu onClose={() => setOpenMenu(false)} setModal={setModal} temperature={temperature} />}</nav>;
}

function AccountMenu({ onClose, setModal, temperature }) {
  const entries = [[LogIn, "登录"], [Plus, "新的旅行"], [Settings, "设置"], [CircleDollarSign, "货币 (USD)", () => setModal("currency")], [Languages, "语言", () => setModal("language")], [Thermometer, `温度 (${temperature})`], [CircleHelp, "关于"], [MessageCircle, "联系"]];
  return <><button className="menu-scrim" aria-label="关闭菜单" onClick={onClose} /><div className="account-menu" role="dialog" aria-label="账户菜单"><div className="sheet-handle" />{entries.map(([Icon, label, action], index) => <button key={label} className={index === 6 ? "menu-divider" : ""} onClick={() => { action?.(); if (action) onClose(); }}><Icon /><span>{label}</span></button>)}<button><FileText /><span>服务条款</span></button></div></>;
}

function Hero({ setToast }) {
  const [prompt, setPrompt] = useState("");
  const prompts = ["创建一个新旅行", "启发我去哪里", "规划自驾游", "规划一次说走就走的旅行"];
  const submit = () => { if (prompt.trim()) setToast(`正在为你规划：${prompt}`); };
  return <section className="hero" id="top"><div className="hero-inner"><div className="hero-media"><video autoPlay muted loop playsInline poster={`${A}25e0363beb39642d.png`}><source src={`${A}6327a8e079c4ad56.mp4`} type="video/mp4" /></video></div><div className="hero-copy"><h1>你的旅行。几分钟就能规划好。</h1><p className="hero-subtitle">实时价格，统统在一个地方，还有需要时的人类专家。</p><div className="prompt-box"><textarea value={prompt} onChange={(event) => setPrompt(event.target.value)} placeholder="为情侣计划一个浪漫的5天罗马之旅" aria-label="告诉 Layla 你的旅行想法" /><div className="prompt-tools"><button aria-label="添加附件"><Paperclip /></button><span /><button aria-label="语音输入"><Mic /></button><button className="send-button" onClick={submit} disabled={!prompt.trim()} aria-label="发送"><Send /></button></div></div><div className="suggestions">{prompts.map((item) => <button key={item} onClick={() => setPrompt(item)}>{item}</button>)}</div><div className="bellboy"><b>小贴士：只想订酒店？</b><button onClick={() => setToast("Bellboy 酒店助手已准备好")}><BedDouble />试试 Bellboy <ArrowRight /></button></div></div></div></section>;
}

function HumanSupport({ setToast }) {
  return <section className="section human-section"><div className="human-card"><div><small>2,090,000+ 已规划的旅行</small><h2>您的旅程，由真人保驾护航。</h2><p>从棘手的预订到临时变动，我们的旅行专家随时准备为您出手相助。</p><button className="primary-button" onClick={() => setToast("旅行专家已准备好与你一起规划")}>开始规划 <ArrowRight /></button></div><div className="experts"><img src={`${A}278ca23a2fa86f31.png`} alt="Layla 旅行专家" /><img src={`${A}2a404b5a54b86e81.png`} alt="Layla 旅行专家" /><img src={`${A}3970e8d3b93646eb.png`} alt="Layla 旅行专家" /></div></div></section>;
}

function Destinations({ setToast }) {
  return <section className="section destination-section"><div className="content"><h2>接下来去哪儿</h2><div className="trip-grid">{trips.map((trip) => <article className="trip-card" key={trip.title}><img src={`${A}${trip.image}`} alt={`${trip.title} thumbnail`} /><h3>{trip.title}</h3><button onClick={() => setToast(`开始规划：${trip.title}`)}>开始规划 <ArrowRight /></button></article>)}</div></div></section>;
}

function FeatureSection() {
  const [active, setActive] = useState(0);
  const [expanded, setExpanded] = useState(null);
  return <section className="section features-section"><div className="content"><h2>我会在每一步都支持你</h2><p className="section-lede">策划、保存并随时获取关于您旅行的通知。</p><div className="feature-grid">{featureItems.map((item, index) => { const Icon = item.icon; return <article key={item.title} className={`feature-card ${active === index ? "active" : ""}`}><div className="feature-icon"><Icon /></div><h3>{item.title}</h3><p className={expanded === index ? "expanded" : ""}>{item.body}</p>{index < 3 && <button onClick={() => setExpanded(expanded === index ? null : index)}>{expanded === index ? "阅读更少" : "... 查看更多..."}</button>}</article>; })}</div><div className="carousel-dots">{featureItems.map((item, index) => <button key={item.title} className={active === index ? "active" : ""} onClick={() => setActive(index)} aria-label={`Go to slide ${index + 1}`} />)}</div></div></section>;
}

function Reviews({ setToast }) {
  const [playing, setPlaying] = useState(false);
  return <section className="section reviews-section"><div className="content"><h2>旅客们对我说的事</h2><div className={`review-media ${playing ? "playing" : ""}`}><img src="/assets/review-video-lavender-background.png" alt="淡紫色旅客评价视频背景" /><button onClick={() => setPlaying(!playing)} aria-label={playing ? "暂停视频" : "播放视频"}>{playing ? <Pause /> : <Play />}</button></div><div className="expert-call">想与我们的专家聊聊？ <button onClick={() => setToast("预约通话入口已打开")}>预约通话 <ArrowRight /></button></div></div></section>;
}

function JoyMarquee() {
  return <section className="joy-section"><div className="content"><h2>少点 焦虑， 多点 快乐。</h2></div><div className="joy-row">{lifestyle.slice(0, 4).map(([image, text]) => <article key={text}><img src={`${A}${image}`} alt={text} /><span>{text}</span></article>)}</div><p className="joy-center">少点 <i>焦虑</i>， 多点 <i>快乐。</i></p><div className="joy-row reverse">{lifestyle.slice(4).map(([image, text]) => <article key={text}><img src={`${A}${image}`} alt={text} /><span>{text}</span></article>)}</div></section>;
}

function PlannerSection({ setToast }) {
  const [expanded, setExpanded] = useState(false);
  return <section className="section planner-section"><div className="planner-card"><div><h2>一站式 AI 旅行规划师</h2><p className={expanded ? "expanded" : ""}>在找完美的旅行规划师，帮你安排下一个家庭度假、浪漫之旅、周年庆或生日旅行吗？你来对地方了。随便问我关于规划假期的任何问题——从梦幻目的地和舒适住宿到航班、公路旅行等等。无论你是带着孩子、和伴侣还是独自旅行，我都会帮你打造完美的行程。再也不用在标签和应用之间来回切换。</p><button className="text-button" onClick={() => setExpanded(!expanded)}>{expanded ? "收起" : "查看更多..."}</button><button className="primary-button" onClick={() => setToast("新的行程已准备开始")}>创建一个新行程 <ArrowRight /></button></div><img src={`${A}a12b54fa7434259a.jpg`} alt="水边一杯色彩缤纷的夏日饮品" /></div></section>;
}

function TrustSection() {
  return <section className="section trust-section"><div className="content"><h2>由可信赖的旅行代理商提供支持</h2><div className="logo-row partners">{partners.map(([file, label]) => <img key={label} src={`${A}${file}`} alt={label} />)}</div><h2>在全球引起关注</h2><p>在全球顶尖媒体上亮相，帮助旅行者通过更聪明的行程规划节省时间、金钱和压力。</p><div className="logo-row press">{press.map(([file, label]) => <img key={label} src={`${A}${file}`} alt={label} />)}</div></div></section>;
}

function Investors() {
  return <section className="section investors-section"><div className="content"><h2>我的投资者</h2><div className="investor-grid">{investors.map(([image, name, title]) => <article key={name}><img src={`${A}${image}`} alt={name} /><h3>{name}</h3><p>{title}</p></article>)}</div></div></section>;
}

function Team() {
  const [active, setActive] = useState(null);
  const previous = () => setActive(active === null ? team.length - 1 : (active + team.length - 1) % team.length);
  const next = () => setActive(active === null ? 0 : (active + 1) % team.length);
  return <section className="section team-section"><div className="content"><div className="section-heading-row"><h2>使命背后的思想</h2><div><button aria-label="Previous slide" onClick={previous}><ArrowLeft /></button><button aria-label="Next slide" onClick={next}><ArrowRight /></button></div></div><div className="team-grid">{team.map(([image, name, role, bio], index) => <article key={name} className={active === index ? "active" : ""} onClick={() => setActive(active === index ? null : index)}><img src={`${A}${image}`} alt={name} /><h3>{name}</h3><p>{role}</p>{active === index && <small>{bio}</small>}</article>)}</div></div></section>;
}

function FAQ() {
  const [open, setOpen] = useState(null);
  return <section className="section faq-section"><div className="faq-wrap"><h2>常见问题</h2><p>找到关于 Layla 的 AI 旅行规划服务的常见问题答案</p><div className="faq-list">{faqs.map(([question, answer], index) => <article key={question} className={open === index ? "open" : ""}><button onClick={() => setOpen(open === index ? null : index)} aria-expanded={open === index}><span>{question}</span><span>⌄</span></button>{open === index && <div>{answer}</div>}</article>)}</div></div></section>;
}

function Footer({ setModal, setToast }) {
  const columns = [["公司", ["首页", "关于", "博客", "联系", "常见问题解答", "媒体"]], ["产品", ["Roam Around"]], ["法律", ["隐私", "条款", "印记", "Cookie 设置"]], ["顶级国家", ["西班牙", "意大利", "葡萄牙", "印度尼西亚", "德国", "所有国家"]], ["计划", ["情侣旅行代理人", "家庭旅行代理人"]]];
  return <><section className="final-cta"><h2>准备好试一试了吗？</h2><p>看看 Layla 如何在一分钟内将任何想法变成旅行。</p><button className="primary-button" onClick={() => setToast("Layla 已准备好听你的旅行想法")}>现在试试 Layla <ArrowRight /></button></section><footer>{columns.map(([heading, items]) => <div key={heading}><h2>{heading}</h2>{items.map((item) => <button key={item} onClick={() => item === "Cookie 设置" ? setModal("cookies") : setToast(`${item} 页面为原型中的视觉链接`)}>{item}</button>)}</div>)}<div className="footer-bottom"><img src={`${A}7f7773d103c78b77.svg`} alt="Layla" /><p>用 🩵 在柏林制作</p><p>© 2026 版权所有 © Layla AI GmbH</p><p>TikTok · Instagram · LinkedIn · YouTube · Pinterest · Reddit</p></div></footer></>;
}

export function App() {
  const [openMenu, setOpenMenu] = useState(false);
  const [modal, setModal] = useState(null);
  const [temperature, setTemperature] = useState("°C");
  const [toast, setToast] = useState("");
  const [showTop, setShowTop] = useState(false);
  const languages = useMemo(() => ["英语", "西班牙语", "法语", "意大利语", "中文", "德语", "葡萄牙语", "俄语", "阿拉伯语", "波兰语"], []);
  useEffect(() => { const onScroll = () => setShowTop(window.scrollY > 700); window.addEventListener("scroll", onScroll, { passive: true }); return () => window.removeEventListener("scroll", onScroll); }, []);
  useEffect(() => { if (!toast) return undefined; const id = window.setTimeout(() => setToast(""), 2800); return () => window.clearTimeout(id); }, [toast]);
  return <div className="app-shell"><BrandClip /><Header openMenu={openMenu} setOpenMenu={setOpenMenu} setModal={setModal} temperature={temperature} setTemperature={setTemperature} /><main><Hero setToast={setToast} /><HumanSupport setToast={setToast} /><Destinations setToast={setToast} /><FeatureSection /><Reviews setToast={setToast} /><JoyMarquee /><PlannerSection setToast={setToast} /><TrustSection /><Investors /><Team /><FAQ /><Footer setModal={setModal} setToast={setToast} /></main>{showTop && <button className="back-to-top" aria-label="返回顶部" onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}><ArrowUp /></button>}{toast && <div className="toast" role="status"><Sparkles />{toast}</div>}{modal === "language" && <Overlay title="选择语言" onClose={() => setModal(null)}><div className="choice-grid">{languages.map((language) => <button key={language} className={language === "中文" ? "selected" : ""} onClick={() => { setModal(null); setToast(`语言已选择：${language}`); }}>{language}</button>)}</div></Overlay>}{modal === "currency" && <Overlay title="选择货币" onClose={() => setModal(null)} wide><div className="currency-grid">{[["美元", "$ - USD"], ["欧元", "€ - EUR"], ["人民币", "¥ - CNY"], ["英镑", "£ - GBP"], ["日元", "¥ - JPY"], ["新加坡元", "S$ - SGD"], ["泰铢", "฿ - THB"], ["澳大利亚元", "A$ - AUD"]].map(([name, code]) => <button key={code} onClick={() => { setModal(null); setToast(`货币已选择：${code}`); }}><b>{name}</b><span>{code}</span></button>)}</div></Overlay>}{modal === "cookies" && <Overlay title="Cookie 与隐私" onClose={() => setModal(null)}><p className="modal-copy">Cookie 可确保 Layla 正常运行，并在您同意的情况下帮助我们改进应用，吸引更多像您一样的旅行者。您可以随时更改您的选择。</p><div className="cookie-options">{["严格必要", "功能性", "分析", "营销", "旅行画像"].map((item, index) => <label key={item}><span><b>{item}</b><small>{index === 0 ? "登录、安全和核心功能。始终启用。" : "帮助我们提供更好的个性化体验。"}</small></span><input type="checkbox" defaultChecked={index === 0} disabled={index === 0} /></label>)}</div><div className="modal-actions"><button onClick={() => setModal(null)}>全部拒绝</button><button className="primary-button" onClick={() => setModal(null)}>保存偏好</button><button onClick={() => setModal(null)}>全部接受</button></div></Overlay>}</div>;
}
