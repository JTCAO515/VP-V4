"use client";

import type { Lang } from "@/lib/journey-preview/copy";
import { DISHES } from "@/lib/journey-preview/explore";
import { SceneArt } from "./art";

/**
 * Rendered at workspace level so "View dishes" from the Canvas opens over the
 * current surface instead of throwing the visitor into Explore.
 */
export default function DishDrawer({ lang, onClose, onToast }: { lang: Lang; onClose: () => void; onToast: (message: string) => void }) {
  return (
    <aside className="demo-dish-drawer">
      <button className="vp-close" onClick={onClose}>×</button>
      <h3>{lang === "zh" ? "推荐菜品" : "Recommended dishes"}</h3>
      {DISHES.map((dish) => (
        <article key={dish.id} className={dish.safe ? "vp-dish" : "vp-dish unsafe"}>
          <span className="demo-food-image"><SceneArt name={dish.art} /></span>
          <strong>{dish.name[lang]}</strong>
          {dish.safe ? null : (
            <p className="vp-allergen">
              {lang === "zh" ? "这道菜含花生，与你的过敏设置冲突。" : "This dish contains peanut and conflicts with your allergy setting."}
              <button onClick={() => onToast(lang === "zh" ? "已给出替代菜品" : "Replacement suggested")}>
                {lang === "zh" ? "替换建议" : "Suggest a replacement"}
              </button>
            </p>
          )}
          <dl>
            <div><dt>{lang === "zh" ? "口味" : "Taste"}</dt><dd>{dish.taste[lang]}</dd></div>
            <div><dt>{lang === "zh" ? "原料" : "Ingredients"}</dt><dd>{dish.ingredients[lang]}</dd></div>
            <div><dt>{lang === "zh" ? "过敏原" : "Allergens"}</dt><dd>{dish.allergens[lang]}</dd></div>
            <div><dt>{lang === "zh" ? "搭配" : "Pairing"}</dt><dd>{dish.pairing[lang]}</dd></div>
            <div><dt>{lang === "zh" ? "价格" : "Price"}</dt><dd>{dish.price[lang]}</dd></div>
          </dl>
        </article>
      ))}
      <div className="vp-order-card">
        <small>{lang === "zh" ? "点菜卡（出示给店员）" : "Ordering card (show to staff)"}</small>
        <strong>我对花生过敏，请不要加花生或花生油。</strong>
        <em>{lang === "zh" ? "这是预设示例。点餐前仍需与店员确认。" : "This is a prepared example. Confirm with staff before ordering."}</em>
      </div>
    </aside>
  );
}
