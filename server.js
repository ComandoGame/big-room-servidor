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

const app = express();

// --- SEGURANÇA E PROXY ---
app.set('trust proxy', 1);
app.use(cors()); 
app.use(express.json()); 
app.use(helmet({ contentSecurityPolicy: false })); 
app.disable('x-powered-by');

const limiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 100, message: "Muitas requisições." });
app.use('/api/', limiter);

// --- BANCO DE DADOS ---
const db = new sqlite3.Database('./bigroom.db', (err) => {
    if (!err) {
        console.log("📦 Banco de dados conectado.");
        db.run(`CREATE TABLE IF NOT EXISTS usuarios (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            nome TEXT NOT NULL,
            email TEXT UNIQUE NOT NULL,
            senha TEXT NOT NULL,
            saldo REAL DEFAULT 0.00,
            banido INTEGER DEFAULT 0
        )`);
    }
});

// --- ROTAS DE API DO USUÁRIO ---
app.post('/api/cadastro', async (req, res) => {
    const { nome, email, senha } = req.body;
    if (!nome || !email || !senha) return res.status(400).json({ erro: "Preencha todos os campos." });

    try {
        const senhaHash = await bcrypt.hash(senha, 10);
        db.run(`INSERT INTO usuarios (nome, email, senha, saldo) VALUES (?, ?, ?, ?)`, 
            [nome, email, senhaHash, 5.00],
            function(err) {
                if (err) return res.status(400).json({ erro: "E-mail já cadastrado." });
                res.json({ mensagem: "Cadastro realizado!", usuario: { id: this.lastID, nome, saldo: 5.00 } });
            }
        );
    } catch (error) {
        res.status(500).json({ erro: "Erro interno no servidor." });
    }
});

app.post('/api/login', (req, res) => {
    const { email, senha } = req.body;
    db.get(`SELECT * FROM usuarios WHERE email = ?`, [email], async (err, usuario) => {
        if (err || !usuario) return res.status(401).json({ erro: "E-mail ou senha incorretos." });
        
        if (usuario.banido === 1) {
            return res.status(403).json({ erro: "Sua conta foi banida por violar os termos de uso do BIG-Room." });
        }

        const senhaValida = await bcrypt.compare(senha, usuario.senha);
        if (!senhaValida) return res.status(401).json({ erro: "E-mail ou senha incorretos." });
        
        res.json({ mensagem: "Login realizado!", usuario: { id: usuario.id, nome: usuario.nome, saldo: usuario.saldo } });
    });
});

// --- SISTEMA DE SEGURANÇA DO ADMIN (JWT) ---
const JWT_SECRET = "bigroom_chave_secreta_super_segura_2026";
const SENHA_ADMIN_CRIACAO = "ComandoGame123";

app.post('/api/admin/login', (req, res) => {
    const { senha } = req.body;
    if (senha !== SENHA_ADMIN_CRIACAO) {
        return res.status(401).json({ erro: "Chave de acesso incorreta." });
    }
    const token = jwt.sign({ role: 'admin', nome: 'ComandoGame' }, JWT_SECRET, { expiresIn: '2h' });
    res.json({ mensagem: "Acesso liberado", token: token });
});

function verificarToken(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) return res.status(401).json({ erro: "Acesso negado. Token não fornecido." });

    jwt.verify(token, JWT_SECRET, (err, decoded) => {
        if (err) return res.status(403).json({ erro: "Sessão expirada ou Token inválido." });
        req.admin = decoded;
        next(); 
    });
}

// --- ROTAS PROTEGIDAS ---
app.post('/api/admin/usuarios', verificarToken, (req, res) => {
    db.all(`SELECT id, nome, email, saldo, banido FROM usuarios`, [], (err, rows) => {
        if (err) return res.status(500).json({ erro: "Erro ao buscar usuários." });
        res.json({ usuarios: rows });
    });
});

app.post('/api/admin/saldo', verificarToken, (req, res) => {
    const { idUsuario, valor } = req.body;
    db.run(`UPDATE usuarios SET saldo = saldo + ? WHERE id = ?`, [valor, idUsuario], function(err) {
        if (err) return res.status(500).json({ erro: "Erro ao atualizar saldo." });
        res.json({ mensagem: "Saldo atualizado com sucesso!" });
    });
});

app.post('/api/admin/banir', verificarToken, (req, res) => {
    const { idUsuario, banir } = req.body;
    const statusBanido = banir ? 1 : 0;
    db.run(`UPDATE usuarios SET banido = ? WHERE id = ?`, [statusBanido, idUsuario], function(err) {
        if (err) return res.status(500).json({ erro: "Erro ao banir usuário." });
        res.json({ mensagem: banir ? "Usuário banido!" : "Usuário desbanido!" });
    });
});

// --- SOCKET.IO E SERVIDOR ---
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
    console.log('🛡️ Servidor BIG-Room com JWT rodando em http://localhost:3000');
});
