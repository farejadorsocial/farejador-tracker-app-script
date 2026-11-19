// Mapas (Leaflet): camadas detalhadas, pinos e popups.
import { esc } from "./util.js";

export function camadas() {
  return {
    "Ruas (detalhado)": L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19, attribution: "© OpenStreetMap" }),
    "Escuro": L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png", { maxZoom: 20, attribution: "© OpenStreetMap © CARTO" }),
    "Satélite": L.layerGroup([
      L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}", { maxZoom: 19, attribution: "Imagens © Esri" }),
      L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}", { maxZoom: 19 }),
    ]),
  };
}

export function criarMapa(id) {
  const c = camadas();
  const m = L.map(id, { zoomControl: true, worldCopyJump: true, layers: [c["Ruas (detalhado)"]] }).setView([-14.2, -51.9], 4);
  L.control.layers(c, null, { position: "topright" }).addTo(m);
  L.control.scale({ imperial: false }).addTo(m);
  return m;
}

export function pino(cor) {
  return L.divIcon({ className: "", iconSize: [28, 38], iconAnchor: [14, 36], popupAnchor: [0, -32],
    html: '<svg width="28" height="38" viewBox="0 0 28 38"><path d="M14 1C6.8 1 1 6.7 1 13.8 1 23.5 14 37 14 37s13-13.5 13-23.2C27 6.7 21.2 1 14 1z" fill="' + cor + '" stroke="#0c0c10" stroke-width="2"/><circle cx="14" cy="14" r="5" fill="#fff"/></svg>' });
}

export function popupIp(r) {
  return "<b>" + esc([r.cidade, r.regiao].filter(Boolean).join(" — ")) + "</b><br>" + esc(r.pais || "") + (r.codigo_postal ? " · CEP " + esc(r.codigo_postal) : "") +
    "<br>IP: <code>" + esc(r.ip) + "</code><br>" + esc(r.organizacao || r.org || "") + (r.hostname ? "<br><small>" + esc(r.hostname) + "</small>" : "");
}

export function distanciaKm(a, b, c, d) {
  const R = 6371, r = Math.PI / 180, dLat = (c - a) * r, dLon = (d - b) * r;
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(a * r) * Math.cos(c * r) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(x));
}
