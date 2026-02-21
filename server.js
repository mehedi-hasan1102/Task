const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const { Sequelize, DataTypes, Op } = require('sequelize');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
require('dotenv').config();

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

const JWT_SECRET = process.env.JWT_SECRET || 'eduCore_secret_key_2026';

app.use(cors());
app.use(express.json());
app.use(express.static(__dirname)); // Serve all HTML/JS/CSS files
app.get('/', (req, res) => res.send('Server is running! Access the app via index.html'));

const mysql = require('mysql2/promise');

// === DATABASE CONNECTION ===
async function initializeDatabase() {
    try {
        const connection = await mysql.createConnection({
            host: process.env.DB_HOST || 'localhost',
            user: process.env.DB_USER || 'root',
            password: process.env.DB_PASSWORD || '',
        });
        await connection.query(`CREATE DATABASE IF NOT EXISTS \`${process.env.DB_NAME || 'school_system'}\`;`);
        await connection.end();
    } catch (err) {
        console.warn('⚠️ Database Initialization Warning:', err.message);
    }
}

let sequelize;

// --- API ROUTES (Registered immediately to avoid 404s when DB is offline) ---
app.post('/api/login', async (req, res) => {
    const { username, password } = req.body;
    try {
        // Check Admin first (always works even if DB is offline)
        const adminEmail = process.env.ADMIN_USERNAME || 'Apexiums@school.com';
        const adminPass = process.env.ADMIN_PASSWORD || 'Apexiums1717';

        if (username === adminEmail && password === adminPass) {
            const token = jwt.sign({ id: 'admin', role: 'Admin' }, JWT_SECRET, { expiresIn: '1d' });
            return res.json({ success: true, token, user: { id: 'admin', fullName: 'Administrator', role: 'Admin', username: adminEmail } });
        }

        if (!sequelize) {
            return res.status(503).json({ success: false, message: 'Database is offline. Only Admin can log in.' });
        }

        const Student = sequelize.models.Student;
        const Teacher = sequelize.models.Teacher;

        // Check Students
        let user = await Student.findOne({ where: { username } });
        let role = 'Student';

        if (!user) {
            user = await Teacher.findOne({ where: { username } });
            role = 'Teacher';
        }

        if (user) {
            const isMatch = await bcrypt.compare(password, user.password);
            if (isMatch) {
                const token = jwt.sign({ id: user.id, role }, JWT_SECRET, { expiresIn: '1d' });
                return res.json({
                    success: true,
                    token,
                    user: { id: user.id, fullName: user.fullName, role, username: user.username }
                });
            }
        }
        res.status(401).json({ success: false, message: 'Invalid credentials' });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

app.get('/api/students', async (req, res) => {
    if (!sequelize) return res.status(503).json({ error: 'Database offline' });
    try {
        const students = await sequelize.models.Student.findAll();
        res.json(students);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/students', async (req, res) => {
    if (!sequelize) return res.status(503).json({ error: 'Database offline' });
    try {
        const data = Array.isArray(req.body) ? req.body : [req.body];
        for (let item of data) {
            if (item.password && !item.password.startsWith('$2a$')) {
                item.password = await bcrypt.hash(item.password, 10);
            }
            await sequelize.models.Student.upsert(item);
        }
        const allStudents = await sequelize.models.Student.findAll();
        io.emit('students_update', allStudents);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/teachers', async (req, res) => {
    if (!sequelize) return res.status(503).json({ error: 'Database offline' });
    try {
        const teachers = await sequelize.models.Teacher.findAll();
        res.json(teachers);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/teachers', async (req, res) => {
    if (!sequelize) return res.status(503).json({ error: 'Database offline' });
    try {
        const data = Array.isArray(req.body) ? req.body : [req.body];
        for (let item of data) {
            if (item.password && !item.password.startsWith('$2a$')) {
                item.password = await bcrypt.hash(item.password, 10);
            }
            await sequelize.models.Teacher.upsert(item);
        }
        const allTeachers = await sequelize.models.Teacher.findAll();
        io.emit('teachers_update', allTeachers);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/notices', async (req, res) => {
    if (!sequelize) return res.status(503).json({ error: 'Database offline' });
    try {
        const notices = await sequelize.models.Notice.findAll({
            order: [['date', 'DESC'], ['createdAt', 'DESC']]
        });
        res.json(notices);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/notices', async (req, res) => {
    if (!sequelize) return res.status(503).json({ error: 'Database offline' });
    try {
        const data = Array.isArray(req.body) ? req.body : [req.body];
        for (let item of data) {
            if (!item.id) item.id = `${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
            await sequelize.models.Notice.upsert(item);
        }
        const notices = await sequelize.models.Notice.findAll({
            order: [['date', 'DESC'], ['createdAt', 'DESC']]
        });
        io.emit('notices_update', notices);
        res.json({ success: true, notices });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.put('/api/notices/:id', async (req, res) => {
    if (!sequelize) return res.status(503).json({ error: 'Database offline' });
    try {
        const id = req.params.id;
        const notice = await sequelize.models.Notice.findByPk(id);
        if (!notice) return res.status(404).json({ error: 'Notice not found' });

        await notice.update(req.body);
        const notices = await sequelize.models.Notice.findAll({
            order: [['date', 'DESC'], ['createdAt', 'DESC']]
        });
        io.emit('notices_update', notices);
        res.json({ success: true, notice });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.delete('/api/notices/:id', async (req, res) => {
    if (!sequelize) return res.status(503).json({ error: 'Database offline' });
    try {
        const id = req.params.id;
        await sequelize.models.Notice.destroy({ where: { id } });
        const notices = await sequelize.models.Notice.findAll({
            order: [['date', 'DESC'], ['createdAt', 'DESC']]
        });
        io.emit('notices_update', notices);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

function defineModels(sequelize) {
    return sequelize.define('Student', {
        id: { type: DataTypes.STRING, primaryKey: true },
        fullName: DataTypes.STRING,
        fatherName: DataTypes.STRING,
        classGrade: DataTypes.STRING,
        parentPhone: DataTypes.STRING,
        rollNo: DataTypes.STRING,
        formB: DataTypes.STRING,
        monthlyFee: DataTypes.STRING,
        feeFrequency: DataTypes.STRING,
        feesStatus: { type: DataTypes.STRING, defaultValue: 'Pending' },
        username: { type: DataTypes.STRING, unique: true },
        password: { type: DataTypes.STRING },
        role: { type: DataTypes.STRING, defaultValue: 'Student' }
    });
}

function defineTeacherModel(sequelize) {
    return sequelize.define('Teacher', {
        id: { type: DataTypes.STRING, primaryKey: true },
        fullName: DataTypes.STRING,
        fatherName: DataTypes.STRING,
        cnic: DataTypes.STRING,
        phone: DataTypes.STRING,
        address: DataTypes.TEXT,
        qualification: DataTypes.STRING,
        gender: DataTypes.STRING,
        subject: DataTypes.STRING,
        salary: DataTypes.STRING,
        username: { type: DataTypes.STRING, unique: true },
        password: { type: DataTypes.STRING },
        role: { type: DataTypes.STRING, defaultValue: 'Teacher' }
    });
}

function defineNoticeModel(sequelize) {
    return sequelize.define('Notice', {
        id: { type: DataTypes.STRING, primaryKey: true },
        title: { type: DataTypes.STRING, allowNull: false },
        description: { type: DataTypes.TEXT, allowNull: false },
        date: { type: DataTypes.DATEONLY, allowNull: false },
        status: { type: DataTypes.STRING, defaultValue: 'Active' }
    });
}

async function startServer() {
    const PORT = process.env.PORT || 3000;

    server.listen(PORT, '0.0.0.0', () => {
        console.log(`\x1b[32m✔\x1b[0m Real-Time SQL Server running on all interfaces at port ${PORT}`);
    }).on('error', (err) => {
        if (err.code === 'EADDRINUSE') {
            console.error(`\x1b[31m✘\x1b[0m Port ${PORT} is already in use. Please stop the other process or change the PORT in .env`);
        } else {
            console.error(`\x1b[31m✘\x1b[0m Server Error:`, err.message);
        }
    });

    try {
        console.log('🔄 Initializing Database...');
        await initializeDatabase();

        sequelize = new Sequelize(
            process.env.DB_NAME || 'school_system',
            process.env.DB_USER || 'root',
            process.env.DB_PASSWORD || '',
            {
                host: process.env.DB_HOST || 'localhost',
                dialect: 'mysql',
                logging: false
            }
        );

        defineModels(sequelize);
        defineTeacherModel(sequelize);
        defineNoticeModel(sequelize);

        await sequelize.sync();
        console.log('\x1b[32m✔\x1b[0m Database Synced Successfully');
    } catch (err) {
        console.error('\x1b[31m✘\x1b[0m Database Connection Error:', err.message);
        console.log('ℹ️  Ensure MySQL is running and credentials in .env are correct.');
    }
}

startServer();
