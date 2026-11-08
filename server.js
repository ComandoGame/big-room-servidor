<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>BIG-Room — Sua Lan House na Nuvem</title>
  <link rel="stylesheet" href="style.css" />
  
  <script>
    const fpPromise = import('https://fpjscdn.net/v4/M9iggYeksMpBeVbRCwPX').then(Fingerprint => Fingerprint.start());
    async function obterVisitorId() { try { const fp = await fpPromise; const result = await fp.get(); return result.visitor_id; } catch (error) { return "Desconhecido"; } }
  </script>
  
  <style>
    .hero { text-align: center; padding: 6rem 2rem 4rem; position: relative; z-index: 1; }
    .hero h1 { font-size: 4rem; margin-bottom: 1rem; line-height: 1.1; color: #fff; font-weight: 900; letter-spacing: -1px; }
    .hero h1 span { color: var(--laranja); }
    .hero p { color: var(--texto-fraco); margin-bottom: 2rem; font-size: 1.2rem; max-width: 600px; margin-inline: auto; }
    .cta-container { display: flex; justify-content: center; gap: 1rem; margin-bottom: 4rem; }
    .btn-cta { padding: 1rem 2.5rem; font-size: 1.2rem; font-weight: bold; border-radius: 12px; background: linear-gradient(135deg, var(--laranja), var(--laranja-esc)); color: #fff; text-decoration: none; transition: 0.3s; box-shadow: 0 10px 20px rgba(249, 115, 22, 0.3); }
    .btn-cta:hover { transform: translateY(-3px); box-shadow: 0 15px 25px rgba(249, 115, 22, 0.5); }
    .video-showcase { max-width: 1000px; margin: 0 auto 4rem; border-radius: 20px; overflow: hidden; border: 1px solid var(--borda); box-shadow: 0 20px 50px rgba(0,0,0,0.8); position: relative; background: #000; }
    .video-showcase video { width: 100%; display: block; object-fit: cover; }
    .pcs-grid { display: flex; gap: 2rem; justify-content: center; flex-wrap: wrap; }
    .pc-card { padding: 2.5rem; width: 320px; text-align: left; transition: 0.3s; background: var(--bg-card); border: 1px solid var(--borda); border-radius: 16px; }
    .pc-card:hover { border-color: var(--laranja) !important; transform: translateY(-8px); }
    .pc-card h3 { color: var(--laranja); margin-bottom: 1rem; font-size: 1.4rem; }
    .pc-card p { font-size: 0.95rem; color: var(--texto-fraco); line-height: 1.7; }
    .pc-card strong { color: #fff; }
    .features-list { display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 2rem; text-align: left; }
    .feature-item { padding: 2rem; border-left: 4px solid var(--laranja) !important; transition: 0.3s; background: var(--bg-card); border-radius: 12px; }
    .feature-item h4 { margin-bottom: 0.8rem; color: #fff; font-size: 1.3rem; }
    .feature-item p { font-size: 0.95rem; color: var(--texto-fraco); line-height: 1.6; }
    .seguranca-box { background: rgba(239, 68, 68, 0.1) !important; border: 1px solid var(--vermelho) !important; padding: 3rem; max-width: 900px; margin: 0 auto; display: flex; align-items: center; gap: 2rem; text-align: left; border-radius: 16px; }
    .seguranca-box h3 { color: var(--vermelho); margin-bottom: 0.5rem; font-size: 1.5rem; }
    .seguranca-box p { color: #ddd; font-size: 1rem; line-height: 1.7; }
    .btn-nav-login { background: transparent; border: 1px solid var(--laranja); color: var(--laranja); padding: 0.6rem 1.2rem; border-radius: 8px; font-weight: 600; cursor: pointer; transition: 0.2s; margin-right: 10px; font-size: 0.95rem; }
    .btn-nav-cadastro { background: var(--laranja); border: 1px solid var(--laranja); color: #fff; padding: 0.6rem 1.2rem; border-radius: 8px; font-weight: 600; cursor: pointer; transition: 0.2s; font-size: 0.95rem; }
    body { user-select: none; -webkit-user-drag: none; }
    .tradutor { display: flex; align-items: center; gap: 5px; margin-right: 15px; border: 1px solid var(--borda); border-radius: 8px; padding: 2px; background: rgba(0,0,0,0.3); }
    .btn-idioma { background: transparent; border: none; color: #fff; padding: 5px 8px; border-radius: 6px; cursor: pointer; font-size: 1.1rem; transition: 0.2s; opacity: 0.6; }
    .btn-idioma.ativo { opacity: 1; background: rgba(249, 115, 22, 0.2); border: 1px solid var(--laranja); }
  </style>
</head>
<body>
  <div class="bg-animation"><div class="orb orb-1"></div><div class="orb orb-2"></div><div class="orb orb-3"></div><div class="grid-overlay"></div></div>

  <header class="navbar">
    <a href="index.html" class="logo">🎮 BIG<span>Room</span></a>
    <nav>
      <a href="precos.html" data-i18n="nav_credits">Créditos</a>
      <a href="como-funciona.html" data-i18n="nav_how">Como funciona</a>
      <div class="user-area">
        <div class="tradutor">
            <button class="btn-idioma ativo" id="btn-pt" onclick="traduzir('pt')">🇧🇷</button>
            <button class="btn-idioma" id="btn-en" onclick="traduzir('en')">🇺🇸</button>
        </div>
        <div class="saldo" id="saldoDisplay" style="display: none;"><span data-i18n="nav_balance">Saldo</span>: <strong>R$ 0,00</strong></div>
        <div id="botoesDeslogado" style="display: flex;">
          <button class="btn-nav-login" onclick="abrirModal('login')" data-i18n="nav_login">Entrar</button>
          <button class="btn-nav-cadastro" onclick="abrirModal('cadastro')" data-i18n="nav_register">Criar Conta</button>
        </div>
        <div id="perfilLogado" style="display:none; align-items:center; gap:10px;">
          <span style="color:var(--laranja); font-weight:bold;" id="nomeUsuario"></span>
          <button class="btn-outline" onclick="sair()" data-i18n="nav_logout">Sair</button>
        </div>
      </div>
    </nav>
  </header>

  <section class="hero">
    <h1><span data-i18n="hero_title_1">Pare de se preocupar com hardware.</span><br><span data-i18n="hero_title_2">Jogue no nosso PC Gamer.</span></h1>
    <p data-i18n="hero_sub">Acesso total a um computador potente direto no seu navegador. Instale mods, baixe jogos na Steam e jogue com seus amigos.</p>
    <div class="cta-container"><a href="precos.html" class="btn-cta" data-i18n="hero_btn">Testar Grátis Agora</a></div>
    <div class="video-showcase"><video src="games_showcase_final.mp4" autoplay loop muted playsinline></video></div>
  </section>

  <section class="section" style="background: rgba(22, 22, 22, 0.4); border-radius: 24px; margin: 0 auto 4rem; backdrop-filter: blur(10px); max-width: 1100px; padding: 4rem 2rem;">
    <h2 data-i18n="pcs_title">Escolha a Máquina Ideal</h2>
    <p class="sub" data-i18n="pcs_sub">Nós cuidamos do PC, você só se preocupa em jogar.</p>
    <div class="pcs-grid">
      <div class="pc-card"><h3 data-i18n="pcs_basic">💻 Modo Casual</h3><p data-i18n="pcs_basic_desc">Perfeito para: Jogar Minecraft com mods, LOL, Valorant. Roda tudo liso em 1080p.</p></div>
      <div class="pc-card"><h3 data-i18n="pcs_mid">🎮 Modo Gamer</h3><p data-i18n="pcs_mid_desc">Perfeito para: Jogos AAA pesados, GTA V, CS2. Gráficos no alto e fluidez garantida.</p></div>
      <div class="pc-card" style="border-color: var(--laranja);"><h3 data-i18n="pcs_vip">🚀 Modo Ultra (VIP)</h3><p data-i18n="pcs_vip_desc">Perfeito para: Jogar no máximo, 2K, Ray Tracing. A máquina mais forte para rodar tudo no Ultra.</p></div>
    </div>
  </section>

  <section class="section">
    <h2 data-i18n="feat_title">Mais que um PC, uma experiência completa</h2>
    <div class="features-list">
      <div class="feature-item"><h4 data-i18n="feat_steam">🛒 Suas lojas favoritas</h4><p data-i18n="feat_steam_desc">Acesse sua conta da Steam, Epic Games e baixe seus jogos. Ferramentas como Steam Tools são liberadas.</p></div>
      <div class="feature-item"><h4 data-i18n="feat_mine">⛏️ Mods e Shaders</h4><p data-i18n="feat_mine_desc">Jogue Minecraft no TLauncher, instale shaders pesados e crie servidores. Nada é bloqueado.</p></div>
      <div class="feature-item"><h4 data-i18n="feat_priv">🔒 Privacidade Total</h4><p data-i18n="feat_priv_desc">Você não tem acesso a senhas ou dados bancários. Cada sessão é formatada e limpa após o término.</p></div>
    </div>
  </section>

  <div class="modal-bg" id="modalBg">
    <div class="modal">
      <button class="fechar" onclick="fecharModal()">✕</button>
      <h3 id="modalTitulo" data-i18n="modal_login_title">Entrar</h3>
      <p id="modalSubtitulo" data-i18n="modal_login_sub">Acesse sua conta para continuar.</p>
      <form onsubmit="fazerLogin(event)">
        <input type="text" id="inpNome" placeholder="Seu nome" style="display: none;" />
        <input type="email" id="inpEmail" placeholder="E-mail" required />
        <input type="password" id="inpSenha" placeholder="Senha" required />
        <button type="submit" class="btn-primary" id="btnSubmitLogin" style="width:100%; margin-top: 1rem;"><span id="btnLoginText">Entrar</span></button>
      </form>
    </div>
  </div>

  <script>
    const API_URL = 'https://big-room-servidor.onrender.com';
    const traducoes = {
        pt: { nav_credits: "Créditos", nav_how: "Como funciona", nav_balance: "Saldo", nav_login: "Entrar", nav_register: "Criar Conta", nav_logout: "Sair", hero_title_1: "Pare de se preocupar com hardware.", hero_title_2: "Jogue no nosso PC Gamer.", hero_sub: "Acesso total a um computador potente direto no seu navegador.", hero_btn: "Testar Grátis Agora", pcs_title: "Escolha a Máquina Ideal", pcs_sub: "Nós cuidamos do PC.", pcs_basic: "💻 Modo Casual", pcs_basic_desc: "Perfeito para jogos leves.", pcs_mid: "🎮 Modo Gamer", pcs_mid_desc: "Perfeito para jogos AAA.", pcs_vip: "🚀 Modo Ultra (VIP)", pcs_vip_desc: "A máquina mais forte.", feat_title: "Mais que um PC", feat_steam: "Suas lojas", feat_steam_desc: "Steam e Epic.", feat_mine: "Mods e Shaders", feat_mine_desc: "Minecraft.", feat_priv: "Privacidade", feat_priv_desc: "Sessão limpa.", modal_login_title: "Entrar", modal_login_sub: "Acesse sua conta.", ban_title: "ACESSO NEGADO" },
        en: { nav_credits: "Credits", nav_how: "How it works", nav_balance: "Balance", nav_login: "Login", nav_register: "Sign Up", nav_logout: "Logout", hero_title_1: "Stop worrying about hardware.", hero_title_2: "Play on our Gaming PC.", hero_sub: "Full access to a powerful computer right in your browser.", hero_btn: "Try Free Now", pcs_title: "Choose the Ideal Machine", pcs_sub: "We take care of the PC.", pcs_basic: "💻 Casual Mode", pcs_basic_desc: "Perfect for light games.", pcs_mid: "🎮 Gamer Mode", pcs_mid_desc: "Perfect for AAA games.", pcs_vip: "🚀 Ultra Mode (VIP)", pcs_vip_desc: "The strongest machine.", feat_title: "More than a PC", feat_steam: "Your stores", feat_steam_desc: "Steam and Epic.", feat_mine: "Mods and Shaders", feat_mine_desc: "Minecraft.", feat_priv: "Privacy", feat_priv_desc: "Clean session.", modal_login_title: "Login", modal_login_sub: "Access your account.", ban_title: "ACCESS DENIED" }
    };

    function traduzir(idioma) {
        document.querySelectorAll('[data-i18n]').forEach(el => {
            const chave = el.getAttribute('data-i18n');
            if (traducoes[idioma] && traducoes[idioma][chave]) el.innerText = traducoes[idioma][chave];
        });
        document.getElementById('btn-pt').classList.remove('ativo');
        document.getElementById('btn-en').classList.remove('ativo');
        document.getElementById('btn-' + idioma).classList.add('ativo');
        localStorage.setItem('bigroom_lingua', idioma);
    }

    document.addEventListener('contextmenu', e => e.preventDefault());

    let modoModal = 'login';
    
    // FUNÇÃO QUE SUBSTITUI O LOCALSTORAGE
    async function sincronizarUsuario() {
        try {
            const res = await fetch(`${API_URL}/api/me`, { credentials: 'include' });
            if (res.status === 403) return document.body.innerHTML = '<div style="height:100vh; background:#7f1d1d; color:white; display:flex; align-items:center; justify-content:center; font-size:3rem;">ACESSO NEGADO</div>';
            
            if (res.ok) {
                const data = await res.json();
                document.getElementById('botoesDeslogado').style.display = 'none';
                document.getElementById('perfilLogado').style.display = 'flex';
                document.getElementById('saldoDisplay').style.display = 'block';
                document.getElementById('nomeUsuario').innerText = data.usuario.nome;
                document.getElementById('saldoDisplay').innerHTML = `<span data-i18n="nav_balance">Saldo</span>: <strong>R$ ${data.usuario.saldo.toFixed(2)}</strong>`;
                traduzir(localStorage.getItem('bigroom_lingua') || 'pt');
            } else {
                document.getElementById('botoesDeslogado').style.display = 'flex';
                document.getElementById('perfilLogado').style.display = 'none';
                document.getElementById('saldoDisplay').style.display = 'none';
            }
        } catch (e) {}
    }

    window.onload = () => { if(localStorage.getItem('bigroom_lingua')) traduzir(localStorage.getItem('bigroom_lingua')); sincronizarUsuario(); setInterval(sincronizarUsuario, 5000); }
    
    function abrirModal(m) { modoModal = m; document.getElementById('modalBg').classList.add('ativo'); document.getElementById('inpNome').style.display = m==='cadastro'?'block':'none'; document.getElementById('btnLoginText').innerText = m==='cadastro'?'Cadastrar':'Entrar'; }
    function fecharModal() { document.getElementById('modalBg').classList.remove('ativo'); }
    
    async function fazerLogin(e) {
      e.preventDefault();
      const btn = document.getElementById('btnSubmitLogin'); btn.disabled = true;
      const visitorId = await obterVisitorId();
      let url = modoModal === 'cadastro' ? '/api/cadastro' : '/api/login';
      let bodyData = modoModal === 'cadastro' ? { nome: document.getElementById('inpNome').value, email: document.getElementById('inpEmail').value, senha: document.getElementById('inpSenha').value, visitorId } : { email: document.getElementById('inpEmail').value, senha: document.getElementById('inpSenha').value, visitorId };

      try {
        let res = await fetch(`${API_URL}${url}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify(bodyData) });
        let data = await res.json();
        if (res.ok) { alert(data.mensagem); fecharModal(); sincronizarUsuario(); } else { alert(data.erro); }
      } catch (error) { alert("Erro de conexão."); } finally { btn.disabled = false; }
    }

    async function sair() { await fetch(`${API_URL}/api/logout`, { method: 'POST', credentials: 'include' }); window.location.reload(); }
  </script>
</body>
</html>
