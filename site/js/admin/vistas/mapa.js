// Mapa geral dos visitantes já localizados (IPinfo) e GPS autorizado.
import { api } from "../api.js";
import { estado, query } from "../estado.js";
import { criarMapa, pino, popupIp } from "../mapas.js";
import { $, CORES, toast } from "../util.js";

let mapa = null, grupo = null;

export function reiniciar() { if (mapa) { mapa.remove(); mapa = null; grupo = null; } }

export async function carregar() {
  estado.stats = await api("/api/admin/estatisticas" + query());
  const pontos = estado.stats.mapa;
  if (!window.L) { $("#mapa-geral").innerHTML = '<p class="vazio">Leaflet não carregou.</p>'; return; }
  if (!mapa) { mapa = criarMapa("mapa-geral"); grupo = L.featureGroup().addTo(mapa); }
  grupo.clearLayers();
  pontos.forEach((p) => {
    if (p.tipo === "gps") {
      L.marker([p.lat, p.lon], { icon: pino(CORES[5]) }).addTo(grupo).bindPopup("<b>GPS autorizado</b><br>Visitante <code>" + p.visitante.slice(0, 8) + "</code><br>Precisão ±" + Math.round(p.precisao || 0) + " m");
      if (p.precisao) L.circle([p.lat, p.lon], { radius: p.precisao, color: CORES[5], weight: 1, fillOpacity: .12 }).addTo(grupo);
    } else {
      L.marker([p.lat, p.lon], { icon: pino(CORES[0]) }).addTo(grupo).bindPopup(popupIp({ ip: p.ip, cidade: p.cidade, regiao: p.regiao, pais: p.pais, organizacao: p.org }) + "<br>Visitante <code>" + p.visitante.slice(0, 8) + "</code>");
    }
  });
  setTimeout(() => { mapa.invalidateSize(); if (pontos.length) mapa.fitBounds(grupo.getBounds(), { padding: [50, 50], maxZoom: 12 }); }, 60);
}

export function iniciar() {
  $("#consultar-pendentes").addEventListener("click", async (e) => {
    const b = e.currentTarget; b.disabled = true;
    try {
      const pend = (await api("/api/admin/visitantes" + query())).visitantes.filter((v) => v.ip && !v.local);
      if (!pend.length) { toast("Todos os IPs já foram consultados."); return; }
      let ok = 0;
      for (const [i, v] of pend.entries()) {
        b.textContent = "Consultando " + (i + 1) + "/" + pend.length + "…";
        try { const x = await api("/api/admin/ipinfo/" + encodeURIComponent(v.ip) + "?visitante=" + v.visitante_id, { method: "POST" }); if (x.consultado) ok++; } catch (_) {}
      }
      toast(ok + " de " + pend.length + " IPs localizados.");
      carregar();
    } finally { b.disabled = false; b.textContent = "Consultar IPs pendentes"; }
  });
}
