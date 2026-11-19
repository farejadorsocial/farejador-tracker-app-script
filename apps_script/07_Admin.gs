/**
 * 07_Admin.gs — ações do painel administrativo (todas exigem login, exceto estado/login/primeiro acesso).
 * As estatísticas são calculadas no navegador: aqui só entregamos os eventos brutos do período.
 */

// ------------------------------------------------------------------ login e usuários
function acaoEstado_(req) {
  var s = req.token ? sessaoAtual_(req.token) : null;
  return { tem_usuarios: temUsuarios_(), logado: !!s, usuario: s ? s.usuario : null, versao: VERSAO };
}

function acaoPrimeiroAcesso_(req) {
  if (temUsuarios_()) throw erro_('O primeiro usuário já foi criado.', 400);
  validarSenhaNova_(req.senha);
  criarUsuario_(req.usuario, req.senha);
  var u = autenticar_(req.usuario, req.senha);
  if (!obterPagina_()) criarPagina_('Página principal', 'principal', null, true);
  return abrirSessao_(u.id, req.lembrar, req.ua);
}

function acaoLogin_(req) {
  var u = autenticar_(req.usuario, req.senha);
  var r = abrirSessao_(u.id, req.lembrar, req.ua);
  r.usuario = u.usuario;
  return r;
}

function acaoLogout_(req) {
  if (!req.token) return { ok: true };
  var th = hashToken_(req.token);
  comTrava_(function () { excluirOnde_('sessoes_admin', function (s) { return s.token_hash === th; }); });
  limparCacheSessoes_([th]);
  return { ok: true };
}

function acaoSessoes_(req, s) {
  var agora = Date.now() / 1000;
  return { sessoes: ler_('sessoes_admin').filter(function (x) { return String(x.usuario_id) === String(s.usuario_id) && Number(x.expira) > agora; })
    .map(function (x) { return { id: x.token_hash.slice(0, 16), criado_em: x.criado_em, ultimo_uso: x.ultimo_uso, ip: '—', ua: x.ua, atual: x.token_hash === s.token_hash }; }) };
}

function acaoEncerrarOutras_(req, s) {
  var removidos = [];
  comTrava_(function () {
    excluirOnde_('sessoes_admin', function (x) {
      var sai = String(x.usuario_id) === String(s.usuario_id) && x.token_hash !== s.token_hash;
      if (sai) removidos.push(x.token_hash);
      return sai;
    });
  });
  limparCacheSessoes_(removidos);
  return { encerradas: removidos.length };
}

function acaoEncerrarSessao_(req, s) {
  var removidos = [];
  comTrava_(function () {
    excluirOnde_('sessoes_admin', function (x) {
      var sai = String(x.usuario_id) === String(s.usuario_id) && x.token_hash.slice(0, 16) === String(req.id).slice(0, 16);
      if (sai) removidos.push(x.token_hash);
      return sai;
    });
  });
  limparCacheSessoes_(removidos);
  return { ok: true };
}

function acaoTrocarSenha_(req, s) {
  autenticar_(s.usuario, req.senha_atual);
  validarSenhaNova_(req.nova_senha);
  definirSenha_(s.usuario_id, req.nova_senha);
  acaoEncerrarOutras_(req, s);
  return { ok: true };
}

function acaoUsuarios_(req, s) {
  return { usuarios: ler_('usuarios').map(function (u) {
    return { id: Number(u.id), usuario: u.usuario, criado_em: u.criado_em, ultimo_login: u.ultimo_login || null, voce: Number(u.id) === s.usuario_id };
  }) };
}

function acaoCriarUsuario_(req) { validarSenhaNova_(req.senha); criarUsuario_(req.usuario, req.senha); return { ok: true }; }

function acaoExcluirUsuario_(req, s) {
  if (Number(req.id) === s.usuario_id) throw erro_('Você não pode excluir o próprio usuário.', 400);
  if (ler_('usuarios').length <= 1) throw erro_('Mantenha pelo menos um usuário.', 400);
  comTrava_(function () {
    excluirOnde_('sessoes_admin', function (x) { return String(x.usuario_id) === String(req.id); });
    excluirOnde_('usuarios', function (x) { return String(x.id) === String(req.id); });
  });
  return { ok: true };
}

// ------------------------------------------------------------------ páginas
function contarVisitas_() {
  var sh = aba_('eventos'), n = sh.getLastRow() - 1, cont = {};
  if (n < 1) return cont;
  var v = sh.getRange(2, 4, n, 5).getValues(); // tipo, pagina_id, sessao, visitante, robo
  for (var i = 0; i < v.length; i++) if (v[i][0] === 'pageview' && String(v[i][4]) !== '1') cont[v[i][1]] = (cont[v[i][1]] || 0) + 1;
  return cont;
}

function acaoPaginas_() {
  var cont = contarVisitas_();
  return { paginas: listarPaginas_().map(function (p) {
    return { id: p.id, slug: p.slug, nome: p.nome, principal: p.principal, atualizado_em: p.atualizado_em, links: p.config.links.length,
             visitas: cont[String(p.id)] || 0, avatar: p.config.perfil.avatar, preset: p.config.tema.preset };
  }) };
}

function paginaOu404_(id) { var p = obterPagina_(id); if (!p) throw erro_('Página não encontrada.', 404); return p; }

function acaoCriarPagina_(req) {
  var nome = String(req.nome || 'Nova página').trim();
  var cfg = req.copiar_de ? paginaOu404_(req.copiar_de).config : null;
  return criarPagina_(nome, req.slug || nome, cfg, !!req.principal);
}

function acaoAtualizarPagina_(req) {
  return comTrava_(function () {
    var p = paginaOu404_(req.id);
    if (req.slug !== undefined && req.slug !== null) {
      var slug = validarSlug_(req.slug);
      if (listarPaginas_().some(function (x) { return x.slug === slug && x.id !== p.id; })) throw erro_('Já existe uma página com esse endereço.', 400);
      p.slug = slug;
    }
    if (req.nome) p.nome = texto_(req.nome, 80);
    if (req.principal) {
      listarPaginas_().forEach(function (x) { if (x.principal && x.id !== p.id) { x.principal = false; salvarPaginaLinha_(x); } });
      p.principal = true;
    }
    salvarPaginaLinha_(p);
    return obterPagina_(p.id);
  });
}

function reescrever_(nome, objs) {
  var sh = aba_(nome), cab = TABELAS[nome], n = sh.getLastRow() - 1;
  if (n > 0) sh.getRange(2, 1, n, cab.length).clearContent();
  if (objs.length) sh.getRange(2, 1, objs.length, cab.length).setNumberFormat('@').setValues(objs.map(function (o) { return linhaDe_(nome, o); }));
}

function acaoExcluirPagina_(req) {
  if (ler_('paginas').length <= 1) throw erro_('Mantenha pelo menos uma página.', 400);
  return comTrava_(function () {
    var p = paginaOu404_(req.id), pid = String(p.id);
    reescrever_('eventos', ler_('eventos').filter(function (e) { return e.pagina_id !== pid; }));
    excluirOnde_('campanhas', function (c) { return c.pagina_id === pid; });
    aba_('paginas').deleteRow(p._linha);
    if (p.principal) { var outra = listarPaginas_()[0]; if (outra) { outra.principal = true; salvarPaginaLinha_(outra); } }
    return { ok: true };
  });
}

function acaoPaginaConfig_(req) { var p = paginaOu404_(req.id); delete p._linha; return p; }

function acaoSalvarPagina_(req) {
  return comTrava_(function () {
    var p = paginaOu404_(req.id);
    p.config = normalizarConfig_(req.config);
    if (JSON.stringify(p.config).length > LIMITE_CELULA) throw erro_('Configuração grande demais (muitos links ou textos longos).', 400);
    salvarPaginaLinha_(p);
    var r = obterPagina_(p.id); delete r._linha; return r;
  });
}

function acaoOpcoes_() { return { fontes: FONTES, presets: PRESETS }; }

/** Upload de imagem para uma pasta do Google Drive (link público de visualização). */
function acaoUpload_(req) {
  var m = /^data:image\/(png|jpe?g|webp|gif);base64,(.+)$/.exec(req.data_url || '');
  if (!m) throw erro_('Envie uma imagem PNG, JPG, WEBP ou GIF.', 400);
  var bytes = Utilities.base64Decode(m[2]);
  if (bytes.length > 5 * 1024 * 1024) throw erro_('Imagem acima de 5 MB.', 400);
  var tipo = 'image/' + (m[1] === 'jpg' ? 'jpeg' : m[1]);
  var pastaId = PropertiesService.getScriptProperties().getProperty('PASTA_UPLOADS_ID'), pasta;
  try { pasta = pastaId ? DriveApp.getFolderById(pastaId) : null; } catch (e) { pasta = null; }
  if (!pasta) {
    pasta = DriveApp.createFolder('Farejador — imagens');
    PropertiesService.getScriptProperties().setProperty('PASTA_UPLOADS_ID', pasta.getId());
  }
  var nome = String(req.nome || 'img').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 20) + '-' + Utilities.getUuid().slice(0, 8);
  var arq = pasta.createFile(Utilities.newBlob(bytes, tipo, nome));
  arq.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  return { ok: true, url: 'https://lh3.googleusercontent.com/d/' + arq.getId() };
}

// ------------------------------------------------------------------ dados para as estatísticas
function mapaSessaoVisitante_(sessoesFiltro) {
  var m = {};
  ler_('visitante_sessoes').forEach(function (x) { if (!sessoesFiltro || sessoesFiltro[x.sessao]) m[x.sessao] = x.visitante; });
  return m;
}

/** Eventos brutos [ini, fim] da página (inclui robôs; o painel filtra). */
function acaoEventosPeriodo_(req) {
  var pid = paginaOu404_(req.pagina).id;
  var evs = eventosEntre_(pid, Number(req.ini), Number(req.fim));
  var sess = {};
  evs.forEach(function (e) { if (e.sessao) sess[e.sessao] = true; });
  var mapa = mapaSessaoVisitante_(sess);
  evs.forEach(function (e) { if (e.sessao && !e.visitante && mapa[e.sessao]) e.visitante = mapa[e.sessao]; e.ua = undefined; });
  return { eventos: evs };
}

/** Para o retorno de visitantes: início e canal de cada sessão (até `fim`) + quem é o visitante. */
function acaoRetornoBase_(req) {
  var pid = String(paginaOu404_(req.pagina).id), fim = Number(req.fim);
  var sh = aba_('eventos'), n = sh.getLastRow() - 1, sess = {};
  if (n > 0) {
    var v = sh.getRange(2, 3, n, 7).getValues(); // epoch, tipo, pagina_id, sessao, visitante, robo, canal
    for (var i = 0; i < v.length; i++) {
      var ep = Number(v[i][0]);
      if (ep > fim) break;
      if (v[i][1] !== 'pageview' || String(v[i][2]) !== pid || String(v[i][5]) === '1' || !v[i][3]) continue;
      var s = String(v[i][3]);
      if (!sess[s]) sess[s] = [s, ep, String(v[i][6] || 'Direto'), String(v[i][4] || '')];
    }
  }
  var mapa = mapaSessaoVisitante_();
  var lista = Object.keys(sess).map(function (k) { var x = sess[k]; if (!x[3] && mapa[k]) x[3] = mapa[k]; return x; });
  return { sessoes: lista };
}

function acaoEventosRecentes_(req) {
  var pid = String(paginaOu404_(req.pagina).id), limite = Math.max(1, Math.min(Number(req.limite) || 150, 500));
  var sh = aba_('eventos'), n = sh.getLastRow() - 1, saida = [];
  if (n < 1) return { eventos: [] };
  var ler = Math.min(n, 4000), cab = TABELAS.eventos;
  var v = sh.getRange(2 + n - ler, 1, ler, cab.length).getValues();
  for (var i = v.length - 1; i >= 0 && saida.length < limite; i--) {
    if (String(v[i][4]) !== pid) continue;
    var o = {}; for (var j = 0; j < cab.length; j++) o[cab[j]] = String(v[i][j]);
    if (req.tipo === 'robo') { if (o.robo !== '1') continue; }
    else { if (req.tipo && o.tipo !== req.tipo) continue; if (!req.robos && o.robo === '1') continue; }
    var e = eventoObj_(o); delete e.ua; saida.push(e);
  }
  return { eventos: saida };
}

// ------------------------------------------------------------------ visitantes
function resumoVisitante_(l) {
  var reg = json_(l.registro), nav = reg.dados_navegador || {}, con = reg.conexao_servidor || {};
  var n = nav.navegador || {}, t = nav.tela || {}, ipi = json_(l.ipinfo)[l.ip] || null;
  return {
    visitante_id: l.id, criado_em: l.criado_em, atualizado_em: l.atualizado_em, quantidade_coletas: Number(l.coletas), ip: l.ip || null,
    tipo_ip: con.tipo_ip, ips: con.ips_publicos_detectados || {}, ua_info: analisarUa_(n.user_agent), idioma: n.idioma, timezone: n.timezone,
    tela: t.largura ? t.largura + '×' + t.altura : null, gps: !!nav.geolocalizacao,
    local: ipi && ipi.cidade ? ipi.cidade + ', ' + ipi.codigo_pais : null
  };
}

function statsVisitantes_(pid) {
  var mapa = mapaSessaoVisitante_(), sh = aba_('eventos'), n = sh.getLastRow() - 1, st = {};
  if (n < 1) return st;
  var v = sh.getRange(2, 3, n, 7).getValues(); // epoch, tipo, pagina_id, sessao, visitante, robo, canal
  for (var i = 0; i < v.length; i++) {
    if (String(v[i][2]) !== String(pid) || String(v[i][5]) === '1') continue;
    var tipo = v[i][1]; if (tipo !== 'pageview' && tipo !== 'clique') continue;
    var s = String(v[i][3] || ''), vid = String(v[i][4] || '') || mapa[s];
    if (!vid) continue;
    var x = st[vid] || (st[vid] = { sessoes: {}, cliques: 0, canal: null, t: null });
    if (tipo === 'pageview') { x.sessoes[s] = true; if (x.t === null || Number(v[i][0]) < x.t) { x.t = Number(v[i][0]); x.canal = String(v[i][6]); } }
    else x.cliques++;
  }
  return st;
}

function acaoVisitantes_(req) {
  var pid = paginaOu404_(req.pagina).id, st = statsVisitantes_(pid);
  var lista = ler_('visitantes').filter(function (l) { return st[l.id]; }).sort(function (a, b) { return Number(b.epoch) - Number(a.epoch); })
    .map(function (l) { var r = resumoVisitante_(l), x = st[l.id]; r.sessoes = Object.keys(x.sessoes).length; r.cliques = x.cliques; r.origem_canal = x.canal; return r; });
  return { visitantes: lista };
}

function acaoVisitante_(req) {
  if (!RE_VISITANTE_.test(req.id || '')) throw erro_('ID inválido.', 400);
  var l = buscar_('visitantes', 'id', req.id);
  if (!l) throw erro_('Visitante não encontrado.', 404);
  var sess = {};
  ler_('visitante_sessoes').forEach(function (x) { if (x.visitante === req.id) sess[x.sessao] = true; });
  var nomes = {}; listarPaginas_().forEach(function (p) { nomes[p.id] = p.nome; });
  var evs = ler_('eventos').filter(function (e) { return e.visitante === req.id || (e.sessao && sess[e.sessao]); }).slice(-300)
    .map(function (o) { var e = eventoObj_(o); delete e.ua; e.pagina_nome = nomes[e.pagina_id]; return e; });
  var reg = json_(l.registro); reg.ipinfo_admin = json_(l.ipinfo);
  return { registro: reg, resumo: resumoVisitante_(l), eventos: evs };
}

function acaoExcluirVisitante_(req) {
  if (!RE_VISITANTE_.test(req.id || '')) throw erro_('ID inválido.', 400);
  comTrava_(function () {
    excluirOnde_('visitantes', function (x) { return x.id === req.id; });
    excluirOnde_('visitante_sessoes', function (x) { return x.visitante === req.id; });
  });
  return { ok: true };
}

/** Única ação que consulta o IPinfo — acionada pelo botão "Ver localização". */
function acaoIpinfo_(req) {
  var ip = String(req.ip || '').trim(), vazio = { consultado: false, ip: ip, erro: null };
  if (!ipValido_(ip)) { vazio.erro = 'IP privado, local ou inválido; consulta pública não aplicável'; return vazio; }
  var cache = CacheService.getScriptCache(), emCache = cache.get('ipinfo_' + ip), r;
  if (emCache) r = JSON.parse(emCache);
  else {
    var token = PropertiesService.getScriptProperties().getProperty('IPINFO_TOKEN');
    var resp = UrlFetchApp.fetch('https://ipinfo.io/' + encodeURIComponent(ip) + '/json' + (token ? '?token=' + token : ''), { muteHttpExceptions: true, headers: { Accept: 'application/json' } });
    if (resp.getResponseCode() !== 200) { vazio.erro = 'IPinfo HTTP ' + resp.getResponseCode(); return vazio; }
    var d = JSON.parse(resp.getContentText()), org = String(d.org || '').trim(), asn = /^AS/i.test(org) ? org.split(' ')[0] : null;
    var loc = d.loc && d.loc.split(','), lat = loc ? Number(loc[0]) : null, lon = loc ? Number(loc[1]) : null;
    delete d.readme;
    r = { consultado: true, ip: ip, provedor: asn && org.indexOf(' ') > 0 ? org.slice(org.indexOf(' ') + 1) : (org || null), organizacao: org || null, asn: asn,
          pais: d.country || null, codigo_pais: d.country || null, regiao: d.region || null, cidade: d.city || null, codigo_postal: d.postal || null,
          timezone: d.timezone || null, localizacao_aproximada: d.loc || null, latitude: lat, longitude: lon, hostname: d.hostname || null,
          anycast: d.anycast || null, bruto: d, consultado_em: agoraIso_(), erro: null };
    cache.put('ipinfo_' + ip, JSON.stringify(r), 3600);
  }
  if (req.visitante && RE_VISITANTE_.test(req.visitante)) {
    comTrava_(function () {
      var l = buscar_('visitantes', 'id', req.visitante);
      if (l) { var atual = json_(l.ipinfo); atual[ip] = r; l.ipinfo = JSON.stringify(atual).slice(0, LIMITE_CELULA); atualizar_('visitantes', l); }
    });
  }
  return r;
}

function acaoMapa_(req) {
  var pid = paginaOu404_(req.pagina).id, st = statsVisitantes_(pid), pontos = [];
  ler_('visitantes').forEach(function (l) {
    if (!st[l.id]) return;
    var ipi = json_(l.ipinfo);
    Object.keys(ipi).forEach(function (ip) {
      var inf = ipi[ip];
      if (inf && inf.latitude !== null && inf.latitude !== undefined)
        pontos.push({ visitante: l.id, ip: ip, lat: inf.latitude, lon: inf.longitude, cidade: inf.cidade, regiao: inf.regiao, pais: inf.pais, org: inf.organizacao, tipo: 'ip' });
    });
    var gps = (json_(l.registro).dados_navegador || {}).geolocalizacao;
    if (gps && gps.latitude !== undefined && gps.latitude !== null) pontos.push({ visitante: l.id, lat: gps.latitude, lon: gps.longitude, precisao: gps.precisao_metros, tipo: 'gps' });
  });
  return { mapa: pontos };
}

// ------------------------------------------------------------------ campanhas
function limparUtm_(v) {
  v = String(v || '').trim().toLowerCase().replace(/[^a-z0-9_.\-]/g, '-').replace(/-{2,}/g, '-').replace(/^-|-$/g, '').slice(0, 60);
  return v || '';
}

function campanhaObj_(c) {
  return { id: Number(c.id), codigo: c.codigo, pagina_id: Number(c.pagina_id), nome: c.nome, origem: c.origem, utm_source: c.utm_source,
           utm_medium: c.utm_medium || null, utm_campaign: c.utm_campaign || null, utm_content: c.utm_content || null, ativo: c.ativo === '1', criado_em: c.criado_em };
}

function acaoCampanhasLista_(req) {
  var pid = String(paginaOu404_(req.pagina).id);
  return { campanhas: ler_('campanhas').filter(function (c) { return c.pagina_id === pid; }).map(campanhaObj_).reverse() };
}

function acaoCriarCampanha_(req) {
  paginaOu404_(req.pagina_id);
  if (!String(req.nome || '').trim() || !limparUtm_(req.utm_source)) throw erro_('Informe o nome e a origem da campanha.', 400);
  return comTrava_(function () {
    var todas = ler_('campanhas'), usado = {};
    todas.forEach(function (c) { usado[c.codigo] = true; });
    var codigo = req.codigo ? limparUtm_(req.codigo) : '';
    if (codigo && usado[codigo]) throw erro_('Esse código curto já está em uso.', 400);
    while (!codigo) { var c = Utilities.getUuid().replace(/-/g, '').slice(0, 5); if (!usado[c]) codigo = c; }
    var obj = { id: proximoId_('campanhas'), codigo: codigo, pagina_id: req.pagina_id, nome: String(req.nome).trim().slice(0, 80),
                origem: String(req.origem || '').slice(0, 40), utm_source: limparUtm_(req.utm_source), utm_medium: limparUtm_(req.utm_medium),
                utm_campaign: limparUtm_(req.utm_campaign) || limparUtm_(req.nome), utm_content: limparUtm_(req.utm_content), ativo: '1', criado_em: agoraIso_() };
    inserir_('campanhas', obj);
    return campanhaObj_(linhaDe_('campanhas', obj).reduce(function (o, v, i) { o[TABELAS.campanhas[i]] = v; return o; }, {}));
  });
}

function acaoEditarCampanha_(req) {
  comTrava_(function () {
    var c = buscar_('campanhas', 'id', req.id);
    if (!c) throw erro_('Campanha não encontrada.', 404);
    if (req.ativo !== undefined && req.ativo !== null) c.ativo = req.ativo ? '1' : '0';
    if (req.nome && String(req.nome).trim()) c.nome = String(req.nome).trim().slice(0, 80);
    atualizar_('campanhas', c);
  });
  return { ok: true };
}

function acaoExcluirCampanha_(req) {
  comTrava_(function () { excluirOnde_('campanhas', function (c) { return c.id === String(req.id); }); });
  return { ok: true };
}

// ------------------------------------------------------------------ retenção
function acaoRetencao_() {
  var tz = Session.getScriptTimeZone(), sh = aba_('eventos'), n = Math.max(0, sh.getLastRow() - 1);
  var maisAntigo = n ? String(sh.getRange(2, 2).getValue()) : null;
  return {
    retencao: obterRetencao_(), ultima_limpeza: ajuste_('ultima_limpeza', null),
    contagem: { eventos: n, visitantes: Math.max(0, aba_('visitantes').getLastRow() - 1), mais_antigo: maisAntigo },
    banco_mb: Math.round((n * 600) / 10485.76) / 100, versao: VERSAO, fuso: tz,
    planilha_url: planilha_().getUrl()
  };
}

function acaoSalvarRetencao_(req) {
  var r = { eventos_dias: Math.max(0, Math.min(Number(req.eventos_dias) || 0, 3650)), visitantes_dias: Math.max(0, Math.min(Number(req.visitantes_dias) || 0, 3650)), ativa: !!req.ativa };
  definirAjuste_('retencao', r);
  return { retencao: r };
}

function acaoExecutarRetencao_() { return limparDadosAntigos_(true); }
