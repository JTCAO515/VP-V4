"use client";

import { useMemo, useState } from "react";
import Image from "next/image";
import type { Lang } from "@/lib/journey-preview/copy";
import { EXPLORE_CITY_CARDS, POIS, SUPPORT_LABEL, type PoiCategory } from "@/lib/journey-preview/explore";
import { DEMO_UI } from "@/lib/journey-preview/ui";
import type { Localized } from "@/lib/journey-preview/types";
import { SceneArt } from "./art";
import { EvidenceRow, StateBadge } from "./parts";

type Props = {
  lang: Lang;
  onAdd: (place: Localized) => void;
};

const CATEGORIES: PoiCategory[] = ["attractions", "restaurants", "hotels"];
const CATEGORY_LABEL = {
  attractions: { en: "Attractions", zh: "景点" },
  restaurants: { en: "Restaurants", zh: "餐厅" },
  hotels: { en: "Hotels", zh: "酒店" },
} as const;

export default function ExploreSurface({ lang, onAdd }: Props) {
  const ui = DEMO_UI.explore;
  const [cityId, setCityId] = useState("shanghai");
  const [category, setCategory] = useState<PoiCategory>("attractions");
  const [maxTier, setMaxTier] = useState(4);
  const [areaId, setAreaId] = useState("all");
  const [intlOnly, setIntlOnly] = useState(false);
  const [englishOnly, setEnglishOnly] = useState(false);
  const [poiId, setPoiId] = useState<string | null>(null);

  const visible = useMemo(
    () => POIS.filter((poi) =>
      poi.category === category &&
      poi.tier <= maxTier &&
      (areaId === "all" || poi.area.en === areaId) &&
      (!intlOnly || poi.intlCard) &&
      (!englishOnly || poi.english)),
    [areaId, category, maxTier, intlOnly, englishOnly],
  );

  const areas = useMemo(
    () => Array.from(new Map(POIS.filter((item) => item.category === category).map((item) => [item.area.en, item.area])).values()),
    [category],
  );

  const poi = POIS.find((item) => item.id === poiId) ?? null;

  return (
    <div className="demo-explore">
      <header>
        <div><small>Explore</small><h3>{ui.title[lang]}</h3></div>
        <span className="vp-ability">{DEMO_UI.ability.explore[lang]}</span>
        <Image src="/assets/visepanda/journey/shanghai.png" alt={lang === "zh" ? "上海街区灵感插图" : "Shanghai neighbourhood inspiration"} width={110} height={90} />
      </header>

      <div className="explore-city-tabs">
        {EXPLORE_CITY_CARDS.map((city) => (
          <button key={city.id} className={cityId === city.id ? "active" : ""} onClick={() => { setCityId(city.id); setPoiId(null); }}>
            <b>{city.name[lang]}</b>
            <em className={city.ready ? "ready" : "preparing"}>{city.ready ? ui.ready[lang] : ui.preparing[lang]}</em>
            <span>{city.count} {ui.poiCount[lang]} · {city.categories[lang]}</span>
            <small>{city.updated[lang]}</small>
          </button>
        ))}
      </div>

      {cityId === "shanghai" ? (
        <>
          <div className="poi-category-tabs">
            {CATEGORIES.map((item) => (
              <button key={item} className={category === item ? "active" : ""} onClick={() => { setCategory(item); setAreaId("all"); setPoiId(null); }}>
                {CATEGORY_LABEL[item][lang]}
              </button>
            ))}
          </div>

          <div className="vp-filters">
            <small>{ui.filters[lang]}</small>
            <label>
              <span>{maxTier === 4 ? ui.anyPrice[lang] : "¥".repeat(maxTier)}</span>
              <input type="range" min={1} max={4} value={maxTier} onChange={(event) => setMaxTier(Number(event.target.value))} />
            </label>
            <label className="vp-area-filter">
              <span>{ui.area[lang]}</span>
              <select value={areaId} onChange={(event) => setAreaId(event.target.value)}>
                <option value="all">{ui.anyArea[lang]}</option>
                {areas.map((area) => <option key={area.en} value={area.en}>{area[lang]}</option>)}
              </select>
            </label>
            <button className={intlOnly ? "active" : ""} onClick={() => setIntlOnly((value) => !value)}>{ui.intlCard[lang]}</button>
            <button className={englishOnly ? "active" : ""} onClick={() => setEnglishOnly((value) => !value)}>{ui.englishService[lang]}</button>
            <button onClick={() => { setMaxTier(4); setAreaId("all"); setIntlOnly(false); setEnglishOnly(false); }}>{ui.reset[lang]}</button>
            <em>{visible.length} {ui.results[lang]}</em>
          </div>

          {visible.length === 0 ? (
            <div className="vp-empty">
              <h4>{ui.noResults[lang]}</h4>
              <p>{ui.noResultsBody[lang]}</p>
              <div><button onClick={() => { setMaxTier(4); setAreaId("all"); setIntlOnly(false); setEnglishOnly(false); }}>{ui.reset[lang]}</button></div>
            </div>
          ) : (
            <div className="poi-card-grid">
              {visible.map((item) => (
                <button key={item.id} onClick={() => setPoiId(item.id)}>
                  <span className="poi-cover"><SceneArt name={item.art} /></span>
                  <small>{item.area[lang]}</small>
                  <strong>{item.name[lang]}</strong>
                  <em>{item.price[lang]}</em>
                  <StateBadge state={item.state} lang={lang} />
                </button>
              ))}
            </div>
          )}
        </>
      ) : (
        <div className="city-coming-soon">
          <span>◇</span>
          <h4>{ui.citySoonTitle[lang]}</h4>
          <p>{ui.citySoonBody[lang]}</p>
        </div>
      )}

      {poi ? (
        <aside className="poi-detail-drawer">
          <button className="vp-close" onClick={() => setPoiId(null)}>×</button>
          <span className="poi-detail-cover"><SceneArt name={poi.art} /></span>
          <small>{poi.area[lang]} · {DEMO_UI.fixture[lang]}</small>
          <h3>{poi.name[lang]}</h3>
          <p className="vp-address">{poi.address[lang]}</p>
          <StateBadge state={poi.state} lang={lang} />
          <p>{poi.review[lang]}</p>

          <section className="vp-matrix">
            <h4>{ui.payment[lang]}</h4>
            <dl>
              {poi.payment.map((row, index) => (
                <div key={index}><dt>{row.method[lang]}</dt><dd className={`support-${row.value}`}>{SUPPORT_LABEL[row.value][lang]}</dd></div>
              ))}
            </dl>
          </section>

          <section className="vp-matrix">
            <h4>{ui.language[lang]}</h4>
            <dl>
              {poi.language.map((row, index) => (
                <div key={index}><dt>{row.item[lang]}</dt><dd>{row.value[lang]}</dd></div>
              ))}
            </dl>
          </section>

          <section className="vp-matrix">
            <h4>{ui.entry[lang]}</h4>
            <dl>
              {poi.entry.map((row, index) => (
                <div key={index}><dt>{row.item[lang]}</dt><dd>{row.value[lang]}</dd></div>
              ))}
            </dl>
          </section>

          <section className="vp-matrix">
            <h4>{ui.sourceLine[lang]}</h4>
            <EvidenceRow items={poi.evidence} lang={lang} />
          </section>

          <div className="vp-drawer-actions">
            <button onClick={() => { onAdd({ en: `Ask about ${poi.name.en}`, zh: `想了解${poi.name.zh}` }); setPoiId(null); }}>{ui.ask[lang]}</button>
            <button className="poi-add-button" onClick={() => { onAdd(poi.name); setPoiId(null); }}>{ui.add[lang]}</button>
          </div>
        </aside>
      ) : null}

    </div>
  );
}
