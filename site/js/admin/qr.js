// Geração de QR Code (canvas e SVG) com estilos e logo no centro. Usa vendor/qrcode.js.
function matriz(texto) {
  const q = window.qrcode(0, "H"); // correção alta: permite logo no centro
  q.addData(texto, "Byte");
  q.make();
  const n = q.getModuleCount();
  const m = [];
  for (let r = 0; r < n; r++) { m.push([]); for (let c = 0; c < n; c++) m[r].push(q.isDark(r, c)); }
  return m;
}
const ehOlho = (r, c, n) => (r < 7 && c < 7) || (r < 7 && c >= n - 7) || (r >= n - 7 && c < 7);

function carregarImagem(src) {
  return new Promise((ok) => { if (!src) return ok(null); const i = new Image(); i.crossOrigin = "anonymous"; i.onload = () => ok(i); i.onerror = () => ok(null); i.src = src; });
}

/** Desenha no canvas. op: {cor, fundo, estilo, margem, logo} */
export async function desenhar(canvas, texto, op) {
  const m = matriz(texto), n = m.length, tam = canvas.width, mg = op.margem || 2;
  const cel = tam / (n + mg * 2), ctx = canvas.getContext("2d");
  ctx.fillStyle = op.fundo; ctx.fillRect(0, 0, tam, tam);
  ctx.fillStyle = op.cor;
  const logo = op.logo ? await carregarImagem(op.logo) : null;
  const zona = logo ? Math.ceil(n * 0.22) : 0, ini = Math.floor((n - zona) / 2);
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) {
    if (!m[r][c] || ehOlho(r, c, n)) continue;
    if (logo && r >= ini && r < ini + zona && c >= ini && c < ini + zona) continue;
    const x = (c + mg) * cel, y = (r + mg) * cel;
    if (op.estilo === "pontos") { ctx.beginPath(); ctx.arc(x + cel / 2, y + cel / 2, cel * .42, 0, Math.PI * 2); ctx.fill(); }
    else if (op.estilo === "arredondado") { ctx.beginPath(); ctx.roundRect(x + cel * .05, y + cel * .05, cel * .9, cel * .9, cel * .32); ctx.fill(); }
    else ctx.fillRect(x, y, cel + .5, cel + .5);
  }
  // "olhos" (cantos) sempre nítidos
  [[0, 0], [0, n - 7], [n - 7, 0]].forEach(([r, c]) => {
    const x = (c + mg) * cel, y = (r + mg) * cel, raio = op.estilo === "quadrado" ? 0 : cel * 1.6;
    ctx.fillStyle = op.cor; ctx.beginPath(); ctx.roundRect(x, y, cel * 7, cel * 7, raio); ctx.fill();
    ctx.fillStyle = op.fundo; ctx.beginPath(); ctx.roundRect(x + cel, y + cel, cel * 5, cel * 5, raio * .6); ctx.fill();
    ctx.fillStyle = op.cor; ctx.beginPath(); ctx.roundRect(x + cel * 2, y + cel * 2, cel * 3, cel * 3, raio * .4); ctx.fill();
  });
  if (logo) {
    const lt = zona * cel, lx = (ini + mg) * cel, pad = cel * .6;
    ctx.fillStyle = op.fundo; ctx.beginPath(); ctx.roundRect(lx, lx, lt, lt, lt * .22); ctx.fill();
    ctx.save(); ctx.beginPath(); ctx.roundRect(lx + pad, lx + pad, lt - pad * 2, lt - pad * 2, lt * .18); ctx.clip();
    const s = Math.min(logo.width, logo.height);
    ctx.drawImage(logo, (logo.width - s) / 2, (logo.height - s) / 2, s, s, lx + pad, lx + pad, lt - pad * 2, lt - pad * 2);
    ctx.restore();
  }
}

/** SVG vetorial (sem logo — ideal para gráfica/impressão). */
export function svg(texto, op) {
  const m = matriz(texto), n = m.length, mg = op.margem || 2, t = n + mg * 2;
  let d = "";
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) {
    if (!m[r][c]) continue;
    const x = c + mg, y = r + mg;
    if (op.estilo === "pontos" && !ehOlho(r, c, n)) d += '<circle cx="' + (x + .5) + '" cy="' + (y + .5) + '" r=".42"/>';
    else if (op.estilo === "arredondado" && !ehOlho(r, c, n)) d += '<rect x="' + (x + .05) + '" y="' + (y + .05) + '" width=".9" height=".9" rx=".32"/>';
    else d += '<rect x="' + x + '" y="' + y + '" width="1.02" height="1.02"/>';
  }
  return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + t + " " + t + '" width="1024" height="1024"><rect width="100%" height="100%" fill="' + op.fundo + '"/><g fill="' + op.cor + '">' + d + "</g></svg>";
}

export function baixar(nome, conteudo, tipo) {
  const a = document.createElement("a");
  a.download = nome;
  a.href = typeof conteudo === "string" && conteudo.startsWith("data:") ? conteudo : URL.createObjectURL(new Blob([conteudo], { type: tipo }));
  document.body.appendChild(a); a.click(); a.remove();
}
