// Estatísticas calculadas no navegador a partir dos eventos brutos da planilha
// (visão geral, comparação de períodos, retorno de visitantes e campanhas).

const ymd = (d) => d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
const diaDe = (epoch) => ymd(new Date(epoch * 1000));
const deISO = (s) => { const [a, m, d] = s.split("-").map(Number); return new Date(a, m - 1, d); };
const somaDias = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
const ini = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime() / 1000;
const fimDia = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59).getTime() / 1000;

export function resolverPeriodo(q) {
  const hoje = new Date();
  let ate = q.ate ? deISO(q.ate) : new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate());
  let de = q.de ? deISO(q.de) : somaDias(ate, -(Math.max(1, Math.min(+q.dias || 30, 730)) - 1));
  if (de > ate) [de, ate] = [ate, de];
  const n = Math.round((ate - de) / 864e5) + 1;
  const cmpAte = somaDias(de, -1), cmpDe = somaDias(cmpAte, -(n - 1));
  return { de, ate, dias: n, cmpDe, cmpAte, ini: ini(de), fim: fimDia(ate), cmpIni: ini(cmpDe), cmpFim: fimDia(cmpAte) };
}

function contar(lista) { const m = new Map(); lista.forEach((k) => { if (k !== null && k !== undefined && k !== "") m.set(k, (m.get(k) || 0) + 1); }); return m; }
function top(m, n = 8) {
  const itens = [...m.entries()].sort((a, b) => b[1] - a[1]);
  const saida = itens.slice(0, n).map(([nome, valor]) => ({ nome, valor }));
  const resto = itens.slice(n).reduce((a, [, v]) => a + v, 0);
  if (resto) saida.push({ nome: "Outros", valor: resto });
  return saida;
}

function kpis(evs) {
  const pv = evs.filter((e) => e.tipo === "pageview"), ck = evs.filter((e) => e.tipo === "clique");
  const sess = new Set(pv.map((e) => e.sessao).filter(Boolean));
  const sessClick = new Set(ck.map((e) => e.sessao).filter((s) => sess.has(s)));
  const dur = new Map();
  evs.forEach((e) => { if (e.tipo === "saida" && e.sessao) dur.set(e.sessao, Math.max(dur.get(e.sessao) || 0, +e.duracao_ms || 0)); });
  const cons = evs.filter((e) => e.tipo === "consentimento");
  const aceitos = cons.filter((e) => (e.dados || {}).escolha === "aceito").length;
  const durs = [...dur.values()];
  return {
    visualizacoes: pv.length, sessoes: sess.size, cliques: ck.length,
    visitantes_identificados: new Set(evs.map((e) => e.visitante).filter(Boolean)).size,
    ctr: sess.size ? Math.round(1000 * sessClick.size / sess.size) / 10 : 0,
    tempo_medio_s: durs.length ? Math.round(durs.reduce((a, b) => a + b, 0) / durs.length / 100) / 10 : 0,
    consentimento_taxa: cons.length ? Math.round(1000 * aceitos / cons.length) / 10 : 0,
    compartilhamentos: evs.filter((e) => e.tipo === "compartilhar").length,
  };
}

function serie(evs, de, n) {
  const s = new Map();
  for (let i = 0; i < n; i++) { const d = ymd(somaDias(de, i)); s.set(d, { dia: d, visualizacoes: 0, cliques: 0, sessoes: new Set() }); }
  evs.forEach((e) => {
    if (e.tipo !== "pageview" && e.tipo !== "clique") return;
    const x = s.get(diaDe(e.ts_epoch)); if (!x) return;
    if (e.tipo === "pageview") { x.visualizacoes++; if (e.sessao) x.sessoes.add(e.sessao); } else x.cliques++;
  });
  return [...s.values()].map((v) => ({ dia: v.dia, visualizacoes: v.visualizacoes, cliques: v.cliques, sessoes: v.sessoes.size }));
}

const canalSessao = (evs) => { const m = new Map(); evs.forEach((e) => { if (e.tipo === "pageview" && e.sessao) m.set(e.sessao, e.canal || "Direto"); }); return m; };

function porLink(evs, linksCfg) {
  const total = new Set(evs.filter((e) => e.tipo === "pageview" && e.sessao).map((e) => e.sessao)).size;
  const por = new Map();
  linksCfg.forEach((l) => por.set(l.id, { id: l.id, titulo: l.titulo, tipo: l.tipo, url: l.url, ativo: l.ativo, cliques: 0, _s: new Set(), icone: 0, botao: 0 }));
  evs.forEach((e) => {
    if (e.tipo !== "clique") return;
    if (!por.has(e.link_id)) por.set(e.link_id, { id: e.link_id, titulo: e.link_titulo, tipo: e.link_tipo, url: e.destino, ativo: false, cliques: 0, _s: new Set(), icone: 0, botao: 0 });
    const it = por.get(e.link_id);
    it.cliques++; if (e.sessao) it._s.add(e.sessao);
    if (e.area === "icone" || e.area === "botao") it[e.area]++;
  });
  por.forEach((v) => { v.unicos = v._s.size; delete v._s; v.ctr = total ? Math.round(1000 * v.unicos / total) / 10 : 0; });
  return por;
}

function resumoRobos(evs) {
  const r = evs.filter((e) => e.robo);
  return { total: r.length, por_robo: top(contar(r.map((e) => e.robo_nome || (e.ua_info || {}).navegador || "Robô")), 10),
           previas: r.filter((e) => e.tipo === "previa").length, visitas: r.filter((e) => e.tipo === "pageview").length, cliques: r.filter((e) => e.tipo === "clique").length };
}

export function visaoGeral(todos, p, linksCfg, incluirRobos) {
  const no = (a, b) => todos.filter((e) => e.ts_epoch >= a && e.ts_epoch <= b);
  const brutos = no(p.ini, p.fim);
  const filtra = (l) => (incluirRobos ? l : l.filter((e) => !e.robo));
  const evs = filtra(brutos), ant = filtra(no(p.cmpIni, p.cmpFim));
  const pv = evs.filter((e) => e.tipo === "pageview"), ck = evs.filter((e) => e.tipo === "clique");
  const cs = canalSessao(evs);

  const la = porLink(evs, linksCfg), lp = porLink(ant, linksCfg), links = [];
  la.forEach((v, id) => { const a = lp.get(id) || {}; v.cliques_anterior = a.cliques || 0; v.ctr_anterior = a.ctr || 0; links.push(v); });
  links.sort((a, b) => b.cliques - a.cliques);

  const canais = contar([...cs.values()]), canaisAnt = contar([...canalSessao(ant).values()]);
  const nomes = [...new Set([...canais.keys(), ...canaisAnt.keys()])].sort((a, b) => (canais.get(b) || 0) - (canais.get(a) || 0) || (canaisAnt.get(b) || 0) - (canaisAnt.get(a) || 0));
  const fluxo = new Map();
  ck.forEach((e) => { const k = (cs.get(e.sessao) || e.canal || "Direto") + "\u0000" + (e.link_titulo || e.link_id); fluxo.set(k, (fluxo.get(k) || 0) + 1); });
  const calor = Array.from({ length: 7 }, () => Array(24).fill(0));
  pv.forEach((e) => { const d = new Date(e.ts_epoch * 1000); calor[(d.getDay() + 6) % 7][d.getHours()]++; });
  const cliquesSessao = contar(ck.map((e) => e.sessao));
  return {
    periodo: { de: ymd(p.de), ate: ymd(p.ate), dias: p.dias, cmp_de: ymd(p.cmpDe), cmp_ate: ymd(p.cmpAte) },
    kpis: kpis(evs), kpis_anterior: kpis(ant),
    serie: serie(evs, p.de, p.dias), serie_anterior: serie(ant, p.cmpDe, p.dias),
    links, comparacao_canais: nomes.slice(0, 12).map((n) => ({ nome: n, atual: canais.get(n) || 0, anterior: canaisAnt.get(n) || 0 })),
    fluxo: [...fluxo.entries()].sort((a, b) => b[1] - a[1]).slice(0, 40).map(([k, v]) => { const [o, d] = k.split("\u0000"); return { origem: o, destino: d, valor: v }; }),
    canais: top(canais),
    referers: top(contar(pv.map((e) => (e.origem || {}).dominio)), 10),
    campanhas_utm: top(contar(pv.map((e) => (e.utm || {}).utm_campaign)), 10),
    dispositivos: top(contar(pv.map((e) => (e.ua_info || {}).dispositivo))),
    navegadores: top(contar(pv.map((e) => (e.ua_info || {}).navegador))),
    sistemas: top(contar(pv.map((e) => (e.ua_info || {}).sistema))),
    idiomas: top(contar(pv.map((e) => e.idioma)), 6), fusos: top(contar(pv.map((e) => e.timezone)), 6), telas: top(contar(pv.map((e) => e.tela)), 6),
    calor,
    funil: [
      { etapa: "Abriram a página", valor: new Set(pv.map((e) => e.sessao).filter(Boolean)).size },
      { etapa: "Clicaram em um link", valor: cliquesSessao.size },
      { etapa: "Clicaram em 2 ou mais", valor: [...cliquesSessao.values()].filter((v) => v >= 2).length },
    ],
    robos: resumoRobos(brutos),
  };
}

/** sessoes: [[sessao, inicioEpoch, canal, visitante], …] (todas até o fim do período) */
export function retorno(sessoes, p) {
  const porVis = new Map();
  let anonimas = 0, identificadas = 0;
  sessoes.forEach(([, t, canal, vid]) => {
    const noPeriodo = t >= p.ini && t <= p.fim;
    if (vid) { if (!porVis.has(vid)) porVis.set(vid, []); porVis.get(vid).push([t, canal || "Direto"]); if (noPeriodo) identificadas++; }
    else if (noPeriodo) anonimas++;
  });
  porVis.forEach((s) => s.sort((a, b) => a[0] - b[0]));
  const ativos = new Map([...porVis].filter(([, s]) => s.some(([t]) => t >= p.ini && t <= p.fim)));
  const novos = new Set([...ativos].filter(([, s]) => s[0][0] >= p.ini).map(([v]) => v));
  const recorrentes = ativos.size - novos.size;
  const voltaram = [...novos].filter((v) => ativos.get(v).length >= 2).length;
  const ordem = ["Menos de 1 dia", "1 a 7 dias", "8 a 30 dias", "Mais de 30 dias"], faixas = new Map();
  ativos.forEach((s) => { if (s.length < 2) return; const g = (s[1][0] - s[0][0]) / 86400; const k = g < 1 ? ordem[0] : g <= 7 ? ordem[1] : g <= 30 ? ordem[2] : ordem[3]; faixas.set(k, (faixas.get(k) || 0) + 1); });

  const ser = new Map();
  for (let i = 0; i < p.dias; i++) { const d = ymd(somaDias(p.de, i)); ser.set(d, { dia: d, novos: new Set(), recorrentes: new Set() }); }
  ativos.forEach((s, v) => { const pri = diaDe(s[0][0]); s.forEach(([t]) => { const d = diaDe(t), x = ser.get(d); if (x) x[d === pri ? "novos" : "recorrentes"].add(v); }); });

  const canais = new Map();
  ativos.forEach((s) => { const c = canais.get(s[0][1]) || { visitantes: 0, voltaram: 0 }; c.visitantes++; if (s.length >= 2) c.voltaram++; canais.set(s[0][1], c); });

  const segFim = somaDias(p.ate, -((p.ate.getDay() + 6) % 7)), coortes = [];
  for (let w = 7; w >= 0; w--) {
    const seg = somaDias(segFim, -7 * w), a = ini(seg), b = fimDia(somaDias(seg, 6));
    const grupo = [...porVis.values()].filter((s) => s[0][0] >= a && s[0][0] <= b), semanas = [];
    for (let k = 1; k <= 4; k++) {
      const ka = a + k * 7 * 86400, kb = b + k * 7 * 86400;
      if (ka > p.fim) { semanas.push(null); continue; }
      semanas.push(grupo.length ? Math.round(1000 * grupo.filter((s) => s.some(([t]) => t >= ka && t <= kb)).length / grupo.length) / 10 : 0);
    }
    coortes.push({ semana: ymd(seg), visitantes: grupo.length, retorno: semanas });
  }
  const iso = (t) => new Date(t * 1000).toISOString();
  return {
    visitantes_ativos: ativos.size, novos: novos.size, recorrentes,
    taxa_retorno_novos: novos.size ? Math.round(1000 * voltaram / novos.size) / 10 : 0,
    sessoes_por_visitante: ativos.size ? Math.round(100 * [...ativos.values()].reduce((a, s) => a + s.length, 0) / ativos.size) / 100 : 0,
    cobertura: { identificadas, anonimas, pct: identificadas + anonimas ? Math.round(1000 * identificadas / (identificadas + anonimas)) / 10 : 0 },
    intervalo_retorno: ordem.map((k) => ({ nome: k, valor: faixas.get(k) || 0 })),
    serie: [...ser.values()].map((v) => ({ dia: v.dia, novos: v.novos.size, recorrentes: v.recorrentes.size })),
    por_canal: [...canais].map(([canal, v]) => ({ canal, ...v, taxa: Math.round(1000 * v.voltaram / v.visitantes) / 10 })).sort((a, b) => b.visitantes - a.visitantes).slice(0, 10),
    coortes,
    top_visitantes: [...ativos].sort((a, b) => b[1].length - a[1].length).slice(0, 12)
      .map(([v, s]) => ({ visitante: v, sessoes: s.length, primeira: iso(s[0][0]), ultima: iso(s[s.length - 1][0]), canal: s[0][1] })),
  };
}

export function campanhas(lista, todos, p) {
  const medir = (a, b) => {
    const m = new Map();
    todos.forEach((e) => {
      if (e.robo || !e.campanha_id || e.ts_epoch < a || e.ts_epoch > b || (e.tipo !== "pageview" && e.tipo !== "clique")) return;
      if (!m.has(e.campanha_id)) m.set(e.campanha_id, { visitas: 0, sessoes: new Set(), cliques: 0, sClick: new Set(), ultimo: null, links: new Map() });
      const x = m.get(e.campanha_id);
      if (e.tipo === "pageview") { x.visitas++; if (e.sessao) x.sessoes.add(e.sessao); x.ultimo = e.ts; }
      else { x.cliques++; if (e.sessao) x.sClick.add(e.sessao); const n = e.link_titulo || e.link_id; x.links.set(n, (x.links.get(n) || 0) + 1); }
    });
    return m;
  };
  const atual = medir(p.ini, p.fim), anterior = medir(p.cmpIni, p.cmpFim);
  return lista.map((c) => {
    const a = atual.get(c.id), b = anterior.get(c.id), ses = a ? a.sessoes.size : 0;
    return Object.assign({}, c, {
      visitas: a ? a.visitas : 0, sessoes: ses, cliques: a ? a.cliques : 0, ctr: a && ses ? Math.round(1000 * a.sClick.size / ses) / 10 : 0,
      ultimo: a ? a.ultimo : null, links: a ? top(a.links, 5).filter((l) => l.nome !== "Outros") : [],
      visitas_anterior: b ? b.visitas : 0, cliques_anterior: b ? b.cliques : 0,
    });
  });
}

/** CSV de todos os eventos (para Excel/Planilhas). */
export function csv(evs) {
  const col = ["data_hora", "tipo", "robo", "sessao", "visitante", "canal", "referer", "utm_source", "utm_campaign", "campanha_id", "link", "destino", "dispositivo", "navegador", "sistema", "duracao_ms"];
  const q = (v) => { v = v === null || v === undefined ? "" : String(v); return /[;"\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; };
  const linhas = evs.map((e) => { const u = e.utm || {}, ua = e.ua_info || {};
    return [e.ts, e.tipo, e.robo ? 1 : 0, e.sessao, e.visitante, e.canal, e.referer, u.utm_source, u.utm_campaign, e.campanha_id, e.link_titulo, e.destino, ua.dispositivo, ua.navegador, ua.sistema, e.duracao_ms].map(q).join(";"); });
  return "﻿" + col.join(";") + "\n" + linhas.join("\n");
}
