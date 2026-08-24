"use client";

import Image from "next/image";
import { useEffect, useState } from "react";

import { destinationPreviews } from "@/lib/destination-preview";
import type { Locale, LocalizedCopy } from "@/lib/i18n";
import { mapPreviewCopy } from "@/lib/map-preview-copy";

const MAP_IMAGE = "/assets/visepanda/china-outline-preview-v4-transparent.png";
const CYCLE_INTERVAL_MS = 5_000;

type ChinaMapHeroProps = {
  copy: LocalizedCopy;
  locale: Locale;
  onEarlyAccess: () => void;
};

function randomNextIndex(currentIndex: number): number {
  const offset = 1 + Math.floor(Math.random() * (destinationPreviews.length - 1));
  return (currentIndex + offset) % destinationPreviews.length;
}

export function ChinaMapHero({ copy, locale, onEarlyAccess }: ChinaMapHeroProps) {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [motionEnabled, setMotionEnabled] = useState(false);
  const [cycleKey, setCycleKey] = useState(0);
  const mapCopy = mapPreviewCopy[locale];
  const selectedDestination = destinationPreviews[selectedIndex];
  const calloutAlignment = selectedDestination.x > 60 ? "is-right" : "";
  const destinationStream = Array.from({ length: 5 }, (_, offset) => destinationPreviews[(selectedIndex + offset) % destinationPreviews.length]);

  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: no-preference)");
    const updateMotion = () => setMotionEnabled(media.matches);
    updateMotion();
    media.addEventListener("change", updateMotion);
    if (media.matches) setSelectedIndex(randomNextIndex(0));
    return () => media.removeEventListener("change", updateMotion);
  }, []);

  useEffect(() => {
    if (!motionEnabled) return;
    const timeout = window.setTimeout(() => {
      setSelectedIndex((current) => randomNextIndex(current));
      setCycleKey((current) => current + 1);
    }, CYCLE_INTERVAL_MS);
    return () => window.clearTimeout(timeout);
  }, [cycleKey, motionEnabled]);

  const selectDestination = (index: number) => {
    setSelectedIndex(index);
    setCycleKey((current) => current + 1);
  };

  return (
    <section className="hero hero-map" id="top">
      <div className="hero-map-inner">
        <div className="hero-copy hero-map-copy">
          <h1>{copy.hero.title}</h1>
          <p className="hero-subtitle">{copy.hero.subtitle}</p>
          <button type="button" className="primary-button hero-early-access" onClick={onEarlyAccess}>
            {copy.earlyAccess.button}
          </button>
        </div>

        <figure className="china-map-stage" aria-describedby="map-preview-note">
          <Image
            src={MAP_IMAGE}
            alt={mapCopy.mapAlt}
            width={1487}
            height={1058}
            sizes="(max-width: 900px) 100vw, 58vw"
            priority
            unoptimized
          />
          <svg className="map-routes" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
            <path d="M25 65 C42 51 51 58 62 59 S77 47 85 59" />
            <path d="M15 36 C34 26 47 37 58 42 S74 39 82 30" />
            <path d="M58 74 C68 64 77 70 85 58" />
          </svg>
          <div className="map-markers" aria-label={mapCopy.mapAlt}>
            {destinationPreviews.map((destination, index) => {
              const active = index === selectedIndex;
              return (
                <button
                  key={destination.id}
                  className={`map-marker ${active ? "is-active" : ""}`}
                  style={{ left: `${destination.x}%`, top: `${destination.y}%` }}
                  aria-label={mapCopy.markerLabel(destination.name)}
                  aria-pressed={active}
                  onClick={() => selectDestination(index)}
                >
                  <span className="map-marker-dot" />
                </button>
              );
            })}
          </div>
          <aside
            className={`map-callout ${calloutAlignment}`}
            style={{ left: `${selectedDestination.x}%`, top: `${selectedDestination.y}%` }}
          >
            <strong>{selectedDestination.name}</strong>
            <span>{mapCopy.featuredLabel} · {selectedDestination.featuredPlace}</span>
            <span>{mapCopy.weatherLabel} · {mapCopy.weatherUnavailable}</span>
          </aside>
          <aside className="destination-stream" aria-label="目的地动态列表">
            {destinationStream.map((destination, index) => (
              <div key={`${destination.id}-${index}`} className={index === 0 ? "is-current" : ""}>
                <span>{String(index + 1).padStart(2, "0")}</span><strong>{destination.name}</strong>
              </div>
            ))}
          </aside>
          <figcaption id="map-preview-note">{mapCopy.source}</figcaption>
        </figure>
      </div>
    </section>
  );
}
