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
const axios = require('axios');
const { FingerprintServerApiClient, Region } = require('@fingerprint/node-sdk');

const app = express();
app.set('trust proxy', 1);
app.use(cors({ 
    origin: ['https://big-room-site.onrender.com', 'http://127.0.0.1:5500', 'http://localhost:5500', 'http://localhost:3000'],
    methods: ['GET', 'POST']
})); 
app.use(express.json({ limit: '10kb' })); 
app.use(helmet({ contentSecurityPolicy: false }));
app.disable('x-powered-by');

// --- CONFIGURAÇÃO DE CHAVES DE API ---
// COLOQUE AS SUAS CHAVES AQUI (Depois de criar as contas)
const FP_SECRET_API_KEY = "SUA_SECRET_KEY_FINGERPRINT_AQUI"; 
const IPQS_API_KEY = "SUA_CHAVE_IPQS_AQUI"; 

const fpClient = new FingerprintServerApiClient({ apiKey: FP_SECRET_API_KEY, region: Region.Global });

// Limiter para evitar spam de requisições
const limiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 100 });
app.use('/api/', limiter);

// --- BANCO DE DADOS ---
const db = new sqlite3.Database('./bigroom.db', (err) => {
    if (!err) {
        console.log("📦 Banco de dados conectado.");
        db.run(`CREATE TABLE IF NOT EXISTS usuarios (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            codigo_conta TEXT UNIQUE,
            nome TEXT NOT NULL,
            email TEXT UNIQUE NOT NULL,
            senha TEXT NOT NULL,
            saldo REAL DEFAULT 0.00,
            banido INTEGER DEFAULT 0,
            ip TEXT DEFAULT 'Desconhecido',
            visitor_id TEXT DEFAULT 'Desconhecido',
            plano_ativo TEXT DEFAULT 'Nenhum',
            tempo_restante INTEGER DEFAULT 0
        )`);
        db.run(`CREATE TABLE IF NOT EXISTS banidos_ip (ip TEXT PRIMARY KEY)`);
        db.run(`CREATE TABLE IF NOT EXISTS banidos_hardware (visitor_id TEXT PRIMARY KEY)`);
    }
});

// --- FUNÇÕES DE SEGURANÇA ---
function checarHardwareBanido(visitorId) {
    return new Promise((resolve) => {
        if (!visitorId || visitorId === 'Desconhecido') return resolve(false);
        db.get(`SELECT visitor_id FROM banidos_hardware WHERE visitor_id = ?`, [visitorId], (err, row) => {
            resolve(!!row);
        });
    });
}

async function checarIPSuspeito(ip) {
    if (IPQS_API_KEY === "SUA_CHAVE_IPQS_AQUI") return false; 
    try {
        const response = await axios.get(`https://ipqualityscore.com/api/json/ip/${IPQS_API_KEY}/${ip}`);
        return (response.data.proxy || response.data.vpn || response.data.tor);
    } catch (error) { return false; }
}

function gerarCodigo() {
    const caracteres = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let codigo = 'BR-';
    for (let i = 0; i < 5; i++) codigo += caracteres.charAt(Math.floor(Math.random() * caracteres.length));
    return codigo;
}

// --- ROTAS DO USUÁRIO ---
app.post('/api/cadastro', async (req, res) => {
    const { nome, email, senha, visitorId } = req.body;
    const ip = req.ip || req.connection.remoteAddress;

    if (!nome || !email || !senha) return res.status(400).json({ erro: "Preencha todos os campos." });

    // 1. Verifica IP Banido
    db.get(`SELECT ip FROM banidos_ip WHERE ip = ?`, [ip], async (err, ipRow) => {
        if (ipRow) return res.status(403).json({ erro: "Seu IP está bloqueado no BIG-Room." });

        // 2. Verifica Hardware Banido
        const hardwareBanido = await checarHardwareBanido(visitorId);
        if (hardwareBanido) return res.status(403).json({ erro: "Este dispositivo está permanentemente suspenso." });

        // 3. Verifica VPN (IPQS)
        const ipSuspeito = await checarIPSuspeito(ip);
        if (ipSuspeito) return res.status(403).json({ erro: "O uso de VPN/Proxy é proibido para criar contas." });

        try {
            const senhaHash = await bcrypt.hash(senha, 10);
            const codigoConta = gerarCodigo();

            db.run(`INSERT INTO usuarios (codigo_conta, nome, email, senha, saldo, ip, visitor_id) VALUES (?, ?, ?, ?, ?, ?, ?)`, 
                [codigoConta, nome, email, senhaHash, 5.00, ip, visitorId || 'Desconhecido'],
                function(err) {
                    if (err) {
                        if (err.message.includes('UNIQUE constraint failed: usuarios.email')) {
                            return res.status(400).json({ erro: "Este e-mail já está cadastrado." });
                        }
                        return res.status(500).json({ erro: "Erro interno." });
                    }
                    res.json({ mensagem: "Cadastro realizado!", usuario: { id: this.lastID, codigo_conta: codigoConta, nome, saldo: 5.00 } });
                }
            );
        } catch (error) {
            res.status(500).json({ erro: "Erro no servidor." });
        }
    });
});

app.post('/api/login', (req, res) => {
    const { email, senha, visitorId } = req.body;
    const ip = req.ip || req.connection.remoteAddress;

    db.get(`SELECT ip FROM banidos_ip WHERE ip = ?`, [ip], async (err, ipRow) => {
        if (ipRow) return res.status(403).json({ erro: "Seu IP está bloqueado." });

        const hardwareBanido = await checarHardwareBanido(visitorId);
        if (hardwareBanido) return res.status(403).json({ erro: "Este dispositivo está banido." });

        db.get(`SELECT * FROM usuarios WHERE email = ?`, [email], async (err, usuario) => {
            if (err || !usuario) return res.status(401).json({ erro: "E-mail ou senha incorretos." });
            if (usuario.banido === 1) return res.status(403).json({ erro: "Sua conta foi banida." });

            const senhaValida = await bcrypt.compare(senha, usuario.senha);
            if (!senhaValida) return res.status(401).json({ erro: "E-mail ou senha incorretos." });
            
            res.json({ mensagem: "Login realizado!", usuario: { id: usuario.id, codigo_conta: usuario.codigo_conta, nome: usuario.nome, saldo: usuario.saldo, plano_ativo: usuario.plano_ativo, tempo_restante: usuario.tempo_restante } });
        });
    });
});

app.get('/api/saldo/:id', (req, res) => {
    db.get(`SELECT saldo, banido, tempo_restante FROM usuarios WHERE id = ?`, [req.params.id], (err, row) => {
        if (err || !row) return res.status(404).json({ erro: "Usuário não encontrado." });
        if (row.banido === 1) return res.status(403).json({ erro: "BANIDO" });
        res.json({ saldo: row.saldo, tempo_restante: row.tempo_restante });
    });
});

app.post('/api/descontar', (req, res) => {
    const { idUsuario, valor } = req.body;
    db.get(`SELECT saldo FROM usuarios WHERE id = ?`, [idUsuario], (err, user) => {
        if (err || !user) return res.status(404).json({ erro: "Usuário não encontrado." });
        if (user.saldo < valor) return res.status(400).json({ erro: "Saldo insuficiente." });
        
        const novoSaldo = user.saldo - valor;
        db.run(`UPDATE usuarios SET saldo = ? WHERE id = ?`, [novoSaldo, idUsuario], function(err) {
            if (err) return res.status(500).json({ erro: "Erro." });
            res.json({ mensagem: "Pagamento aprovado!", novoSaldo: novoSaldo });
        });
    });
});

// --- ADMIN ---
const JWT_SECRET = "bigroom_chave_secreta_super_segura_2026";
const SENHA_ADMIN_CRIACAO = "ComandoGame123";

app.post('/api/admin/login', (req, res) => {
    const { senha } = req.body;
    if (senha !== SENHA_ADMIN_CRIACAO) return res.status(401).json({ erro: "Chave incorreta." });
    const token = jwt.sign({ role: 'admin' }, JWT_SECRET, { expiresIn: '2h' });
    res.json({ token: token });
});

function verificarToken(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    if (!token) return res.status(401).json({ erro: "Acesso negado." });
    jwt.verify(token, JWT_SECRET, (err) => {
        if (err) return res.status(403).json({ erro: "Sessão expirada." });
        next(); 
    });
}

app.post('/api/admin/usuarios', verificarToken, (req, res) => {
    db.all(`SELECT id, codigo_conta, nome, email, saldo, banido, ip, visitor_id, plano_ativo, tempo_restante FROM usuarios`, [], (err, rows) => {
        if (err) return res.status(500).json({ erro: "Erro." });
        res.json({ usuarios: rows });
    });
});

app.post('/api/admin/saldo', verificarToken, (req, res) => {
    const { idUsuario, valor } = req.body;
    db.run(`UPDATE usuarios SET saldo = saldo + ? WHERE id = ?`, [valor, idUsuario], function(err) {
        if (err) return res.status(500).json({ erro: "Erro." });
        res.json({ mensagem: "Saldo atualizado!" });
    });
});

app.post('/api/admin/banir', verificarToken, (req, res) => {
    const { idUsuario, banir } = req.body;
    const statusBanido = banir ? 1 : 0;
    
    db.get(`SELECT ip, visitor_id FROM usuarios WHERE id = ?`, [idUsuario], (err, row) => {
        if (err || !row) return res.status(404).json({ erro: "Usuário não encontrado." });
        
        db.run(`UPDATE usuarios SET banido = ? WHERE id = ?`, [statusBanido, idUsuario], function(err) {
            if (err) return res.status(500).json({ erro: "Erro ao banir." });
            
            if (banir) {
                db.run(`INSERT OR IGNORE INTO banidos_ip (ip) VALUES (?)`, [row.ip]);
                db.run(`INSERT OR IGNORE INTO banidos_hardware (visitor_id) VALUES (?)`, [row.visitor_id]);
                res.json({ mensagem: "Usuário, IP e Dispositivo banidos!" });
            } else {
                db.run(`DELETE FROM banidos_ip WHERE ip = ?`, [row.ip]);
                db.run(`DELETE FROM banidos_hardware WHERE visitor_id = ?`, [row.visitor_id]);
                res.json({ mensagem: "Usuário e Dispositivo desbanidos!" });
            }
        });
    });
});

app.post('/api/admin/tempo', verificarToken, (req, res) => {
    const { idUsuario, minutos, plano } = req.body;
    if (minutos === 0) {
        db.run(`UPDATE usuarios SET tempo_restante = 0, plano_ativo = 'Nenhum' WHERE id = ?`, [idUsuario], function(err) {
            if (err) return res.status(500).json({ erro: "Erro." });
            res.json({ mensagem: "Sessão encerrada!" });
        });
    } else {
        db.run(`UPDATE usuarios SET tempo_restante = tempo_restante + ?, plano_ativo = ? WHERE id = ?`, [minutos, plano, idUsuario], function(err) {
            if (err) return res.status(500).json({ erro: "Erro." });
            res.json({ mensagem: `Adicionado ${minutos} min!` });
        });
    }
});

// --- SERVIDOR ---
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });
app.use(express.static(path.join(__dirname, '../')));

io.on('connection', (socket) => {
    socket.on('iniciar_maquina', () => {
        setTimeout(() => {
            socket.emit('maquina_pronta', { ip: '127.0.0.1', porta: '47989' });
        }, 3000);
    });
});

server.listen(3000, () => {
    console.log('🛡️ Servidor BIG-Room BLINDADO com Fingerprint rodando em http://localhost:3000');
});
