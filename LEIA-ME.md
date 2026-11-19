# Farejador — versão Apps Script + GitHub Pages

Mesma página de links e mesmo painel da versão em Python, só que **grátis e sem servidor**:

| Parte | Onde fica |
|---|---|
| Página pública e painel (`/admin`) | **GitHub Pages** (pasta `site/`) |
| "Servidor" (API, login, coleta, IPinfo) | **Google Apps Script** (pasta `apps_script/`) |
| Banco de dados | **Planilha Google** (uma aba por tabela) |
| Imagens enviadas pelo painel | **Google Drive** (pasta "Farejador — imagens") |

```
farejador_gas/
├── LEIA-ME.md
├── apps_script/          código do backend
│   ├── 00_Rotas.gs … 08_Manutencao.gs   (organizado em arquivos)
│   └── TUDO_EM_UM.gs     (os mesmos arquivos juntos, para colar de uma vez)
└── site/                 tudo que vai para o GitHub
    ├── index.html  404.html  config.js
    ├── admin/index.html
    ├── css/  js/  js/admin/  js/admin/vistas/  vendor/
```

---

## Passo a passo (uns 10 minutos)

### 1. Planilha + Apps Script
1. Abra **sheets.new** e dê um nome, ex.: `Farejador — dados`.
2. Menu **Extensões → Apps Script**.
3. Apague o código que aparece e cole todo o conteúdo de **`apps_script/TUDO_EM_UM.gs`**
   (ou crie um arquivo para cada `.gs` da pasta, se preferir organizado). Clique em 💾 **Salvar**.
4. Na barra de cima, escolha a função **`configurar`** e clique em **▶ Executar**.
   - O Google vai pedir autorização: **Revisar permissões → sua conta → Avançado → Acessar (não seguro) → Permitir**.
     (Aparece "não seguro" só porque o script é seu e não foi publicado na loja do Google.)
   - Isso cria as abas da planilha, a primeira página e a limpeza automática a cada 6 horas.

### 2. Publicar o Apps Script como App da Web
1. **Implantar → Nova implantação** → engrenagem ⚙ → **App da Web**.
2. *Executar como:* **Eu** · *Quem pode acessar:* **Qualquer pessoa**.
3. **Implantar** e copie o **URL do app da Web** (termina em `/exec`).

### 3. Configurar o site
Abra `site/config.js` e cole o endereço:
```js
API_URL: "https://script.google.com/macros/s/AKfy...../exec",
```

### 4. Publicar no GitHub Pages
1. Crie um repositório **público** no GitHub, ex.: `farejador`.
2. Envie **o conteúdo da pasta `site/`** para a raiz do repositório (o `index.html` precisa ficar na raiz).
3. No repositório: **Settings → Pages → Branch: `main` / `(root)` → Save**.
4. Em 1–2 minutos o site fica em `https://SEU-USUARIO.github.io/farejador/`.

### 5. Primeiro acesso ao painel
Abra `https://SEU-USUARIO.github.io/farejador/admin/` — como ainda não há usuário, aparece
**"Criar acesso ao painel"**: escolha usuário e senha (8+ caracteres). Pronto!

---

## Endereços

| O quê | Endereço |
|---|---|
| Página principal | `https://SEU-USUARIO.github.io/farejador/` |
| Outras páginas | `…/farejador/?p=games` (também funciona `…/farejador/games`) |
| Link curto de campanha | `…/farejador/?c=abc12` (também funciona `…/farejador/c/abc12`) |
| Painel | `…/farejador/admin/` |

> Os endereços com `?p=` e `?c=` são os recomendados para a bio: carregam direto.
> Os "bonitos" (`/games`, `/c/abc12`) passam pelo `404.html`, que redireciona em uma fração de segundo.

---

## Atualizar depois
- **Mudou o código do Apps Script?** *Implantar → Gerenciar implantações → ✏ editar → Versão: Nova versão → Implantar.*
  O endereço `/exec` continua o mesmo.
- **Mudou o site?** É só enviar os arquivos de novo para o GitHub.
- **Mudou textos, links ou visual?** Não precisa mexer em código: use o painel.

## Opcionais
- **Token do IPinfo:** Apps Script → ⚙ Configurações do projeto → Propriedades do script → `IPINFO_TOKEN`.
- **Esqueceu a senha:** no Apps Script, abra a função `redefinirSenhaAdmin` (arquivo 08), troque `NOVA_SENHA`,
  execute, depois apague a senha do código.
- **Site na raiz** (repositório `seu-usuario.github.io` ou domínio próprio): em `site/404.html` troque
  `var BASE_FIXA = null;` por `var BASE_FIXA = "/";`.

---

## Diferenças em relação à versão Python
- **IP:** o Apps Script não informa o IP de quem acessa; o IP vem do navegador do visitante (ipify).
  Funciona, mas é um dado informado pelo navegador.
- **Cabeçalhos HTTP:** idioma, User-Agent e origem são lidos pelo JavaScript da página.
- **Robôs:** robôs de prévia (WhatsApp, Facebook…) não executam JavaScript, então nem chegam a contar.
  Navegadores automatizados que executam são marcados como robô e filtrados.
- **Cliques:** o link abre direto no destino e o clique é registrado em segundo plano (`sendBeacon`).
- **Estatísticas:** o painel baixa os eventos do período e faz as contas no navegador
  (visão geral, comparação, retorno, campanhas). A planilha é a fonte de tudo — dá para abrir e conferir.
- **Limites do Google (conta grátis):** ótimo para uma página de bio com centenas ou poucos milhares de visitas por dia.
  Cada célula da planilha aceita até 50 mil caracteres, então o histórico de cada visitante guarda os últimos acessos.
- **Prévia do link (WhatsApp/Instagram):** usa o título e a descrição fixos do `index.html` (edite lá se quiser).

## Privacidade
A coleta completa só acontece depois do **Aceitar**. Quem recusa é contado de forma anônima.
A planilha e o Drive continuam privados na sua conta; o repositório público do GitHub não tem nenhuma senha ou token.
