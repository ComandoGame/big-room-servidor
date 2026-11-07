const express = require('express');
const http = require('http');
const { Server } = require("socket.io");
const path = require('path');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcryptjs');

const app = express();
app.use(express.json()); 

// --- SEGURANÇA ---
app.use(helmet({ contentSecurityPolicy: false })); 
app.disable('x-powered-by');
const limiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 50, message: "Muitas requisições." });
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
            saldo REAL DEFAULT 0.00
        )`);
    }
});

// --- ROTAS DE API ---
app.post('/api/cadastro', async (req, res) => {
    const { nome, email, senha } = req.body;
    if (!nome || !email || !senha) return res.status(400).json({ erro: "Preencha todos os campos." });

    try {
        const senhaHash = await bcrypt.hash(senha, 10);
        db.run(`INSERT INTO usuarios (nome, email, senha, saldo) VALUES (?, ?, ?, ?)`, 
            [nome, email, senhaHash, 5.00], // Bônus de R$ 5,00
            function(err) {
                if (err) return res.status(400).json({ erro: "E-mail já cadastrado." });
                res.json({ mensagem: "Cadastro realizado!", usuario: { id: this.lastID, nome, saldo: 5.00 } });
            }
        );
    } catch (error) {
        res.status(500).json({ erro: "Erro interno." });
    }
});

app.post('/api/login', (req, res) => {
    const { email, senha } = req.body;
    db.get(`SELECT * FROM usuarios WHERE email = ?`, [email], async (err, usuario) => {
        if (err || !usuario) return res.status(401).json({ erro: "E-mail ou senha incorretos." });
        const senhaValida = await bcrypt.compare(senha, usuario.senha);
        if (!senhaValida) return res.status(401).json({ erro: "E-mail ou senha incorretos." });
        res.json({ mensagem: "Login realizado!", usuario: { id: usuario.id, nome: usuario.nome, saldo: usuario.saldo } });
    });
});

// Rota para checar saldo
app.get('/api/saldo/:id', (req, res) => {
    db.get(`SELECT saldo FROM usuarios WHERE id = ?`, [req.params.id], (err, row) => {
        if (err || !row) return res.status(404).json({ erro: "Usuário não encontrado." });
        res.json({ saldo: row.saldo });
    });
});

// --- JOGO (SOCKET) ---
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
    console.log('🛡️ Servidor BIG-Room rodando em http://localhost:3000');
});