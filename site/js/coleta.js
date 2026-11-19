/* Farejador (versão Apps Script + GitHub Pages) — página pública: renderização do guia de redes, rastreamento de
   visitas/cliques e coleta (consentida) de dados do navegador. */
(() => {
  "use strict";
  const $ = (id) => document.getElementById(id);
  const params = new URLSearchParams(location.search);
  const PREVIEW = params.has("preview");          // prévia do painel: não registra nada
  const CHAVE_CONSENT = "farejador_consentimento_v3";
  const CFG = window.FAREJADOR || {};
  const API = CFG.API_URL || "";
  // Página pedida: ?p=endereco  ·  Campanha (link curto): ?c=codigo
  let SLUG = /^[a-z0-9-]+$/.test(params.get("p") || "") ? params.get("p") : null;
  const CODIGO_CAMPANHA = /^[a-zA-Z0-9_-]{3,40}$/.test(params.get("c") || params.get("cmp") || "") ? (params.get("c") || params.get("cmp")) : null;
  let campanhaUtm = null;            // UTM vindos do link curto
  let origemSessao = {};             // canal/campanha devolvidos pelo pageview (usados nos cliques)
  const lerVid = () => { try { return localStorage.getItem("farejador_vid") || null; } catch (_) { return null; } };

  /** Chama o Apps Script. Corpo em text/plain para não haver "preflight" de CORS. */
  async function chamar(acao, dados) {
    const r = await fetch(API, { method: "POST", headers: { "Content-Type": "text/plain;charset=utf-8" }, body: JSON.stringify(Object.assign({ acao }, dados || {})), redirect: "follow" });
    const j = await r.json();
    if (j && j.erro) throw new Error(j.erro);
    return j;
  }

  let geolocalizacao = null;
  let configPermissoes = { ativo: false };
  let dadosIPPublico = null;
  let config = null;

  // ---------------------------------------------------------------- sessão
  function novaSessao() {
    const a = new Uint8Array(12); crypto.getRandomValues(a);
    return Array.from(a, (b) => b.toString(16).padStart(2, "0")).join("");
  }
  let sessao = null;
  try { sessao = sessionStorage.getItem("farejador_sessao"); } catch (_) {}
  if (!sessao) { sessao = novaSessao(); try { sessionStorage.setItem("farejador_sessao", sessao); } catch (_) {} }

  function lerConsent() { try { return localStorage.getItem(CHAVE_CONSENT); } catch (_) { return null; } }
  function gravarConsent(v) { try { localStorage.setItem(CHAVE_CONSENT, v); } catch (_) {} }

  function corpoEvento(tipo, dados, extra) {
    return JSON.stringify(Object.assign({ acao: "evento", tipo, sessao, slug: SLUG, visitante: lerVid(), ua: navigator.userAgent, host: location.hostname, dados: dados || {} }, extra || {}));
  }
  /** Eventos que não precisam de resposta vão por sendBeacon (sobrevive à troca de página). */
  function enviarEvento(tipo, dados, extra) {
    if (PREVIEW || !API) return;
    const corpo = corpoEvento(tipo, dados, extra);
    try {
      if (navigator.sendBeacon && navigator.sendBeacon(API, new Blob([corpo], { type: "text/plain;charset=utf-8" }))) return;
      fetch(API, { method: "POST", headers: { "Content-Type": "text/plain;charset=utf-8" }, body: corpo, keepalive: true }).catch(() => {});
    } catch (_) {}
  }

  // ---------------------------------------------------------------- coleta (lógica original preservada)
  async function detectarIPPublico() {
    // No localhost o servidor só enxerga 127.0.0.1/::1.
    // Consultamos cada família separadamente para registrar IPv4 e IPv6 se disponíveis.
    // A consulta de localização (IPinfo) foi movida para o painel administrativo.
    const resultado = { ipv4: null, ipv6: null, erros: {} };
    const consultas = [["ipv4", "https://api4.ipify.org?format=json"], ["ipv6", "https://api6.ipify.org?format=json"]];
    await Promise.all(consultas.map(async ([familia, url]) => {
      try {
        const ctrl = new AbortController(); const t = setTimeout(() => ctrl.abort(), 5000);
        const resposta = await fetch(url, { cache: "no-store", mode: "cors", signal: ctrl.signal });
        clearTimeout(t);
        if (!resposta.ok) throw new Error("HTTP " + resposta.status);
        const dados = await resposta.json();
        resultado[familia] = dados.ip || null;
      } catch (erro) { resultado.erros[familia] = String(erro.message || erro); }
    }));
    dadosIPPublico = resultado;
    return resultado;
  }

  function classificarDispositivo(clientHints) {
    const ua = navigator.userAgent || "";
    const mobileHint = clientHints && typeof clientHints.mobile === "boolean" ? clientHints.mobile : null;
    let tipo = "computador";
    if (/iPad|Tablet|PlayBook|Silk/i.test(ua)) tipo = "tablet";
    else if (mobileHint === true || /Android.*Mobile|iPhone|iPod|Windows Phone|Mobile/i.test(ua)) tipo = "celular";
    else if (/Android/i.test(ua)) tipo = "tablet";
    return {
      tipo, mobile: mobileHint,
      nome_dispositivo: (clientHints && clientHints.modelo) || null,
      fabricante_estimado: null,
      sistema_operacional: (clientHints && clientHints.plataforma) || navigator.platform || null,
      user_agent: ua
    };
  }

  function lerPermissao(nome) {
    if (!navigator.permissions || !navigator.permissions.query) return Promise.resolve("indisponivel");
    return navigator.permissions.query({ name: nome }).then((r) => r.state).catch(() => "nao_suportado");
  }

  function parametrosCampanha() {
    const campanha = {};
    ["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content"].forEach((c) => { campanha[c] = params.get(c); });
    return campanha;
  }

  async function dadosClientHints() {
    const ua = navigator.userAgentData;
    if (!ua) return null;
    const dados = { mobile: ua.mobile, plataforma: ua.platform || null, marcas: Array.isArray(ua.brands) ? ua.brands : [], modelo: null, versao_plataforma: null, arquitetura: null, bitness: null, full_version_list: [] };
    if (typeof ua.getHighEntropyValues === "function") {
      try {
        const high = await ua.getHighEntropyValues(["architecture", "bitness", "model", "platformVersion", "fullVersionList", "wow64"]);
        dados.modelo = high.model || null;
        dados.versao_plataforma = high.platformVersion || null;
        dados.arquitetura = high.architecture || null;
        dados.bitness = high.bitness || null;
        dados.full_version_list = high.fullVersionList || [];
        dados.wow64 = typeof high.wow64 === "boolean" ? high.wow64 : null;
      } catch (_) {}
    }
    return dados;
  }

  async function coletarDados() {
    const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
    const nomes = ["geolocation", "notifications", "camera", "microphone", "clipboard-read"];
    const estados = await Promise.all(nomes.map(lerPermissao));
    const permissoes = {};
    nomes.forEach((nome, i) => { permissoes[nome] = estados[i]; });

    const clientHints = await dadosClientHints();
    const ipPublico = dadosIPPublico || await detectarIPPublico();
    const marcas = clientHints && clientHints.full_version_list.length ? clientHints.full_version_list : (clientHints ? clientHints.marcas : []);
    const navegadorMarca = marcas.find((item) => !/(Not.?A.?Brand)/i.test(item.brand || ""));
    const prefers = window.matchMedia ? {
      esquema_cores: matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : (matchMedia("(prefers-color-scheme: light)").matches ? "light" : "no-preference"),
      movimento_reduzido: matchMedia("(prefers-reduced-motion: reduce)").matches,
      contraste_alto: matchMedia("(prefers-contrast: more)").matches,
      ponteiro: matchMedia("(pointer: coarse)").matches ? "coarse" : (matchMedia("(pointer: fine)").matches ? "fine" : "indisponivel"),
      hover: matchMedia("(hover: hover)").matches
    } : null;
    const teste = (s) => { try { const k = "__test"; s.setItem(k, "1"); s.removeItem(k); return true; } catch (_) { return false; } };

    return {
      consentimento: true,
      sessao,
      slug: SLUG,
      ip_publico_detectado_cliente: (ipPublico && (ipPublico.ipv4 || ipPublico.ipv6)) || null,
      ipinfo_publico_cliente: null,
      ips_publicos_cliente: ipPublico ? { ipv4: ipPublico.ipv4 || null, ipv6: ipPublico.ipv6 || null, erros: ipPublico.erros || {} } : null,
      coletado_em_cliente: new Date().toISOString(),
      navegador: {
        user_agent: navigator.userAgent || null,
        idioma: navigator.language || null,
        idiomas: Array.isArray(navigator.languages) ? navigator.languages : [],
        plataforma: (clientHints && clientHints.plataforma) || navigator.platform || null,
        dispositivo: classificarDispositivo(clientHints),
        client_hints: clientHints,
        navegador_estimado: navegadorMarca ? { nome: navegadorMarca.brand || null, versao: navegadorMarca.version || null } : null,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || null,
        timezone_offset_minutos: new Date().getTimezoneOffset(),
        cookies_habilitados: navigator.cookieEnabled,
        do_not_track: navigator.doNotTrack || null,
        pdf_viewer_habilitado: navigator.pdfViewerEnabled ?? null,
        idioma_documento: document.documentElement.lang || null
      },
      tela: {
        largura: screen.width || null, altura: screen.height || null,
        largura_disponivel: screen.availWidth || null, altura_disponivel: screen.availHeight || null,
        profundidade_cor: screen.colorDepth || null, pixel_ratio: window.devicePixelRatio || 1,
        viewport_largura: window.innerWidth || null, viewport_altura: window.innerHeight || null,
        orientacao: screen.orientation ? screen.orientation.type : null
      },
      capacidades: {
        toque_maximo: navigator.maxTouchPoints ?? null,
        touchscreen_detectado: ("ontouchstart" in window) || ((navigator.maxTouchPoints || 0) > 0),
        nucleos_logicos: navigator.hardwareConcurrency || null,
        memoria_gb_aproximada: navigator.deviceMemory || null,
        online: navigator.onLine,
        conexao: connection ? {
          tipo: connection.type || null, tipo_efetivo: connection.effectiveType || null,
          downlink_mbps_aproximado: connection.downlink ?? null, rtt_ms_aproximado: connection.rtt ?? null,
          economia_dados: connection.saveData ?? null
        } : null,
        armazenamento: { local_storage: teste(window.localStorage), session_storage: teste(window.sessionStorage), indexed_db: !!window.indexedDB },
        recursos: {
          webgl: (() => { try { const c = document.createElement("canvas"); return !!(c.getContext("webgl") || c.getContext("experimental-webgl")); } catch (_) { return false; } })(),
          webassembly: typeof WebAssembly === "object",
          service_worker: "serviceWorker" in navigator,
          bluetooth_api: "bluetooth" in navigator,
          usb_api: "usb" in navigator,
          pdf_embutido: navigator.pdfViewerEnabled ?? null
        },
        preferencias_acessibilidade: prefers,
        referer: document.referrer || null
      },
      permissoes,
      origem: { pagina: location.pathname, host: location.host, protocolo: location.protocol, referer: document.referrer || null, campanha: parametrosCampanha() },
      geolocalizacao
    };
  }

  async function enviarColeta() {
    if (PREVIEW) return;
    try {
      const dados = await coletarDados();
      dados.visitante = lerVid();
      const r = await chamar("coleta", dados);
      try { if (r.visitante_id) localStorage.setItem("farejador_vid", r.visitante_id); sessionStorage.setItem("farejador_coletado", "1"); } catch (_) {}
    } catch (_) {}
  }

  function pedirLocalizacao() {
    if (!navigator.geolocation) { toast("Este navegador não oferece localização."); return; }
    navigator.geolocation.getCurrentPosition(async (pos) => {
      geolocalizacao = {
        latitude: pos.coords.latitude, longitude: pos.coords.longitude, precisao_metros: pos.coords.accuracy,
        coletado_em: new Date(pos.timestamp).toISOString(), origem: "permissao_geolocation_apos_clique"
      };
      enviarEvento("localizacao", { resultado: "autorizada" });
      await enviarColeta();
      toast("Localização compartilhada. Obrigado!");
    }, (erro) => {
      enviarEvento("localizacao", { resultado: ({ 1: "negada", 2: "indisponivel", 3: "tempo_esgotado" })[erro.code] || "erro" });
      toast("Localização não compartilhada.");
    }, { enableHighAccuracy: true, timeout: 12000, maximumAge: 60000 });
  }

  // ---------------------------------------------------------------- interface
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]); }
  function toast(msg) { const t = $("toast"); t.textContent = msg; t.classList.add("on"); clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.remove("on"), 2600); }

  function luminancia(hex) {
    const m = /^#?([0-9a-f]{6})$/i.exec(hex || ""); if (!m) return 1;
    const n = parseInt(m[1], 16), c = [n >> 16, (n >> 8) & 255, n & 255].map((v) => { v /= 255; return v <= .03928 ? v / 12.92 : Math.pow((v + .055) / 1.055, 2.4); });
    return .2126 * c[0] + .7152 * c[1] + .0722 * c[2];
  }
  function corDoLink(l) {
    const i = window.FAREJADOR_ICONES[l.tipo];
    const cor = l.cor || (i ? i.cor : "#7c5cff");
    // Logos pretos (TikTok, X, Threads…) ficam brancos sobre fundo escuro, e vice-versa.
    const b = document.body.dataset;
    const botaoCheio = b.estilo === "solido" || b.estilo === "sombra";
    const fundoBotao = botaoCheio ? (config && config.tema && config.tema.cor_botao) || "#ffffff" : null;
    const escuro = fundoBotao ? luminancia(fundoBotao) < .2 : (b.tema !== "claro" && b.texto !== "escuro");
    if (escuro && luminancia(cor) < .03) return "#ffffff";
    if (!escuro && luminancia(cor) > .85) return "#111111";
    return cor;
  }
  function iconeHTML(l, cor) {
    if (l.icone_custom) return '<img src="' + esc(l.icone_custom) + '" alt="" loading="lazy">';
    return window.farejadorSvgIcone(l.tipo, cor);
  }
  // O link aponta direto para o destino; o clique é registrado em segundo plano (ver "cliques" abaixo).
  function hrefDo(l, pos, area) {
    return esc(l.url || "#") + '" data-pos="' + pos + '" data-area="' + area;
  }

  // ---------------------------------------------------------------- personalização
  const fontesCarregadas = new Set(["Plus Jakarta Sans"]);
  function carregarFonte(nome) {
    if (!nome || fontesCarregadas.has(nome)) return;
    fontesCarregadas.add(nome);
    const l = document.createElement("link"); l.rel = "stylesheet";
    l.href = "https://fonts.googleapis.com/css2?family=" + encodeURIComponent(nome).replace(/%20/g, "+") + ":wght@400;500;600;700;800&display=swap";
    document.head.appendChild(l);
  }
  function aplicarTema(t) {
    const b = document.body, raiz = document.documentElement.style;
    const fundo = t.fundo_tipo || "preset";
    b.dataset.tema = fundo === "preset" ? (t.preset || "aurora") : "personalizado";
    b.dataset.fundo = fundo;
    b.dataset.texto = fundo === "preset" ? "" : (t.texto || "claro");
    b.dataset.formato = t.formato_botao || "arredondado";
    b.dataset.estilo = t.estilo_botao || "vidro";
    b.dataset.anim = t.animacao_botao || "subir";
    b.dataset.avatar = t.forma_avatar || "circulo";
    b.dataset.anel = t.anel_avatar === false ? "nao" : "sim";
    b.dataset.blobs = t.fundo_animado === false ? "nao" : "sim";
    raiz.setProperty("--destaque", t.cor_destaque || "#7c5cff");
    raiz.setProperty("--cor-botao", t.cor_botao || "#ffffff");
    raiz.setProperty("--cor-texto-botao", t.cor_texto_botao || "#111111");
    carregarFonte(t.fonte); carregarFonte(t.fonte_titulo);
    raiz.setProperty("--fonte", '"' + (t.fonte || "Plus Jakarta Sans") + '"');
    raiz.setProperty("--fonte-titulo", t.fonte_titulo ? '"' + t.fonte_titulo + '"' : "inherit");
    const f = $("fundo"), img = $("fundo-img");
    let cssFundo = "none", corBase = "";
    if (fundo === "cor") { cssFundo = t.fundo_cor1; corBase = t.fundo_cor1; }
    else if (fundo === "gradiente") { cssFundo = "linear-gradient(" + (t.fundo_angulo || 160) + "deg, " + t.fundo_cor1 + ", " + t.fundo_cor2 + ")"; corBase = t.fundo_cor1; }
    else if (fundo === "imagem") { corBase = t.fundo_cor1 || "#000"; }
    f.style.setProperty("--fundo-custom", cssFundo);
    raiz.setProperty("--fundo", corBase || "");
    if (!corBase) raiz.removeProperty("--fundo");
    img.style.backgroundImage = fundo === "imagem" && t.fundo_imagem ? "url('" + String(t.fundo_imagem).replace(/'/g, "%27") + "')" : "";
    img.style.setProperty("--escurecer", String((t.fundo_escurecer ?? 40) / 100));
    $("compartilhar").hidden = t.mostrar_compartilhar === false;
    const meta = document.querySelector('meta[name="theme-color"]'); if (meta) meta.content = corBase || getComputedStyle(b).backgroundColor;
  }

  function renderizar(cfg) {
    config = cfg;
    const p = cfg.perfil || {}, t = cfg.textos || {}, tema = cfg.tema || {};
    document.title = t.titulo_pagina || p.nome || "Links";
    const meta = document.querySelector('meta[name="description"]'); if (meta && t.descricao_pagina) meta.content = t.descricao_pagina;
    aplicarTema(tema);

    const av = $("avatar");
    if (p.avatar) { av.style.backgroundImage = "url('" + String(p.avatar).replace(/'/g, "%27") + "')"; av.textContent = ""; }
    else { av.style.backgroundImage = ""; av.textContent = (p.nome || "?").trim().charAt(0).toUpperCase(); }
    $("nome-txt").textContent = p.nome || "";
    $("selo").style.display = p.verificado ? "" : "none";
    $("usuario").textContent = p.usuario || "";
    $("usuario").hidden = !p.usuario;
    $("bio").textContent = p.bio || "";
    $("rodape").textContent = t.rodape || "";
    $("titulo-links").textContent = t.secao_links || "";
    $("titulo-redes").textContent = t.secao_redes || "Redes sociais";
    $("txt-compartilhar").textContent = t.botao_compartilhar || "Compartilhar";
    $("aviso-titulo").textContent = t.aviso_titulo || "";
    $("aviso-texto").textContent = t.aviso_texto || "";
    $("aceitar").textContent = t.botao_aceitar || "Aceitar";
    $("recusar").textContent = t.botao_recusar || "Recusar";
    $("txt-localizacao").textContent = t.botao_localizacao || "Compartilhar localização";

    const links = cfg.links || [];
    // Cada link aparece UMA vez: como ícone pequeno ou como botão.
    const icones = links.filter((l) => l.exibicao === "icone");
    const botoes = links.filter((l) => l.exibicao !== "icone");
    const colorido = tema.icones_coloridos !== false;

    $("icones").innerHTML = icones.map((l, i) => {
      const cor = corDoLink(l);
      return '<li><a href="' + hrefDo(l, i + 1, "icone") + '" style="--c:' + esc(cor) + '" aria-label="' + esc(l.titulo) + '" title="' + esc(l.titulo) + '" rel="noopener" data-id="' + esc(l.id) + '">' + iconeHTML(l, colorido ? cor : null) + "</a></li>";
    }).join("");
    $("icones").parentElement.hidden = !icones.length;

    const seta = '<svg class="seta" viewBox="0 0 24 24" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" d="m9 6 6 6-6 6"/></svg>';
    $("lista").innerHTML = botoes.length ? botoes.map((l, i) => {
      const cor = corDoLink(l);
      const img = l.icone_custom ? '<img class="cheia" src="' + esc(l.icone_custom) + '" alt="" loading="lazy">' : window.farejadorSvgIcone(l.tipo, cor);
      return '<li style="animation-delay:' + (80 + i * 60) + 'ms"><a class="link' + (l.destaque ? " destaque" : "") + '" style="--c:' + esc(cor) + '" href="' + hrefDo(l, i + 1, "botao") + '" rel="noopener" data-id="' + esc(l.id) + '">' +
        '<span class="ico">' + img + '</span><span class="txt"><span class="tit">' + esc(l.titulo) + "</span>" +
        (l.subtitulo ? '<span class="sub">' + esc(l.subtitulo) + "</span>" : "") + "</span>" + seta + "</a></li>";
    }).join("") : '<li class="vazio">Nenhum link publicado ainda.<br><small>Adicione suas redes no painel administrativo.</small></li>';
    $("titulo-links").hidden = !botoes.length || !t.secao_links;

    $("localizacao").hidden = !(cfg.coleta && cfg.coleta.pedir_localizacao);
    $("pagina").classList.add("pronta");
  }

  // ---------------------------------------------------------------- consentimento
  function mostrarAviso() { $("aviso").hidden = false; }
  function esconderAviso() { $("aviso").hidden = true; }

  function configurarConsentimento() {
    if (PREVIEW) { if (config.coleta && config.coleta.mostrar_aviso) mostrarAviso(); return; }
    const escolha = lerConsent();
    if (escolha === "aceito") {
      let ja = null; try { ja = sessionStorage.getItem("farejador_coletado"); } catch (_) {}
      if (!ja) enviarColeta();
    } else if (!escolha && config.coleta && config.coleta.mostrar_aviso !== false) {
      setTimeout(mostrarAviso, 700);
    }
  }

  $("aceitar").addEventListener("click", async () => {
    esconderAviso();
    if (PREVIEW) return;
    gravarConsent("aceito");
    enviarEvento("consentimento", { escolha: "aceito" });
    await enviarColeta();
  });
  $("recusar").addEventListener("click", () => {
    esconderAviso();
    if (PREVIEW) return;
    gravarConsent("recusado");
    enviarEvento("consentimento", { escolha: "recusado" });
  });
  $("localizacao").addEventListener("click", async () => {
    esconderAviso();
    if (PREVIEW) return;
    if (lerConsent() !== "aceito") { gravarConsent("aceito"); enviarEvento("consentimento", { escolha: "aceito" }); }
    pedirLocalizacao();
  });

  $("compartilhar").addEventListener("click", async () => {
    const url = location.origin + location.pathname + (config && !config.principal && SLUG ? "?p=" + SLUG : "");
    const titulo = (config && config.textos && config.textos.titulo_pagina) || document.title;
    let via = "copiar";
    try {
      if (navigator.share) { await navigator.share({ title: titulo, url }); via = "nativo"; }
      else { await navigator.clipboard.writeText(url); toast("Link copiado!"); }
      enviarEvento("compartilhar", { via });
    } catch (_) {}
  });

  // ---------------------------------------------------------------- tempo na página e rolagem
  const inicio = performance.now();
  let scrollMax = 0;
  function medirScroll() {
    const h = document.documentElement.scrollHeight - innerHeight;
    const pct = h > 0 ? Math.round(100 * scrollY / h) : 100;
    if (pct > scrollMax) scrollMax = Math.min(100, pct);
  }
  addEventListener("scroll", medirScroll, { passive: true });
  function registrarSaida() { medirScroll(); enviarEvento("saida", { duracao_ms: Math.round(performance.now() - inicio), scroll_max: scrollMax }); }
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "hidden") registrarSaida(); });

  // ---------------------------------------------------------------- cliques (clique normal, do meio e "abrir em nova aba")
  function registrarClique(e) {
    const a = e.target.closest("a[data-id]"); if (!a || PREVIEW) { if (a && PREVIEW) e.preventDefault(); return; }
    if (e.type === "auxclick" && e.button !== 1) return;
    enviarEvento("clique", { posicao: +a.dataset.pos || null, area: a.dataset.area || null },
      { link_id: a.dataset.id, canal: origemSessao.canal, campanha_id: origemSessao.campanha_id, origem: origemSessao.origem, utm: origemSessao.utm });
  }
  document.addEventListener("click", registrarClique);
  document.addEventListener("auxclick", registrarClique);

  // ---------------------------------------------------------------- prévia ao vivo (painel)
  if (PREVIEW) {
    document.body.classList.add("previa");
    addEventListener("message", (e) => {
      if (e.origin !== location.origin || !e.data || e.data.tipo !== "farejador-preview") return;
      const c = e.data.config;
      if (e.data.slug) SLUG = e.data.slug;
      c.links = (c.links || []).filter((l) => l.ativo && l.url);
      renderizar(c);
      if (c.coleta && c.coleta.mostrar_aviso && e.data.mostrarAviso) mostrarAviso(); else esconderAviso();
    });
  }

  // ---------------------------------------------------------------- início
  async function carregarConfigPermissoes() {
    configPermissoes = { ativo: false }; // na versão estática as permissões nunca são pedidas automaticamente
  }

  if (!API || /COLE_AQUI/.test(API)) {
    $("lista").innerHTML = '<li class="vazio">Configure o endereço do Apps Script no arquivo <b>config.js</b>.</li>';
    $("pagina").classList.add("pronta");
    return;
  }
  chamar("publico_config", { slug: SLUG, campanha: CODIGO_CAMPANHA }).then(async (cfg) => {
    if (cfg.slug) SLUG = cfg.slug;
    campanhaUtm = cfg.campanha || null;
    renderizar(cfg);
    configurarConsentimento();
    if (PREVIEW) { if (window.parent !== window) window.parent.postMessage({ tipo: "farejador-preview-pronto" }, location.origin); return; }
    const utm = parametrosCampanha();
    if (campanhaUtm) ["utm_source", "utm_medium", "utm_campaign", "utm_content"].forEach((k) => { if (campanhaUtm[k]) utm[k] = campanhaUtm[k]; });
    try {
      origemSessao = await chamar("evento", JSON.parse(corpoEvento("pageview", {
        idioma: navigator.language, timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        tela: screen.width + "x" + screen.height, webdriver: navigator.webdriver === true
      }, { referer: document.referrer || null, utm, campanha: campanhaUtm ? campanhaUtm.codigo : CODIGO_CAMPANHA })));
    } catch (_) {}
  }).catch((e) => {
    $("lista").innerHTML = '<li class="vazio">Não foi possível carregar os links.<br><small>' + esc(e.message) + "</small></li>";
    $("pagina").classList.add("pronta");
  });
  carregarConfigPermissoes();
})();
