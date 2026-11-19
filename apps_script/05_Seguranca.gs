/**
 * 05_Seguranca.gs — usuários, senhas (HMAC-SHA256 iterado com sal), sessões por token e bloqueio.
 * O token fica no navegador (não usa cookies) e só o hash dele é guardado na planilha.
 */
function erro_(msg, status) { var e = new Error(msg); e.status = status || 400; return e; }

function hex_(bytes) {
  return bytes.map(function (b) { var h = (b < 0 ? b + 256 : b).toString(16); return h.length === 1 ? '0' + h : h; }).join('');
}

function hashSenha_(senha, salHex, iteracoes) {
  var chave = Utilities.newBlob(salHex).getBytes();
  var h = Utilities.computeHmacSha256Signature(Utilities.newBlob(String(senha)).getBytes(), chave);
  for (var i = 1; i < iteracoes; i++) h = Utilities.computeHmacSha256Signature(h, chave);
  return hex_(h);
}

function hashToken_(token) {
  return hex_(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, String(token)));
}

function comparar_(a, b) { // comparação em tempo constante
  if (a.length !== b.length) return false;
  var r = 0; for (var i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

function validarSenhaNova_(senha) {
  if (String(senha || '').length < SENHA_MIN) throw erro_('A senha precisa ter pelo menos ' + SENHA_MIN + ' caracteres.', 400);
  if (/^\d+$/.test(senha) || ['12345678', 'senha123', 'password', 'farejador'].indexOf(String(senha).toLowerCase()) >= 0)
    throw erro_('Escolha uma senha menos óbvia (misture letras e números).', 400);
}

function temUsuarios_() { return ler_('usuarios').length > 0; }

function criarUsuario_(usuario, senha) {
  usuario = String(usuario || '').trim().slice(0, 40);
  if (!/^[A-Za-z0-9_.-]+$/.test(usuario)) throw erro_('Usuário inválido (use letras, números, ponto, hífen ou _).', 400);
  comTrava_(function () {
    if (ler_('usuarios').some(function (u) { return u.usuario.toLowerCase() === usuario.toLowerCase(); })) throw erro_('Esse usuário já existe.', 400);
    var sal = Utilities.getUuid().replace(/-/g, '');
    inserir_('usuarios', { id: proximoId_('usuarios'), usuario: usuario, hash: hashSenha_(senha, sal, ITERACOES_SENHA), sal: sal,
      iteracoes: ITERACOES_SENHA, criado_em: agoraIso_(), ultimo_login: '', falhas: '0', bloqueado_ate: '0' });
  });
}

function definirSenha_(usuarioId, senha) {
  comTrava_(function () {
    var u = buscar_('usuarios', 'id', usuarioId);
    if (!u) throw erro_('Usuário não encontrado.', 404);
    u.sal = Utilities.getUuid().replace(/-/g, '');
    u.hash = hashSenha_(senha, u.sal, ITERACOES_SENHA); u.iteracoes = String(ITERACOES_SENHA);
    u.falhas = '0'; u.bloqueado_ate = '0';
    atualizar_('usuarios', u);
  });
}

function autenticar_(usuario, senha) {
  var agora = Date.now() / 1000;
  var u = ler_('usuarios').filter(function (x) { return x.usuario.toLowerCase() === String(usuario || '').trim().toLowerCase(); })[0];
  if (u && Number(u.bloqueado_ate) > agora) throw erro_('Conta bloqueada temporariamente por tentativas erradas. Tente em alguns minutos.', 429);
  var ok = u && comparar_(hashSenha_(senha || '', u.sal, Number(u.iteracoes)), u.hash);
  if (!u) hashSenha_(senha || '', 'xxxxxxxxxxxxxxxx', ITERACOES_SENHA); // mesmo tempo para usuário inexistente
  if (!ok) {
    if (u) comTrava_(function () {
      var f = Number(u.falhas) + 1;
      if (f >= MAX_FALHAS_USUARIO) { u.falhas = '0'; u.bloqueado_ate = String(agora + BLOQUEIO_S); } else u.falhas = String(f);
      atualizar_('usuarios', u);
    });
    throw erro_('Usuário ou senha incorretos.', 401);
  }
  comTrava_(function () { u.falhas = '0'; u.bloqueado_ate = '0'; u.ultimo_login = agoraIso_(); atualizar_('usuarios', u); });
  return { id: Number(u.id), usuario: u.usuario };
}

function abrirSessao_(usuarioId, lembrar, ua) {
  var token = Utilities.getUuid() + Utilities.getUuid();
  var dur = lembrar ? SESSAO_LONGA_S : SESSAO_CURTA_S;
  comTrava_(function () {
    inserir_('sessoes_admin', { token_hash: hashToken_(token), usuario_id: usuarioId, criado_em: agoraIso_(),
      expira: String(Date.now() / 1000 + dur), ultimo_uso: agoraIso_(), ua: String(ua || '').slice(0, 200) });
  });
  return { token: token, lembrar: !!lembrar };
}

function sessaoAtual_(token) {
  if (!token) return null;
  var th = hashToken_(token);
  var cache = CacheService.getScriptCache(), emCache = cache.get('s_' + th);
  if (emCache) return JSON.parse(emCache);
  var s = buscar_('sessoes_admin', 'token_hash', th);
  if (!s) return null;
  if (Number(s.expira) < Date.now() / 1000) { comTrava_(function () { aba_('sessoes_admin').deleteRow(s._linha); }); return null; }
  var u = buscar_('usuarios', 'id', s.usuario_id);
  if (!u) return null;
  var r = { token_hash: th, usuario_id: Number(u.id), usuario: u.usuario };
  comTrava_(function () { s.ultimo_uso = agoraIso_(); atualizar_('sessoes_admin', s); });
  cache.put('s_' + th, JSON.stringify(r), 300); // 5 min
  return r;
}

function exigirAdmin_(req) {
  var s = sessaoAtual_(req.token);
  if (!s) throw erro_('Faça login no painel.', 401);
  return s;
}

function limparCacheSessoes_(hashes) {
  var c = CacheService.getScriptCache();
  hashes.forEach(function (h) { c.remove('s_' + h); });
}
