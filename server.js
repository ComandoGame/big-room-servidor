const express = require('express');
const http = require('http');
const { Server } = require("socket.io");
const path = require('path');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcryptjs');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const cookieParser = require('cookie-parser');
const { FingerprintServerApiClient, Region } = require('@fingerprint/node-sdk');

const app = express();
app.set('trust proxy', 1);
app.use(cors({ 
    origin: ['https://big-room-site.onrender.com', 'http://127.0.0.1:5500', 'http://localhost:5500'],
    credentials: true 
})); 
app.use(express.json()); 
app.use(cookieParser()); 
app.use(helmet({ contentSecurityPolicy: false }));
app.disable('x-powered-by');

// CONFIGURAÇÕES
const FP_SECRET_API_KEY = "COLE_SUA_SECRET_KEY_AQUI"; 
const JWT_SECRET = "bigroom_chave_secreta_super_segura_2026";
const fpClient = new FingerprintServerApiClient({ apiKey: FP_SECRET_API_KEY, region: Region.Global });

const limiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 100 });
app.use('/api/', limiter);

// --- BANCO DE DADOS ---
const db = new sqlite3.Database('./bigroom.db', (err) => {
    if (!err) {
        db.run(`CREATE TABLE IF NOT EXISTS usuarios (
            id INTEGER PRIMARY KEY AUTOINCREMENT, codigo_conta TEXT UNIQUE, nome TEXT NOT NULL, email TEXT UNIQUE NOT NULL,
            senha TEXT NOT NULL, saldo REAL DEFAULT 0.00, banido INTEGER DEFAULT 0, ip TEXT DEFAULT 'Desconhecido', visitor_id TEXT DEFAULT 'Desconhecido',
            plano_ativo TEXT DEFAULT 'Nenhum', tempo_restante INTEGER DEFAULT 0, ultimo_teste_gratis INTEGER DEFAULT 0
        )`);
        db.run(`CREATE TABLE IF NOT EXISTS banidos_ip (ip TEXT PRIMARY KEY)`);
        db.run(`CREATE TABLE IF NOT EXISTS banidos_hardware (visitor_id TEXT PRIMARY KEY)`);
        // TABELA DE MENSAGENS (Sem sistema de chat complexo, apenas o ticket)
        db.run(`CREATE TABLE IF NOT EXISTS mensagens (
            id INTEGER PRIMARY KEY AUTOINCREMENT, nome TEXT, email TEXT, mensagem TEXT, data_envio DATETIME DEFAULT CURRENT_TIMESTAMP
        )`);
    }
});

// --- FUNÇÕES AUXILIARES ---
function gerarCodigo() { return 'BR-' + Math.random().toString(36).substring(2, 7).toUpperCase(); }
function gerarTokenEEnviarCookie(res, usuario) {
    const token = jwt.sign({ id: usuario.id, role: 'user' }, JWT_SECRET, { expiresIn: '7d' });
    res.cookie('bigroom_token', token, { httpOnly: true, secure: true, sameSite: 'none', maxAge: 7 * 24 * 60 * 60 * 1000 });
}
function autenticarUser(req, res, next) {
    const token = req.cookies.bigroom_token;
    if (!token) return res.status(401).json({ erro: "Não autenticado." });
    jwt.verify(token, JWT_SECRET, (err, decoded) => {
        if (err) return res.status(403).json({ erro: "Sessão inválida." });
        req.userId = decoded.id; next();
    });
}

// --- ROTAS DO USUÁRIO ---
app.post('/api/cadastro', async (req, res) => {
    const { nome, email, senha, visitorId } = req.body;
    const ip = req.ip;
    if (!nome || !email || !senha) return res.status(400).json({ erro: "Preencha todos os campos." });

    db.get(`SELECT ip FROM banidos_ip WHERE ip = ?`, [ip], async (err, row) => {
        if (row) return res.status(403).json({ erro: "Seu IP está bloqueado." });
        try {
            const senhaHash = await bcrypt.hash(senha, 10);
            const codigoConta = gerarCodigo();
            db.run(`INSERT INTO usuarios (codigo_conta, nome, email, senha, saldo, ip, visitor_id) VALUES (?, ?, ?, ?, ?, ?, ?)`, 
                [codigoConta, nome, email, senhaHash, 5.00, ip, visitorId || 'Desconhecido'],
                function(err) {
                    if (err) return res.status(400).json({ erro: "E-mail já cadastrado." });
                    const usuario = { id: this.lastID, nome, saldo: 5.00 };
                    gerarTokenEEnviarCookie(res, usuario);
                    res.json({ mensagem: "Conta criada!", usuario });
                }
            );
        } catch (error) { res.status(500).json({ erro: "Erro no servidor." }); }
    });
});

app.post('/api/login', (req, res) => {
    const { email, senha } = req.body;
    db.get(`SELECT * FROM usuarios WHERE email = ?`, [email], async (err, usuario) => {
        if (err || !usuario) return res.status(401).json({ erro: "Dados incorretos." });
        if (usuario.banido === 1) return res.status(403).json({ erro: "Conta banida." });
        const valida = await bcrypt.compare(senha, usuario.senha);
        if (!valida) return res.status(401).json({ erro: "Dados incorretos." });
        const dadosUser = { id: usuario.id, nome: usuario.nome, saldo: usuario.saldo };
        gerarTokenEEnviarCookie(res, dadosUser);
        res.json({ mensagem: "Bem-vindo!", usuario: dadosUser });
    });
});

app.get('/api/me', autenticarUser, (req, res) => {
    db.get(`SELECT nome, saldo, tempo_restante, plano_ativo, banido FROM usuarios WHERE id = ?`, [req.userId], (err, row) => {
        if (err || !row) return res.status(404).json({ erro: "Usuário não encontrado." });
        if (row.banido === 1) return res.status(403).json({ erro: "BANIDO" });
        res.json({ usuario: row });
    });
});

app.post('/api/logout', (req, res) => { res.clearCookie('bigroom_token'); res.json({ mensagem: "Logout." }); });

app.post('/api/teste-gratis', autenticarUser, (req, res) => {
    const agora = Date.now();
    db.get(`SELECT ultimo_teste_gratis FROM usuarios WHERE id = ?`, [req.userId], (err, user) => {
        if (user.ultimo_teste_gratis !== 0 && (agora - user.ultimo_teste_gratis) < 7 * 24 * 60 * 60 * 1000) {
            return res.status(403).json({ erro: "Você já usou o teste grátis nesta semana." });
        }
        db.run(`UPDATE usuarios SET tempo_restante = 15, plano_ativo = 'Teste Grátis', ultimo_teste_gratis = ? WHERE id = ?`, [agora, req.userId], function() {
            res.json({ mensagem: "Teste liberado!", tempo: 15 });
        });
    });
});

app.post('/api/descontar', autenticarUser, (req, res) => {
    const { valor, minutos, plano } = req.body;
    db.get(`SELECT saldo FROM usuarios WHERE id = ?`, [req.userId], (err, user) => {
        if (user.saldo < valor) return res.status(400).json({ erro: "Saldo insuficiente." });
        db.run(`UPDATE usuarios SET saldo = saldo - ?, tempo_restante = ?, plano_ativo = ? WHERE id = ?`, [valor, minutos, plano, req.userId], function() {
            res.json({ mensagem: "Pagamento aprovado!" });
        });
    });
});

// --- ROTA DE CONTATO (PÚBLICA) ---
app.post('/api/contato', (req, res) => {
    const { nome, email, mensagem } = req.body;
    if (!nome || !email || !mensagem) return res.status(400).json({ erro: "Preencha todos os campos." });

    db.run(`INSERT INTO mensagens (nome, email, mensagem) VALUES (?, ?, ?)`, [nome, email, mensagem], function(err) {
        if (err) return res.status(500).json({ erro: "Erro ao salvar mensagem." });
        res.json({ mensagem: "Mensagem enviada com sucesso! Responderemos no seu e-mail." });
    });
});

// --- ADMINISTRAÇÃO ---
const SENHA_ADMIN = "ComandoGame123";
app.post('/api/admin/login', (req, res) => {
    if (req.body.senha !== SENHA_ADMIN) return res.status(401).json({ erro: "Chave incorreta." });
    const token = jwt.sign({ role: 'admin' }, JWT_SECRET, { expiresIn: '2h' });
    res.json({ token });
});
function verificarAdmin(req, res, next) {
    const token = req.headers['authorization']?.split(' ')[1];
    if (!token) return res.status(401).json({ erro: "Acesso negado." });
    jwt.verify(token, JWT_SECRET, (err) => { if (err) return res.status(403).json({ erro: "Sessão expirada." }); next(); });
}
app.post('/api/admin/usuarios', verificarAdmin, (req, res) => {
    db.all(`SELECT id, codigo_conta, nome, email, saldo, banido, ip, visitor_id, plano_ativo, tempo_restante FROM usuarios`, [], (err, rows) => res.json({ usuarios: rows }));
});
app.post('/api/admin/saldo', verificarAdmin, (req, res) => {
    db.run(`UPDATE usuarios SET saldo = saldo + ? WHERE id = ?`, [req.body.valor, req.body.idUsuario], () => res.json({ mensagem: "Saldo atualizado!" }));
});
app.post('/api/admin/banir', verificarAdmin, (req, res) => {
    const status = req.body.banir ? 1 : 0;
    db.get(`SELECT ip, visitor_id FROM usuarios WHERE id = ?`, [req.body.idUsuario], (err, row) => {
        db.run(`UPDATE usuarios SET banido = ? WHERE id = ?`, [status, req.body.idUsuario], () => {
            if (req.body.banir) {
                db.run(`INSERT OR IGNORE INTO banidos_ip (ip) VALUES (?)`, [row.ip]);
                db.run(`INSERT OR IGNORE INTO banidos_hardware (visitor_id) VALUES (?)`, [row.visitor_id]);
            } else {
                db.run(`DELETE FROM banidos_ip WHERE ip = ?`, [row.ip]);
                db.run(`DELETE FROM banidos_hardware WHERE visitor_id = ?`, [row.visitor_id]);
            }
            res.json({ mensagem: "Ação aplicada!" });
        });
    });
});
app.post('/api/admin/tempo', verificarAdmin, (req, res) => {
    const { idUsuario, minutos, plano } = req.body;
    if (minutos === 0) db.run(`UPDATE usuarios SET tempo_restante = 0, plano_ativo = 'Nenhum' WHERE id = ?`, [idUsuario], () => res.json({ mensagem: "Zerado!" }));
    else db.run(`UPDATE usuarios SET tempo_restante = tempo_restante + ?, plano_ativo = ? WHERE id = ?`, [minutos, plano, idUsuario], () => res.json({ mensagem: "Tempo adicionado!" }));
});
app.post('/api/admin/mensagens', verificarAdmin, (req, res) => {
    db.all(`SELECT * FROM mensagens ORDER BY data_envio DESC`, [], (err, rows) => res.json({ mensagens: rows }));
});

// --- SOCKET E SERVIDOR ---
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });
app.use(express.static(path.join(__dirname, '../')));
io.on('connection', (socket) => { socket.on('iniciar_maquina', () => setTimeout(() => socket.emit('maquina_pronta'), 3000)); });

server.listen(3000, () => console.log('🛡️ Servidor BIG-Room rodando na porta 3000'));
