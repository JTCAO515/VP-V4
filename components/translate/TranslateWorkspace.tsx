"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { VisePandaMark } from "@/components/brand/VisePandaMark";
import { getLocaleAttributes, localeOptions, type Locale } from "@/lib/i18n";
import styles from "./TranslateWorkspace.module.css";

type Copy = Readonly<{
  eyebrow: string;
  title: string;
  lede: string;
  home: string;
  language: string;
  voice: string;
  unavailable: string;
  unavailableBody: string;
  manual: string;
  manualHint: string;
  copy: string;
  clear: string;
  copied: string;
  copyUnavailable: string;
  output: string;
  noOutput: string;
  tts: string;
  ttsBody: string;
  stages: readonly [string, string, string];
  privacy: string;
}>;

const copy: Record<Locale, Copy> = {
  zh: { eyebrow: "语言工具 · 手动优先", title: "把想说的话放在眼前", lede: "语音会话尚未连接。你仍可整理和复制自己的文字；不会采集麦克风、保存内容、生成译文或播放语音。", home: "VisePanda 首页", language: "界面语言", voice: "语音会话", unavailable: "语音会话暂不可用", unavailableBody: "缺少服务器授权、短时凭证和已批准的地区适配器。不会请求麦克风，也不会把凭证发送到浏览器。", manual: "手动文字", manualHint: "仅保留在当前浏览器页面中，不会翻译或提交。", copy: "复制文字", clear: "清除", copied: "文字已复制到剪贴板。", copyUnavailable: "此浏览器无法复制文字。", output: "屏幕译文与语音", noOutput: "暂无译文或语音", tts: "语音播放", ttsBody: "没有已批准的译文时，不会播放 TTS。未来的语音只能播放屏幕上完全相同的文字。", stages: ["开始", "确认", "完成"], privacy: "按下语音按钮不会开启录音。" },
  en: { eyebrow: "Language tools · manual first", title: "Keep the words in sight", lede: "A voice session is not connected. You can still prepare and copy your own text; nothing records your microphone, saves content, creates a translation, or plays audio.", home: "VisePanda home", language: "Interface language", voice: "Voice session", unavailable: "Voice session is unavailable", unavailableBody: "Server authorization, short-lived issuance, and an approved regional adapter are not available. Your microphone is not requested and no credential is sent to the browser.", manual: "Manual text", manualHint: "It stays only in this browser page. It is not translated or submitted.", copy: "Copy text", clear: "Clear", copied: "Text copied to your clipboard.", copyUnavailable: "This browser cannot copy the text.", output: "Screen translation & voice", noOutput: "No translated text or audio is available", tts: "Voice playback", ttsBody: "Without an approved translation, no TTS is played. Any future audio may only match the text shown on screen exactly.", stages: ["Open", "Confirm", "Finish"], privacy: "Using the voice control never starts recording." },
  es: { eyebrow: "Herramientas de idioma · primero manual", title: "Mantén las palabras a la vista", lede: "La sesión de voz no está conectada. Aún puedes preparar y copiar tu propio texto; no se graba el micrófono, no se guarda contenido ni se crea traducción o audio.", home: "Inicio de VisePanda", language: "Idioma de la interfaz", voice: "Sesión de voz", unavailable: "La sesión de voz no está disponible", unavailableBody: "No están disponibles la autorización del servidor, la emisión de corta duración ni un adaptador regional aprobado. No se solicita el micrófono ni se envía ninguna credencial al navegador.", manual: "Texto manual", manualHint: "Permanece solo en esta página del navegador. No se traduce ni se envía.", copy: "Copiar texto", clear: "Borrar", copied: "Texto copiado al portapapeles.", copyUnavailable: "Este navegador no puede copiar el texto.", output: "Traducción en pantalla y voz", noOutput: "No hay texto traducido ni audio disponible", tts: "Reproducción de voz", ttsBody: "Sin una traducción aprobada, no se reproduce TTS. Cualquier audio futuro solo puede coincidir exactamente con el texto mostrado.", stages: ["Abrir", "Confirmar", "Terminar"], privacy: "Usar el control de voz nunca inicia una grabación." },
  ru: { eyebrow: "Языковые инструменты · сначала вручную", title: "Держите слова перед глазами", lede: "Голосовая сессия не подключена. Можно подготовить и скопировать собственный текст; микрофон не записывается, содержимое не сохраняется, перевод и аудио не создаются.", home: "Главная VisePanda", language: "Язык интерфейса", voice: "Голосовая сессия", unavailable: "Голосовая сессия недоступна", unavailableBody: "Нет серверной авторизации, краткосрочной выдачи или одобренного регионального адаптера. Микрофон не запрашивается, а учётные данные не отправляются в браузер.", manual: "Ручной текст", manualHint: "Он остаётся только на этой странице браузера. Текст не переводится и не отправляется.", copy: "Копировать текст", clear: "Очистить", copied: "Текст скопирован в буфер обмена.", copyUnavailable: "Этот браузер не может скопировать текст.", output: "Перевод на экране и голос", noOutput: "Переведённый текст или аудио недоступны", tts: "Воспроизведение голоса", ttsBody: "Без одобренного перевода TTS не воспроизводится. Будущее аудио может в точности соответствовать только показанному тексту.", stages: ["Открыть", "Подтвердить", "Завершить"], privacy: "Использование голосового управления никогда не начинает запись." },
  ar: { eyebrow: "أدوات اللغة · الإدخال اليدوي أولاً", title: "أبقِ الكلمات أمامك", lede: "جلسة الصوت غير متصلة. لا يزال بإمكانك إعداد نصك ونسخه؛ لا يُسجَّل الميكروفون ولا يُحفَظ المحتوى ولا تُنشأ ترجمة أو صوت.", home: "الصفحة الرئيسية لـ VisePanda", language: "لغة الواجهة", voice: "جلسة صوتية", unavailable: "جلسة الصوت غير متاحة", unavailableBody: "لا تتوفر مصادقة الخادم أو الإصدار قصير العمر أو موائم إقليمي معتمد. لا يتم طلب الميكروفون ولا تُرسل أي بيانات اعتماد إلى المتصفح.", manual: "نص يدوي", manualHint: "يبقى في صفحة المتصفح هذه فقط. لا يُترجم ولا يُرسل.", copy: "نسخ النص", clear: "مسح", copied: "تم نسخ النص إلى الحافظة.", copyUnavailable: "لا يستطيع هذا المتصفح نسخ النص.", output: "ترجمة الشاشة والصوت", noOutput: "لا يتوفر نص مترجم أو صوت", tts: "تشغيل الصوت", ttsBody: "لا يتم تشغيل TTS دون ترجمة معتمدة. لا يمكن لأي صوت مستقبلي إلا أن يطابق النص الظاهر على الشاشة تماماً.", stages: ["فتح", "تأكيد", "إنهاء"], privacy: "استخدام زر الصوت لا يبدأ التسجيل أبداً." },
};

export function TranslateWorkspace() {
  const [locale, setLocale] = useState<Locale>("zh");
  const [manualText, setManualText] = useState("");
  const [notice, setNotice] = useState("");
  const words = copy[locale];

  useEffect(() => {
    const attributes = getLocaleAttributes(locale);
    document.documentElement.lang = attributes.lang;
    document.documentElement.dir = attributes.dir;
  }, [locale]);

  async function copyManualText() {
    if (!manualText.trim() || !navigator.clipboard) return setNotice(words.copyUnavailable);
    try {
      await navigator.clipboard.writeText(manualText);
      setNotice(words.copied);
    } catch {
      setNotice(words.copyUnavailable);
    }
  }

  function clearManualText() {
    setManualText("");
    setNotice("");
  }

  return <div className={styles.shell}>
    <header className={styles.header}>
      <Link className={styles.brand} href="/visepanda" aria-label={words.home}><VisePandaMark /></Link>
      <select aria-label={words.language} value={locale} onChange={(event) => setLocale(event.target.value as Locale)}>
        {localeOptions.map((option) => <option key={option.value} value={option.value}>{option.flag} {option.label}</option>)}
      </select>
    </header>
    <main className={styles.main}>
      <div className={styles.intro}>
        <p className={styles.eyebrow}>{words.eyebrow}</p>
        <h1>{words.title}</h1>
        <p className={styles.lede}>{words.lede}</p>
      </div>
      <section className={styles.stageRail} aria-label={words.voice}>
        {words.stages.map((stage, index) => <div key={stage}><span>{index + 1}</span><strong>{stage}</strong></div>)}
      </section>
      <div className={styles.grid}>
        <section className={styles.voicePanel} aria-labelledby="voice-status">
          <p className={styles.kicker}>{words.voice}</p>
          <h2 id="voice-status">{words.unavailable}</h2>
          <p>{words.unavailableBody}</p>
          <button className={styles.hold} type="button" disabled>{words.unavailable}</button>
          <p className={styles.privacy}>{words.privacy}</p>
        </section>
        <section className={styles.manualPanel} aria-labelledby="manual-text">
          <div className={styles.panelHeading}><div><p className={styles.kicker}>{words.manual}</p><h2 id="manual-text">{words.manual}</h2></div><p>{words.manualHint}</p></div>
          <textarea aria-label={words.manual} value={manualText} onChange={(event) => setManualText(event.target.value)} placeholder={words.manualHint} />
          <div className={styles.actions}><button type="button" onClick={() => void copyManualText()} disabled={!manualText.trim()}>{words.copy}</button><button type="button" onClick={clearManualText} disabled={!manualText}>{words.clear}</button></div>
          <p className={styles.notice} aria-live="polite">{notice}</p>
        </section>
        <section className={styles.outputPanel} aria-labelledby="screen-output">
          <p className={styles.kicker}>{words.output}</p>
          <h2 id="screen-output">{words.noOutput}</h2>
          <div className={styles.tts}><strong>{words.tts}</strong><p>{words.ttsBody}</p></div>
        </section>
      </div>
    </main>
  </div>;
}
