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
app.use(cors({ origin: '*' })); 
app.use(express.json()); 
app.use(helmet({ contentSecurityPolicy: false }));
app.disable('x-powered-by');

const limiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 100 });
app.use('/api/', limiter);

// --- BANCO DE DADOS ---
const db = new sqlite3.Database('./bigroom.db', (err) => {
    if (!err) {
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
            tempo_restante INTEGER DEFAULT 0,
            ultimo_teste_gratis INTEGER DEFAULT 0
        )`);
        db.run(`CREATE TABLE IF NOT EXISTS banidos_ip (ip TEXT PRIMARY KEY)`);
        db.run(`CREATE TABLE IF NOT EXISTS banidos_hardware (visitor_id TEXT PRIMARY KEY)`);
    }
});

function gerarCodigo() {
    const caracteres = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let codigo = 'BR-';
    for (let i = 0; i < 5; i++) codigo += caracteres.charAt(Math.floor(Math.random() * caracteres.length));
    return codigo;
}

// --- CADASTRO E LOGIN ---
app.post('/api/cadastro', async (req, res) => {
    const { nome, email, senha, visitorId } = req.body;
    const ip = req.ip;
    if (!nome || !email || !senha) return res.status(400).json({ erro: "Preencha tudo." });

    db.get(`SELECT ip FROM banidos_ip WHERE ip = ?`, [ip], async (err, ipRow) => {
        if (ipRow) return res.status(403).json({ erro: "Seu IP está bloqueado." });

        try {
            const senhaHash = await bcrypt.hash(senha, 10);
            const codigoConta = gerarCodigo();
            db.run(`INSERT INTO usuarios (codigo_conta, nome, email, senha, saldo, ip, visitor_id) VALUES (?, ?, ?, ?, ?, ?, ?)`, 
                [codigoConta, nome, email, senhaHash, 5.00, ip, visitorId || 'Desconhecido'],
                function(err) {
                    if (err) return res.status(400).json({ erro: "E-mail já cadastrado." });
                    res.json({ mensagem: "Conta criada!", usuario: { id: this.lastID, codigo_conta: codigoConta, nome, saldo: 5.00 } });
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
        res.json({ mensagem: "Bem-vindo!", usuario: { id: usuario.id, codigo_conta: usuario.codigo_conta, nome: usuario.nome, saldo: usuario.saldo, plano_ativo: usuario.plano_ativo, tempo_restante: usuario.tempo_restante } });
    });
});

// --- SISTEMA DE TESTE GRÁTIS (1 vez por semana) ---
app.post('/api/teste-gratis', (req, res) => {
    const { idUsuario } = req.body;
    const agora = Date.now();
    const umaSemanaEmMs = 7 * 24 * 60 * 60 * 1000;

    db.get(`SELECT ultimo_teste_gratis FROM usuarios WHERE id = ?`, [idUsuario], (err, user) => {
        if (err || !user) return res.status(404).json({ erro: "Usuário não encontrado." });

        const jaPassouUmaSemana = (agora - user.ultimo_teste_gratis) > umaSemanaEmMs;

        if (user.ultimo_teste_gratis !== 0 && !jaPassouUmaSemana) {
            return res.status(403).json({ erro: "Você já usou seu teste grátis nesta semana. Aguarde 7 dias." });
        }

        // Libera 15 minutos de teste
        db.run(`UPDATE usuarios SET tempo_restante = 15, plano_ativo = 'Teste Grátis', ultimo_teste_gratis = ? WHERE id = ?`, [agora, idUsuario], function(err) {
            if (err) return res.status(500).json({ erro: "Erro ao iniciar teste." });
            res.json({ mensagem: "Teste liberado por 15 min!", tempo: 15 });
        });
    });
});

// --- COMPRA DE PLANOS E SALDO ---
app.post('/api/descontar', (req, res) => {
    const { idUsuario, valor, minutos, plano } = req.body;
    db.get(`SELECT saldo FROM usuarios WHERE id = ?`, [idUsuario], (err, user) => {
        if (err || !user) return res.status(404).json({ erro: "Usuário não encontrado." });
        if (user.saldo < valor) return res.status(400).json({ erro: "Saldo insuficiente." });
        
        const novoSaldo = user.saldo - valor;
        db.run(`UPDATE usuarios SET saldo = ?, tempo_restante = ?, plano_ativo = ? WHERE id = ?`, [novoSaldo, minutos, plano, idUsuario], function(err) {
            if (err) return res.status(500).json({ erro: "Erro ao processar." });
            res.json({ mensagem: "Pagamento aprovado!", novoSaldo: novoSaldo });
        });
    });
});

app.get('/api/saldo/:id', (req, res) => {
    db.get(`SELECT saldo, banido, tempo_restante, plano_ativo FROM usuarios WHERE id = ?`, [req.params.id], (err, row) => {
        if (err || !row) return res.status(404).json({ erro: "Usuário não encontrado." });
        if (row.banido === 1) return res.status(403).json({ erro: "BANIDO" });
        res.json({ saldo: row.saldo, tempo_restante: row.tempo_restante, plano_ativo: row.plano_ativo });
    });
});

// --- ADMIN ---
const JWT_SECRET = "bigroom_chave_secreta_super_segura_2026";
const SENHA_ADMIN_CRIACAO = "ComandoGame123";

app.post('/api/admin/login', (req, res) => {
    if (req.body.senha !== SENHA_ADMIN_CRIACAO) return res.status(401).json({ erro: "Chave incorreta." });
    const token = jwt.sign({ role: 'admin' }, JWT_SECRET, { expiresIn: '2h' });
    res.json({ token: token });
});

function verificarToken(req, res, next) {
    const token = req.headers['authorization']?.split(' ')[1];
    if (!token) return res.status(401).json({ erro: "Acesso negado." });
    jwt.verify(token, JWT_SECRET, (err) => {
        if (err) return res.status(403).json({ erro: "Sessão expirada." });
        next(); 
    });
}

app.post('/api/admin/usuarios', verificarToken, (req, res) => {
    db.all(`SELECT id, codigo_conta, nome, email, saldo, banido, ip, visitor_id, plano_ativo, tempo_restante FROM usuarios`, [], (err, rows) => {
        res.json({ usuarios: rows });
    });
});

app.post('/api/admin/saldo', verificarToken, (req, res) => {
    db.run(`UPDATE usuarios SET saldo = saldo + ? WHERE id = ?`, [req.body.valor, req.body.idUsuario], function(err) {
        if (err) return res.status(500).json({ erro: "Erro." });
        res.json({ mensagem: "Saldo atualizado!" });
    });
});

app.post('/api/admin/banir', verificarToken, (req, res) => {
    const { idUsuario, banir } = req.body;
    const status = banir ? 1 : 0;
    db.get(`SELECT ip, visitor_id FROM usuarios WHERE id = ?`, [idUsuario], (err, row) => {
        db.run(`UPDATE usuarios SET banido = ? WHERE id = ?`, [status, idUsuario], function(err) {
            if (banir) {
                db.run(`INSERT OR IGNORE INTO banidos_ip (ip) VALUES (?)`, [row.ip]);
                db.run(`INSERT OR IGNORE INTO banidos_hardware (visitor_id) VALUES (?)`, [row.visitor_id]);
            } else {
                db.run(`DELETE FROM banidos_ip WHERE ip = ?`, [row.ip]);
                db.run(`DELETE FROM banidos_hardware WHERE visitor_id = ?`, [row.visitor_id]);
            }
            res.json({ mensagem: banir ? "Banido!" : "Desbanido!" });
        });
    });
});

app.post('/api/admin/tempo', verificarToken, (req, res) => {
    const { idUsuario, minutos, plano } = req.body;
    if (minutos === 0) {
        db.run(`UPDATE usuarios SET tempo_restante = 0, plano_ativo = 'Nenhum' WHERE id = ?`, [idUsuario], function(err) {
            res.json({ mensagem: "Zerado!" });
        });
    } else {
        db.run(`UPDATE usuarios SET tempo_restante = tempo_restante + ?, plano_ativo = ? WHERE id = ?`, [minutos, plano, idUsuario], function(err) {
            res.json({ mensagem: "Tempo adicionado!" });
        });
    }
});

// --- SOCKET E SERVIDOR ---
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });
app.use(express.static(path.join(__dirname, '../')));

io.on('connection', (socket) => {
    socket.on('iniciar_maquina', () => {
        setTimeout(() => {
            socket.emit('maquina_pronta');
        }, 3000);
    });
});

server.listen(3000, () => console.log('🛡️ Servidor Blindado rodando na porta 3000'));
