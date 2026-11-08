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
app.set('trust proxy', 1);
app.use(cors()); 
app.use(express.json()); 
app.use(helmet({ contentSecurityPolicy: false })); 
app.disable('x-powered-by');

const limiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 100 });
app.use('/api/', limiter);

// --- BANCO DE DADOS (Nova coluna: codigo_conta) ---
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
            banido INTEGER DEFAULT 0
        )`);
    }
});

// Memória temporária para limitar criação por IP (1 por semana)
const ipsCadastrados = new Map(); 

// Função para gerar código tipo "BR-XXXXX"
function gerarCodigo() {
    const caracteres = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let codigo = 'BR-';
    for (let i = 0; i < 5; i++) {
        codigo += caracteres.charAt(Math.floor(Math.random() * caracteres.length));
    }
    return codigo;
}

// --- ROTA DE CADASTRO (Com validações) ---
app.post('/api/cadastro', async (req, res) => {
    const { nome, email, senha } = req.body;
    const ip = req.ip;

    // 1. Validação básica
    if (!nome || !email || !senha) return res.status(400).json({ erro: "Preencha todos os campos." });

    // 2. Bloqueia domínios falsos comuns
    const dominiosPermitidos = ['gmail.com', 'hotmail.com', 'outlook.com', 'yahoo.com', 'icloud.com'];
    const dominio = email.split('@')[1];
    if (!dominiosPermitidos.includes(dominio)) {
        return res.status(400).json({ erro: "Por favor, use um e-mail válido (Gmail, Hotmail, Outlook, etc)." });
    }

    // 3. Verifica limite de 1 conta por semana por IP
    const ultimoCadastro = ipsCadastrados.get(ip);
    if (ultimoCadastro && (Date.now() - ultimoCadastro < 7 * 24 * 60 * 60 * 1000)) {
        return res.status(429).json({ erro: "Você já criou uma conta recentemente. Aguarde 7 dias para criar outra." });
    }

    try {
        const senhaHash = await bcrypt.hash(senha, 10);
        const codigoConta = gerarCodigo();

        db.run(`INSERT INTO usuarios (codigo_conta, nome, email, senha, saldo) VALUES (?, ?, ?, ?, ?)`, 
            [codigoConta, nome, email, senhaHash, 5.00],
            function(err) {
                if (err) {
                    if (err.message.includes('UNIQUE constraint failed: usuarios.email')) {
                        return res.status(400).json({ erro: "Este e-mail já está cadastrado." });
                    }
                    return res.status(500).json({ erro: "Erro interno ao criar conta." });
                }
                
                // Salva o IP no cache para bloquear novas contas por 7 dias
                ipsCadastrados.set(ip, Date.now());

                res.json({ 
                    mensagem: "Cadastro realizado!", 
                    usuario: { id: this.lastID, codigo_conta: codigoConta, nome, saldo: 5.00 } 
                });
            }
        );
    } catch (error) {
        res.status(500).json({ erro: "Erro no servidor." });
    }
});

// --- ROTA DE LOGIN (Retorna o código da conta também) ---
app.post('/api/login', (req, res) => {
    const { email, senha } = req.body;
    db.get(`SELECT * FROM usuarios WHERE email = ?`, [email], async (err, usuario) => {
        if (err || !usuario) return res.status(401).json({ erro: "E-mail ou senha incorretos." });
        if (usuario.banido === 1) return res.status(403).json({ erro: "Sua conta foi banida." });

        const senhaValida = await bcrypt.compare(senha, usuario.senha);
        if (!senhaValida) return res.status(401).json({ erro: "E-mail ou senha incorretos." });
        
        res.json({ 
            mensagem: "Login realizado!", 
            usuario: { 
                id: usuario.id, 
                codigo_conta: usuario.codigo_conta, 
                nome: usuario.nome, 
                saldo: usuario.saldo 
            } 
        });
    });
});

// Rota de saldo (Verifica banimento)
app.get('/api/saldo/:id', (req, res) => {
    db.get(`SELECT saldo, banido FROM usuarios WHERE id = ?`, [req.params.id], (err, row) => {
        if (err || !row) return res.status(404).json({ erro: "Usuário não encontrado." });
        if (row.banido === 1) return res.status(403).json({ erro: "BANIDO" });
        res.json({ saldo: row.saldo });
    });
});

// Rota para descontar saldo
app.post('/api/descontar', (req, res) => {
    const { idUsuario, valor } = req.body;
    db.get(`SELECT saldo FROM usuarios WHERE id = ?`, [idUsuario], (err, user) => {
        if (err || !user) return res.status(404).json({ erro: "Usuário não encontrado." });
        if (user.saldo < valor) return res.status(400).json({ erro: "Saldo insuficiente." });
        
        const novoSaldo = user.saldo - valor;
        db.run(`UPDATE usuarios SET saldo = ? WHERE id = ?`, [novoSaldo, idUsuario], function(err) {
            if (err) return res.status(500).json({ erro: "Erro ao descontar." });
            res.json({ mensagem: "Pagamento aprovado!", novoSaldo: novoSaldo });
        });
    });
});

// --- ADMINISTRAÇÃO (JWT) ---
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
    db.all(`SELECT id, codigo_conta, nome, email, saldo, banido FROM usuarios`, [], (err, rows) => {
        if (err) return res.status(500).json({ erro: "Erro ao buscar." });
        res.json({ usuarios: rows });
    });
});

app.post('/api/admin/saldo', verificarToken, (req, res) => {
    const { idUsuario, valor } = req.body;
    db.run(`UPDATE usuarios SET saldo = saldo + ? WHERE id = ?`, [valor, idUsuario], function(err) {
        if (err) return res.status(500).json({ erro: "Erro ao atualizar." });
        res.json({ mensagem: "Saldo atualizado!" });
    });
});

app.post('/api/admin/banir', verificarToken, (req, res) => {
    const { idUsuario, banir } = req.body;
    const statusBanido = banir ? 1 : 0;
    db.run(`UPDATE usuarios SET banido = ? WHERE id = ?`, [statusBanido, idUsuario], function(err) {
        if (err) return res.status(500).json({ erro: "Erro ao banir." });
        res.json({ mensagem: banir ? "Usuário banido!" : "Usuário desbanido!" });
    });
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
    console.log('🛡️ Servidor BIG-Room com Código de Conta rodando em http://localhost:3000');
});
