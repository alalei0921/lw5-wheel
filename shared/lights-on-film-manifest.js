(() => {
  'use strict';
  const configured = window.LW5LightsFilmConfig?.assetBase;
  const source = document.currentScript?.src || location.href;
  const base = new URL(configured || '../assets/lights-film/v1/', source).href;
  const version = 76;
  window.LW5LightsFilmManifest = Object.freeze({
    version, width: 720, height: 1280, fps: 24, duration: 16,
    levels: Object.freeze(Array.from({ length: 10 }, (_, level) => {
      const name = 'level-' + String(level).padStart(2, '0');
      return Object.freeze({
        video: new URL(`${name}.mp4?scene=${version}`, base).href,
        poster: new URL(`${name}.jpg?scene=${version}`, base).href,
      });
    })),
  });
})();
