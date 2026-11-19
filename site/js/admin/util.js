// Utilidades compartilhadas do painel.
export const $ = (s, el) => (el || document).querySelector(s);
export const $$ = (s, el) => Array.from((el || document).querySelectorAll(s));
export const ICONES = window.FAREJADOR_ICONES;
export const svgIcone = window.farejadorSvgIcone;
export const fmt = new Intl.NumberFormat("pt-BR");
export const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

export const cssVar = (v) => getComputedStyle(document.documentElement).getPropertyValue(v).trim();
export const CORES = [];
export const paleta = { cinza: "#7a869c" };
export function lerCores() {
  CORES.length = 0;
  ["--s1", "--s2", "--s3", "--s4", "--s5", "--s6", "--s7", "--s8"].forEach((v) => CORES.push(cssVar(v)));
  paleta.cinza = cssVar("--txt-3") || paleta.cinza;
}
lerCores();

export function temaAtual() { return document.documentElement.dataset.tema === "claro" ? "claro" : "escuro"; }
function luminancia(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex || ""); if (!m) return 1;
  const n = parseInt(m[1], 16), c = [n >> 16, (n >> 8) & 255, n & 255].map((v) => { v /= 255; return v <= .03928 ? v / 12.92 : Math.pow((v + .055) / 1.055, 2.4); });
  return .2126 * c[0] + .7152 * c[1] + .0722 * c[2];
}
/** Logos pretos (TikTok, X, Threads…) ficam claros no tema escuro. */
export function corVisivel(cor) { return temaAtual() === "escuro" && luminancia(cor) < .03 ? "#e8edf7" : cor; }

export function toast(msg, erro) {
  const t = $("#toast"); t.textContent = msg; t.className = "toast on" + (erro ? " erro" : "");
  clearTimeout(toast._t); toast._t = setTimeout(() => (t.className = "toast"), 2800);
}
export function quando(ts) {
  if (!ts) return "—";
  const d = new Date(ts), seg = (Date.now() - d) / 1000;
  if (seg < 60) return "agora";
  if (seg < 3600) return Math.floor(seg / 60) + " min";
  if (seg < 86400) return Math.floor(seg / 3600) + " h";
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "short" }) + " " + d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}
export const dataHora = (ts) => (ts ? new Date(ts).toLocaleString("pt-BR") : "—");
export const dataCurta = (iso) => new Date(iso + (iso.length === 10 ? "T12:00:00" : "")).toLocaleDateString("pt-BR", { day: "2-digit", month: "short" });
export function duracao(ms) { const s = Math.round((ms || 0) / 1000); return s < 60 ? s + " s" : Math.floor(s / 60) + " min " + (s % 60) + " s"; }
export function corHash(txt) { let h = 0; for (const c of String(txt)) h = (h * 31 + c.charCodeAt(0)) >>> 0; return CORES[h % CORES.length]; }
export function iconeMini(tipo, cor) { cor = cor ? corVisivel(cor) : cor; return '<span class="ico" style="color:' + (cor || "currentColor") + '">' + svgIcone(tipo || "link", cor) + "</span>"; }
export const ICONE_CANAL = { "Instagram": "instagram", "TikTok": "tiktok", "YouTube": "youtube", "Facebook": "facebook", "WhatsApp": "whatsapp", "Telegram": "telegram", "X / Twitter": "x", "Threads": "threads", "Kwai": "kwai", "LinkedIn": "linkedin", "Pinterest": "pinterest", "Reddit": "reddit", "Discord": "discord", "Google": "site", "Bing": "site", "E-mail": "email", "QR Code": "link", "Direto": "link" };

/** Variação percentual formatada (▲ 12%). */
export function variacao(atual, anterior) {
  if (!anterior && !atual) return { txt: "—", cls: "" };
  if (!anterior) return { txt: "novo", cls: "sobe" };
  const p = Math.max(-999, Math.min(999, Math.round(100 * (atual - anterior) / anterior)));
  return { txt: (p > 0 ? "▲ " : p < 0 ? "▼ " : "") + Math.abs(p) + "%", cls: p > 0 ? "sobe" : p < 0 ? "desce" : "" };
}

export async function copiar(texto) {
  try { await navigator.clipboard.writeText(texto); toast("Copiado!"); }
  catch (_) { prompt("Copie o link:", texto); }
}

export function lerArquivoComoDataURL(arquivo) {
  return new Promise((ok, erro) => { const fr = new FileReader(); fr.onload = () => ok(fr.result); fr.onerror = erro; fr.readAsDataURL(arquivo); });
}

export const SVG = {
  sol: '<svg class="i" viewBox="0 0 24 24"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>',
  lua: '<svg class="i" viewBox="0 0 24 24"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/></svg>',
  olho: '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
  sessao: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 9h18"/>',
  clique: '<path d="m9 9 5 12 1.8-5.2L21 14z"/><path d="M7.2 2.2 8 5.1M5.1 8l-2.9-.8M14 4.1 12 6.2M6.2 12l-2.1 2"/>',
  pct: '<path d="M19 5 5 19"/><circle cx="6.5" cy="6.5" r="2.5"/><circle cx="17.5" cy="17.5" r="2.5"/>',
  tempo: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  escudo: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="m9 12 2 2 4-4"/>',
  pessoas: '<circle cx="9" cy="8" r="4"/><path d="M2 21a7 7 0 0 1 14 0M16 4a4 4 0 0 1 0 8M22 21a6 6 0 0 0-4-5.6"/>',
  novo: '<circle cx="9" cy="8" r="4"/><path d="M2 21a7 7 0 0 1 14 0M19 8v6M16 11h6"/>',
  volta: '<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/>',
  copiar: '<rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>',
  qr: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><path d="M14 14h3v3h-3zM20 20h1"/>',
  lixo: '<path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>',
  pausa: '<rect x="6" y="4" width="4" height="16" rx="1"/><rect x="14" y="4" width="4" height="16" rx="1"/>',
  play: '<path d="m6 4 14 8-14 8z"/>',
  estrela: '<path d="m12 2 3.1 6.3 6.9 1-5 4.9 1.2 6.8L12 17.8 5.8 21l1.2-6.8-5-4.9 6.9-1z"/>',
  editar: '<path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/>',
  abrir: '<path d="M15 3h6v6M10 14 21 3M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>',
};
export const ico = (k) => '<svg class="i" viewBox="0 0 24 24">' + SVG[k] + "</svg>";
