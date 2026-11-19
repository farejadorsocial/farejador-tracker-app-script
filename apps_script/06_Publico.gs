/**
 * 06_Publico.gs — ações chamadas pela página pública (sem login).
 */
var RE_SESSAO_ = /^[a-zA-Z0-9_-]{8,64}$/;
var RE_VISITANTE_ = /^[a-f0-9]{32}$/;
var TIPOS_EVENTO_ = ['pageview', 'saida', 'consentimento', 'compartilhar', 'localizacao', 'clique'];

function campanhaPorCodigo_(codigo, paginaId) {
  if (!codigo || !/^[a-zA-Z0-9_-]{3,40}$/.test(codigo)) return null;
  var c = buscar_('campanhas', 'codigo', codigo);
  if (!c || (paginaId && String(c.pagina_id) !== String(paginaId))) return null;
  return c;
}

/** Config pública. Aceita {slug} ou {campanha} (link curto ?c=código). */
function acaoPublicoConfig_(req) {
  var campanha = null, pagina = null;
  if (req.campanha) {
    var c = campanhaPorCodigo_(req.campanha);
    if (c) {
      pagina = obterPagina_(c.pagina_id);
      if (c.ativo === '1') campanha = { codigo: c.codigo, utm_source: c.utm_source, utm_medium: c.utm_medium, utm_campaign: c.utm_campaign, utm_content: c.utm_content };
    }
  }
  if (!pagina) pagina = req.slug ? obterPagina_(null, req.slug) : obterPagina_();
  if (!pagina) pagina = obterPagina_();
  if (!pagina) throw erro_('Nenhuma página criada ainda. Entre no painel para criar.', 404);
  var r = configPublica_(pagina);
  r.campanha = campanha;
  return r;
}

function acaoEvento_(req) {
  if (TIPOS_EVENTO_.indexOf(req.tipo) < 0 || !RE_SESSAO_.test(req.sessao || '')) throw erro_('Evento inválido.', 400);
  var pagina = req.slug ? obterPagina_(null, req.slug) : obterPagina_();
  if (!pagina) throw erro_('Página não encontrada.', 404);
  var ua = String(req.ua || '').slice(0, 400);
  var dados = req.dados || {};
  var roboNome = detectarRobo_(ua) || (dados.webdriver ? 'Navegador automatizado' : null);
  var ev = { tipo: req.tipo, pagina_id: pagina.id, sessao: req.sessao, robo: !!roboNome,
             visitante: RE_VISITANTE_.test(req.visitante || '') ? req.visitante : '' };
  if (roboNome) ev.robo_nome = roboNome;
  var resposta = { ok: true };

  if (req.tipo === 'pageview') {
    var utm = {};
    ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content'].forEach(function (k) {
      var v = (req.utm || {})[k]; utm[k] = v ? String(v).slice(0, 120) : null;
    });
    var origem = classificarOrigem_(req.referer, utm.utm_source, req.host, ua);
    var cmp = campanhaPorCodigo_(req.campanha, pagina.id);
    if (!cmp && utm.utm_campaign) {
      cmp = ler_('campanhas').filter(function (c) {
        return String(c.pagina_id) === String(pagina.id) && c.utm_campaign === utm.utm_campaign && (!utm.utm_source || c.utm_source === utm.utm_source);
      }).pop() || null;
    }
    ev.canal = origem.canal; ev.campanha_id = cmp ? cmp.id : '';
    ev.referer = req.referer ? String(req.referer).slice(0, 500) : null;
    ev.utm = utm; ev.origem = origem; ev.ua_info = analisarUa_(ua);
    ev.idioma = String(dados.idioma || '').slice(0, 20) || null;
    ev.timezone = String(dados.timezone || '').slice(0, 60) || null;
    ev.tela = String(dados.tela || '').slice(0, 20) || null;
    resposta.canal = origem.canal; resposta.campanha_id = ev.campanha_id || null; resposta.origem = origem; resposta.utm = utm;
  } else if (req.tipo === 'clique') {
    var link = pagina.config.links.filter(function (l) { return l.id === req.link_id; })[0];
    if (!link) throw erro_('Link inválido.', 400);
    ev.link_id = link.id; ev.link_titulo = link.titulo; ev.link_tipo = link.tipo; ev.destino = link.url;
    ev.destino_host = hostDe_(link.url); ev.posicao = Number(dados.posicao) || null;
    ev.area = ['icone', 'botao'].indexOf(dados.area) >= 0 ? dados.area : null;
    ev.canal = String(req.canal || '').slice(0, 60) || 'Direto';
    ev.campanha_id = req.campanha_id ? String(Number(req.campanha_id) || '') : '';
    ev.origem = req.origem || { canal: ev.canal }; ev.utm = req.utm || {}; ev.ua_info = analisarUa_(ua);
  } else if (req.tipo === 'saida') {
    ev.duracao_ms = Math.max(0, Math.min(Number(dados.duracao_ms) || 0, 6 * 3600 * 1000));
    ev.scroll_max = Math.max(0, Math.min(Number(dados.scroll_max) || 0, 100));
  } else {
    var d = {};
    Object.keys(dados).slice(0, 8).forEach(function (k) { d[k] = String(dados[k]).slice(0, 120); });
    ev.dados = d;
  }
  gravarEvento_(ev);
  return resposta;
}

function ipValido_(ip) {
  ip = String(ip || '');
  if (/^(\d{1,3}\.){3}\d{1,3}$/.test(ip)) {
    var p = ip.split('.').map(Number);
    if (p.some(function (x) { return x > 255; })) return false;
    return !(p[0] === 10 || p[0] === 127 || (p[0] === 192 && p[1] === 168) || (p[0] === 172 && p[1] >= 16 && p[1] <= 31) || (p[0] === 169 && p[1] === 254) || p[0] === 0);
  }
  return /^[0-9a-f:]{3,45}$/i.test(ip) && ip.indexOf(':') >= 0 && !/^(::1|fe80|f[cd])/i.test(ip);
}

/** Coleta completa (só depois do "Aceitar"). O IP vem do navegador (ipify), pois o Apps Script não informa o IP. */
function acaoColeta_(req) {
  if (!req.consentimento) throw erro_('É necessário consentir com a coleta.', 400);
  var vid = RE_VISITANTE_.test(req.visitante || '') ? req.visitante : Utilities.getUuid().replace(/-/g, '');
  var ips = req.ips_publicos_cliente || {};
  var ip = [ips.ipv4, ips.ipv6, req.ip_publico_detectado_cliente].filter(ipValido_)[0] || null;
  var tipoIp = ip ? (ip.indexOf(':') >= 0 ? 'IPv6' : 'IPv4') : null;
  var nav = req.navegador || {};
  var conexao = {
    ip_observado: ip, tipo_ip: tipoIp, origem_ip: ip ? 'ip_publico_detectado_pelo_navegador' : null,
    ips_publicos_detectados: ips, ip_conexao_servidor: null,
    cabecalhos_http: { user_agent: nav.user_agent || null, accept_language: (nav.idiomas || []).join(','), referer: (req.origem || {}).referer || null,
                       observacao: 'O Apps Script não recebe os cabeçalhos HTTP; valores informados pelo navegador.' }
  };
  var dadosNav = {};
  ['consentimento', 'sessao', 'slug', 'coletado_em_cliente', 'navegador', 'tela', 'capacidades', 'permissoes', 'origem', 'geolocalizacao',
   'ip_publico_detectado_cliente', 'ips_publicos_cliente'].forEach(function (k) { dadosNav[k] = req[k] === undefined ? null : req[k]; });

  return comTrava_(function () {
    var linha = buscar_('visitantes', 'id', vid);
    var anterior = linha ? json_(linha.registro) : {};
    var hist = (anterior.historico_acessos || []).filter(function (x) { return x && typeof x === 'object'; });
    hist.push({ registrado_em: agoraIso_(), sessao: req.sessao, pagina: req.slug, conexao_servidor: conexao, dados_navegador: dadosNav });
    var reg = {
      schema_versao: 4, visitante_id: vid, criado_em: anterior.criado_em || agoraIso_(), atualizado_em: agoraIso_(),
      quantidade_coletas: Number(anterior.quantidade_coletas || 0) + 1,
      consentimento: { aceito: true, registrado_em: agoraIso_(), texto_versao: 'coleta-guia-gas-v1' },
      conexao_servidor: conexao, dados_navegador: dadosNav, historico_acessos: hist.slice(-20)
    };
    var texto = JSON.stringify(reg);
    while (texto.length > LIMITE_CELULA && reg.historico_acessos.length > 1) { // limite de 50 mil caracteres por célula
      reg.historico_acessos.shift(); texto = JSON.stringify(reg);
    }
    var obj = { id: vid, criado_em: reg.criado_em, atualizado_em: reg.atualizado_em, epoch: String(Date.now() / 1000),
                coletas: String(reg.quantidade_coletas), ip: ip || '', registro: texto.slice(0, LIMITE_CELULA), ipinfo: linha ? linha.ipinfo : '{}' };
    if (linha) { obj._linha = linha._linha; atualizar_('visitantes', obj); } else inserir_('visitantes', obj);
    if (req.sessao && RE_SESSAO_.test(req.sessao)) {
      var existe = ler_('visitante_sessoes').some(function (x) { return x.visitante === vid && x.sessao === req.sessao; });
      if (!existe) inserir_('visitante_sessoes', { visitante: vid, sessao: req.sessao });
    }
    var pagina = req.slug ? obterPagina_(null, req.slug) : obterPagina_();
    if (pagina && req.sessao) {
      inserir_('eventos', { id: String(Date.now()) + Math.floor(Math.random() * 1000), ts: agoraIso_(), epoch: String(Date.now() / 1000), tipo: 'coleta',
        pagina_id: pagina.id, sessao: req.sessao, visitante: vid, robo: '0', canal: '', link_id: '', campanha_id: '',
        dados: JSON.stringify({ geolocalizacao: !!req.geolocalizacao }) });
    }
    return { ok: true, visitante_id: vid, quantidade_coletas: reg.quantidade_coletas };
  });
}
