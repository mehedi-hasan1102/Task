const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const { Sequelize, DataTypes, Op } = require('sequelize');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

const JWT_SECRET = process.env.JWT_SECRET || 'eduCore_secret_key_2026';

app.use(cors());
app.use(express.json({ limit: '12mb' }));
app.use(express.static(__dirname)); // Serve all HTML/JS/CSS files
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
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
const BANNER_UPLOAD_DIR = path.join(__dirname, 'uploads', 'banners');
const PROFILE_UPLOAD_DIR = path.join(__dirname, 'uploads', 'profiles');

async function ensureBannerUploadDir() {
    await fs.promises.mkdir(BANNER_UPLOAD_DIR, { recursive: true });
}

async function ensureProfileUploadDir(entityFolder) {
    await fs.promises.mkdir(path.join(PROFILE_UPLOAD_DIR, entityFolder), { recursive: true });
}

function parseImageDataUrl(imageData) {
    const match = /^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/.exec(imageData || '');
    if (!match) throw new Error('Invalid image data format');

    const mimeType = match[1].toLowerCase();
    const mimeToExt = {
        'image/png': 'png',
        'image/jpeg': 'jpg',
        'image/jpg': 'jpg',
        'image/webp': 'webp',
        'image/gif': 'gif'
    };

    const extension = mimeToExt[mimeType];
    if (!extension) throw new Error('Unsupported image type');

    const buffer = Buffer.from(match[2], 'base64');
    if (!buffer.length) throw new Error('Image payload is empty');

    return { buffer, extension };
}

function resolveBannerFilePath(publicPath) {
    if (!publicPath || !publicPath.startsWith('/uploads/banners/')) return null;
    const fileName = publicPath.replace('/uploads/banners/', '');
    return path.join(BANNER_UPLOAD_DIR, fileName);
}

async function upsertBannerRecord(payload = {}, { requireExisting = false } = {}) {
    const { id, imageData, status, imagePath } = payload;
    const bannerId = id || generateEntityId('banner');
    const existingBanner = await sequelize.models.Banner.findByPk(bannerId);
    if (requireExisting && !existingBanner) return null;

    let finalImagePath = imagePath || (existingBanner ? existingBanner.imagePath : '');
    if (imageData) {
        const { buffer, extension } = parseImageDataUrl(imageData);
        await ensureBannerUploadDir();

        const fileName = `banner_${Date.now()}_${Math.random().toString(36).slice(2, 9)}.${extension}`;
        const absolutePath = path.join(BANNER_UPLOAD_DIR, fileName);
        await fs.promises.writeFile(absolutePath, buffer);
        finalImagePath = `/uploads/banners/${fileName}`;

        if (existingBanner && existingBanner.imagePath && existingBanner.imagePath !== finalImagePath) {
            const oldAbsolutePath = resolveBannerFilePath(existingBanner.imagePath);
            if (oldAbsolutePath) await fs.promises.unlink(oldAbsolutePath).catch(() => { });
        }
    }

    if (!finalImagePath) throw new Error('Banner image is required');

    await sequelize.models.Banner.upsert({
        id: bannerId,
        imagePath: finalImagePath,
        status: status || (existingBanner ? existingBanner.status : 'Active')
    });

    return sequelize.models.Banner.findByPk(bannerId);
}

function resolveProfileFilePath(publicPath) {
    if (!publicPath || !publicPath.startsWith('/uploads/profiles/')) return null;
    const relativePath = publicPath.replace('/uploads/profiles/', '');
    return path.join(PROFILE_UPLOAD_DIR, relativePath);
}

async function saveProfileImageFromData(imageData, entityFolder) {
    const { buffer, extension } = parseImageDataUrl(imageData);
    await ensureProfileUploadDir(entityFolder);

    const fileName = `${entityFolder.slice(0, -1) || entityFolder}_${Date.now()}_${Math.random().toString(36).slice(2, 9)}.${extension}`;
    const absolutePath = path.join(PROFILE_UPLOAD_DIR, entityFolder, fileName);
    await fs.promises.writeFile(absolutePath, buffer);

    return `/uploads/profiles/${entityFolder}/${fileName}`;
}

function withImageUrls(req, rows) {
    const baseUrl = `${req.protocol}://${req.get('host')}`;
    return rows.map((row) => {
        const data = row.toJSON ? row.toJSON() : row;
        return {
            ...data,
            imageUrl: data.imagePath
                ? (data.imagePath.startsWith('http') ? data.imagePath : `${baseUrl}${data.imagePath}`)
                : ''
        };
    });
}

function generateEntityId(prefix) {
    return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

function normalizePayloadArray(body) {
    if (body === undefined || body === null) return [];
    return Array.isArray(body) ? body : [body];
}

function toNumeric(value) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
}

function normalizeTaxPercent(value) {
    const percent = toNumeric(value);
    if (percent < 0) return 0;
    if (percent > 100) return 100;
    return percent;
}

function applyStudentTaxFields(payload) {
    const baseFee = toNumeric(payload.fees ?? payload.monthlyFee);
    const taxPercent = normalizeTaxPercent(payload.feeTax ?? payload.tax);
    if (baseFee <= 0) return payload;

    payload.fees = String(baseFee);
    payload.feeTax = String(taxPercent);
    payload.tax = String(taxPercent);
    payload.monthlyFee = String(baseFee + (baseFee * taxPercent / 100));
    return payload;
}

function applyTeacherTaxFields(payload) {
    const grossSalary = toNumeric(payload.salary);
    const taxPercent = normalizeTaxPercent(payload.salaryTax ?? payload.tax);
    if (grossSalary <= 0) return payload;

    payload.salary = String(grossSalary);
    payload.salaryTax = String(taxPercent);
    payload.tax = String(taxPercent);
    payload.netSalary = String(grossSalary - (grossSalary * taxPercent / 100));
    return payload;
}

function normalizeDeductionValue(value) {
    return Math.max(0, toNumeric(value));
}

function applyTeacherSalaryPayoutFields(payload) {
    const grossSalary = toNumeric(payload.grossSalary ?? payload.salaryAmount);
    const taxPercent = normalizeTaxPercent(payload.taxPercent);
    const fallbackNet = toNumeric(payload.netSalary ?? payload.salaryAmount);
    const netSalary = grossSalary > 0
        ? (grossSalary - (grossSalary * taxPercent / 100))
        : fallbackNet;

    const lateFine = normalizeDeductionValue(payload.lateFine);
    const leaveDeduction = normalizeDeductionValue(payload.leaveDeduction);
    const otherDeduction = normalizeDeductionValue(payload.otherDeduction);
    const totalDeduction = lateFine + leaveDeduction + otherDeduction;
    const finalPayable = Math.max(0, netSalary - totalDeduction);

    if (grossSalary > 0) payload.grossSalary = String(grossSalary);
    payload.taxPercent = String(taxPercent);
    payload.netSalary = String(netSalary);
    payload.lateFine = String(lateFine);
    payload.leaveDeduction = String(leaveDeduction);
    payload.otherDeduction = String(otherDeduction);
    payload.totalDeduction = String(totalDeduction);
    payload.finalPayable = String(finalPayable);
    payload.salaryAmount = String(finalPayable);

    return payload;
}

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
        const data = normalizePayloadArray(req.body);
        for (let item of data) {
            if (item.password && !item.password.startsWith('$2a$')) {
                item.password = await bcrypt.hash(item.password, 10);
            }
            applyStudentTaxFields(item);
            if (!item.id) item.id = generateEntityId('student');
            await sequelize.models.Student.upsert(item);
        }
        const allStudents = await sequelize.models.Student.findAll();
        io.emit('students_update', allStudents);
        res.json({ success: true, students: allStudents });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.put('/api/students/:id', async (req, res) => {
    if (!sequelize) return res.status(503).json({ error: 'Database offline' });
    try {
        const id = req.params.id;
        const student = await sequelize.models.Student.findByPk(id);
        if (!student) return res.status(404).json({ error: 'Student not found' });

        const payload = { ...req.body };
        if (payload.password && !payload.password.startsWith('$2a$')) {
            payload.password = await bcrypt.hash(payload.password, 10);
        }
        applyStudentTaxFields(payload);
        await student.update(payload);

        const allStudents = await sequelize.models.Student.findAll();
        io.emit('students_update', allStudents);
        res.json({ success: true, student });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.delete('/api/students/:id', async (req, res) => {
    if (!sequelize) return res.status(503).json({ error: 'Database offline' });
    try {
        const id = req.params.id;
        await sequelize.models.Student.destroy({ where: { id } });
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
        res.json(withImageUrls(req, teachers));
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/teachers', async (req, res) => {
    if (!sequelize) return res.status(503).json({ error: 'Database offline' });
    try {
        const data = normalizePayloadArray(req.body);
        for (let item of data) {
            if (item.password && !item.password.startsWith('$2a$')) {
                item.password = await bcrypt.hash(item.password, 10);
            }
            applyTeacherTaxFields(item);
            if (!item.id) item.id = generateEntityId('teacher');
            const existingTeacher = item.id ? await sequelize.models.Teacher.findByPk(item.id) : null;
            let imagePath = item.imagePath || (existingTeacher ? existingTeacher.imagePath : '');

            if (item.imageData) {
                imagePath = await saveProfileImageFromData(item.imageData, 'teachers');
                if (existingTeacher && existingTeacher.imagePath && existingTeacher.imagePath !== imagePath) {
                    const oldAbsolutePath = resolveProfileFilePath(existingTeacher.imagePath);
                    if (oldAbsolutePath) await fs.promises.unlink(oldAbsolutePath).catch(() => { });
                }
            }

            const payload = { ...item, imagePath };
            delete payload.imageData;
            delete payload.imageUrl;
            await sequelize.models.Teacher.upsert(payload);
        }
        const allTeachers = await sequelize.models.Teacher.findAll();
        const teacherPayload = withImageUrls(req, allTeachers);
        io.emit('teachers_update', teacherPayload);
        res.json({ success: true, teachers: teacherPayload });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.put('/api/teachers/:id', async (req, res) => {
    if (!sequelize) return res.status(503).json({ error: 'Database offline' });
    try {
        const id = req.params.id;
        const existingTeacher = await sequelize.models.Teacher.findByPk(id);
        if (!existingTeacher) return res.status(404).json({ error: 'Teacher not found' });

        const item = { ...req.body, id };
        if (item.password && !item.password.startsWith('$2a$')) {
            item.password = await bcrypt.hash(item.password, 10);
        }
        applyTeacherTaxFields(item);

        let imagePath = item.imagePath || existingTeacher.imagePath || '';
        if (item.imageData) {
            imagePath = await saveProfileImageFromData(item.imageData, 'teachers');
            if (existingTeacher.imagePath && existingTeacher.imagePath !== imagePath) {
                const oldAbsolutePath = resolveProfileFilePath(existingTeacher.imagePath);
                if (oldAbsolutePath) await fs.promises.unlink(oldAbsolutePath).catch(() => { });
            }
        }

        const payload = { ...item, imagePath };
        delete payload.imageData;
        delete payload.imageUrl;
        await existingTeacher.update(payload);

        const allTeachers = await sequelize.models.Teacher.findAll();
        const teacherPayload = withImageUrls(req, allTeachers);
        io.emit('teachers_update', teacherPayload);
        res.json({ success: true, teacher: withImageUrls(req, [existingTeacher])[0] });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.delete('/api/teachers/:id', async (req, res) => {
    if (!sequelize) return res.status(503).json({ error: 'Database offline' });
    try {
        const id = req.params.id;
        const teacher = await sequelize.models.Teacher.findByPk(id);
        if (!teacher) return res.status(404).json({ error: 'Teacher not found' });

        const absolutePath = resolveProfileFilePath(teacher.imagePath);
        await teacher.destroy();
        if (absolutePath) await fs.promises.unlink(absolutePath).catch(() => { });

        const allTeachers = await sequelize.models.Teacher.findAll();
        const teacherPayload = withImageUrls(req, allTeachers);
        io.emit('teachers_update', teacherPayload);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/staff', async (req, res) => {
    if (!sequelize) return res.status(503).json({ error: 'Database offline' });
    try {
        const staff = await sequelize.models.Staff.findAll();
        res.json(withImageUrls(req, staff));
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/staff', async (req, res) => {
    if (!sequelize) return res.status(503).json({ error: 'Database offline' });
    try {
        const data = normalizePayloadArray(req.body);
        for (let item of data) {
            if (!item.id) item.id = generateEntityId('staff');
            const existingStaff = item.id ? await sequelize.models.Staff.findByPk(item.id) : null;
            let imagePath = item.imagePath || (existingStaff ? existingStaff.imagePath : '');

            if (item.imageData) {
                imagePath = await saveProfileImageFromData(item.imageData, 'staff');
                if (existingStaff && existingStaff.imagePath && existingStaff.imagePath !== imagePath) {
                    const oldAbsolutePath = resolveProfileFilePath(existingStaff.imagePath);
                    if (oldAbsolutePath) await fs.promises.unlink(oldAbsolutePath).catch(() => { });
                }
            }

            const payload = { ...item, imagePath };
            delete payload.imageData;
            delete payload.imageUrl;
            await sequelize.models.Staff.upsert(payload);
        }

        const allStaff = await sequelize.models.Staff.findAll();
        const staffPayload = withImageUrls(req, allStaff);
        io.emit('staff_update', staffPayload);
        res.json({ success: true, staff: staffPayload });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.put('/api/staff/:id', async (req, res) => {
    if (!sequelize) return res.status(503).json({ error: 'Database offline' });
    try {
        const id = req.params.id;
        const existingStaff = await sequelize.models.Staff.findByPk(id);
        if (!existingStaff) return res.status(404).json({ error: 'Staff not found' });

        const item = { ...req.body, id };
        let imagePath = item.imagePath || existingStaff.imagePath || '';
        if (item.imageData) {
            imagePath = await saveProfileImageFromData(item.imageData, 'staff');
            if (existingStaff.imagePath && existingStaff.imagePath !== imagePath) {
                const oldAbsolutePath = resolveProfileFilePath(existingStaff.imagePath);
                if (oldAbsolutePath) await fs.promises.unlink(oldAbsolutePath).catch(() => { });
            }
        }

        const payload = { ...item, imagePath };
        delete payload.imageData;
        delete payload.imageUrl;
        await existingStaff.update(payload);

        const allStaff = await sequelize.models.Staff.findAll();
        const staffPayload = withImageUrls(req, allStaff);
        io.emit('staff_update', staffPayload);
        res.json({ success: true, staff: withImageUrls(req, [existingStaff])[0] });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.delete('/api/staff/:id', async (req, res) => {
    if (!sequelize) return res.status(503).json({ error: 'Database offline' });
    try {
        const id = req.params.id;
        const staff = await sequelize.models.Staff.findByPk(id);
        if (!staff) return res.status(404).json({ error: 'Staff not found' });

        const absolutePath = resolveProfileFilePath(staff.imagePath);
        await staff.destroy();
        if (absolutePath) await fs.promises.unlink(absolutePath).catch(() => { });

        const allStaff = await sequelize.models.Staff.findAll();
        const staffPayload = withImageUrls(req, allStaff);
        io.emit('staff_update', staffPayload);
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
        const data = normalizePayloadArray(req.body);
        for (let item of data) {
            if (!item.id) item.id = generateEntityId('notice');
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

app.get('/api/classes', async (req, res) => {
    if (!sequelize) return res.status(503).json({ error: 'Database offline' });
    try {
        const classes = await sequelize.models.Class.findAll({ order: [['createdAt', 'DESC']] });
        res.json(classes);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/classes', async (req, res) => {
    if (!sequelize) return res.status(503).json({ error: 'Database offline' });
    try {
        const data = normalizePayloadArray(req.body);
        for (let item of data) {
            if (!item.id) item.id = generateEntityId('class');
            await sequelize.models.Class.upsert(item);
        }
        const classes = await sequelize.models.Class.findAll({ order: [['createdAt', 'DESC']] });
        io.emit('classes_update', classes);
        res.json({ success: true, classes });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.put('/api/classes/:id', async (req, res) => {
    if (!sequelize) return res.status(503).json({ error: 'Database offline' });
    try {
        const classItem = await sequelize.models.Class.findByPk(req.params.id);
        if (!classItem) return res.status(404).json({ error: 'Class not found' });
        await classItem.update(req.body);
        const classes = await sequelize.models.Class.findAll({ order: [['createdAt', 'DESC']] });
        io.emit('classes_update', classes);
        res.json({ success: true, class: classItem });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.delete('/api/classes/:id', async (req, res) => {
    if (!sequelize) return res.status(503).json({ error: 'Database offline' });
    try {
        await sequelize.models.Class.destroy({ where: { id: req.params.id } });
        const classes = await sequelize.models.Class.findAll({ order: [['createdAt', 'DESC']] });
        io.emit('classes_update', classes);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/bills', async (req, res) => {
    if (!sequelize) return res.status(503).json({ error: 'Database offline' });
    try {
        const bills = await sequelize.models.Bill.findAll({ order: [['date', 'DESC'], ['createdAt', 'DESC']] });
        res.json(bills);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/bills', async (req, res) => {
    if (!sequelize) return res.status(503).json({ error: 'Database offline' });
    try {
        const data = normalizePayloadArray(req.body);
        for (let item of data) {
            if (!item.id) item.id = generateEntityId('bill');
            await sequelize.models.Bill.upsert(item);
        }
        const bills = await sequelize.models.Bill.findAll({ order: [['date', 'DESC'], ['createdAt', 'DESC']] });
        io.emit('bills_update', bills);
        res.json({ success: true, bills });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.put('/api/bills/:id', async (req, res) => {
    if (!sequelize) return res.status(503).json({ error: 'Database offline' });
    try {
        const bill = await sequelize.models.Bill.findByPk(req.params.id);
        if (!bill) return res.status(404).json({ error: 'Bill not found' });
        await bill.update(req.body);
        const bills = await sequelize.models.Bill.findAll({ order: [['date', 'DESC'], ['createdAt', 'DESC']] });
        io.emit('bills_update', bills);
        res.json({ success: true, bill });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.delete('/api/bills/:id', async (req, res) => {
    if (!sequelize) return res.status(503).json({ error: 'Database offline' });
    try {
        await sequelize.models.Bill.destroy({ where: { id: req.params.id } });
        const bills = await sequelize.models.Bill.findAll({ order: [['date', 'DESC'], ['createdAt', 'DESC']] });
        io.emit('bills_update', bills);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/teacher-salaries', async (req, res) => {
    if (!sequelize) return res.status(503).json({ error: 'Database offline' });
    try {
        const salaries = await sequelize.models.TeacherSalary.findAll({ order: [['monthKey', 'DESC'], ['createdAt', 'DESC']] });
        res.json(salaries);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/teacher-salaries', async (req, res) => {
    if (!sequelize) return res.status(503).json({ error: 'Database offline' });
    try {
        const data = normalizePayloadArray(req.body);
        for (let item of data) {
            applyTeacherSalaryPayoutFields(item);
            if (!item.id) {
                item.id = item.teacherId && item.monthKey
                    ? `${item.teacherId}_${item.monthKey}`
                    : generateEntityId('salary');
            }
            await sequelize.models.TeacherSalary.upsert(item);
        }
        const salaries = await sequelize.models.TeacherSalary.findAll({ order: [['monthKey', 'DESC'], ['createdAt', 'DESC']] });
        io.emit('teacher_salaries_update', salaries);
        res.json({ success: true, salaries });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.put('/api/teacher-salaries/:id', async (req, res) => {
    if (!sequelize) return res.status(503).json({ error: 'Database offline' });
    try {
        const salary = await sequelize.models.TeacherSalary.findByPk(req.params.id);
        if (!salary) return res.status(404).json({ error: 'Teacher salary record not found' });
        const payload = { ...req.body };
        applyTeacherSalaryPayoutFields(payload);
        await salary.update(payload);
        const salaries = await sequelize.models.TeacherSalary.findAll({ order: [['monthKey', 'DESC'], ['createdAt', 'DESC']] });
        io.emit('teacher_salaries_update', salaries);
        res.json({ success: true, salary });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.delete('/api/teacher-salaries/:id', async (req, res) => {
    if (!sequelize) return res.status(503).json({ error: 'Database offline' });
    try {
        await sequelize.models.TeacherSalary.destroy({ where: { id: req.params.id } });
        const salaries = await sequelize.models.TeacherSalary.findAll({ order: [['monthKey', 'DESC'], ['createdAt', 'DESC']] });
        io.emit('teacher_salaries_update', salaries);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/teacher-attendance', async (req, res) => {
    if (!sequelize) return res.status(503).json({ error: 'Database offline' });
    try {
        const attendance = await sequelize.models.TeacherAttendance.findAll({ order: [['monthKey', 'DESC'], ['createdAt', 'DESC']] });
        res.json(attendance);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/teacher-attendance', async (req, res) => {
    if (!sequelize) return res.status(503).json({ error: 'Database offline' });
    try {
        const data = normalizePayloadArray(req.body);
        for (let item of data) {
            if (!item.id) {
                item.id = item.teacherId && item.monthKey
                    ? `${item.teacherId}_${item.monthKey}`
                    : generateEntityId('attendance');
            }
            await sequelize.models.TeacherAttendance.upsert(item);
        }
        const attendance = await sequelize.models.TeacherAttendance.findAll({ order: [['monthKey', 'DESC'], ['createdAt', 'DESC']] });
        io.emit('teacher_attendance_update', attendance);
        res.json({ success: true, attendance });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.put('/api/teacher-attendance/:id', async (req, res) => {
    if (!sequelize) return res.status(503).json({ error: 'Database offline' });
    try {
        const attendance = await sequelize.models.TeacherAttendance.findByPk(req.params.id);
        if (!attendance) return res.status(404).json({ error: 'Teacher attendance record not found' });
        await attendance.update(req.body);
        const allAttendance = await sequelize.models.TeacherAttendance.findAll({ order: [['monthKey', 'DESC'], ['createdAt', 'DESC']] });
        io.emit('teacher_attendance_update', allAttendance);
        res.json({ success: true, attendance });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.delete('/api/teacher-attendance/:id', async (req, res) => {
    if (!sequelize) return res.status(503).json({ error: 'Database offline' });
    try {
        await sequelize.models.TeacherAttendance.destroy({ where: { id: req.params.id } });
        const attendance = await sequelize.models.TeacherAttendance.findAll({ order: [['monthKey', 'DESC'], ['createdAt', 'DESC']] });
        io.emit('teacher_attendance_update', attendance);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/settings', async (req, res) => {
    if (!sequelize) return res.status(503).json({ error: 'Database offline' });
    try {
        const settings = await sequelize.models.Setting.findAll({ order: [['createdAt', 'DESC']] });
        res.json(settings);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/settings', async (req, res) => {
    if (!sequelize) return res.status(503).json({ error: 'Database offline' });
    try {
        const data = normalizePayloadArray(req.body);
        for (let item of data) {
            if (!item.id) item.id = 'default';
            await sequelize.models.Setting.upsert(item);
        }
        const settings = await sequelize.models.Setting.findAll({ order: [['createdAt', 'DESC']] });
        io.emit('settings_update', settings);
        res.json({ success: true, settings });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.put('/api/settings/:id', async (req, res) => {
    if (!sequelize) return res.status(503).json({ error: 'Database offline' });
    try {
        const setting = await sequelize.models.Setting.findByPk(req.params.id);
        if (!setting) return res.status(404).json({ error: 'Setting not found' });
        await setting.update(req.body);
        const settings = await sequelize.models.Setting.findAll({ order: [['createdAt', 'DESC']] });
        io.emit('settings_update', settings);
        res.json({ success: true, setting });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.delete('/api/settings/:id', async (req, res) => {
    if (!sequelize) return res.status(503).json({ error: 'Database offline' });
    try {
        await sequelize.models.Setting.destroy({ where: { id: req.params.id } });
        const settings = await sequelize.models.Setting.findAll({ order: [['createdAt', 'DESC']] });
        io.emit('settings_update', settings);
        res.json({ success: true });
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

app.get('/api/banners', async (req, res) => {
    if (!sequelize) return res.status(503).json({ error: 'Database offline' });
    try {
        const banners = await sequelize.models.Banner.findAll({ order: [['createdAt', 'DESC']] });
        res.json(withImageUrls(req, banners));
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/public/banners', async (req, res) => {
    if (!sequelize) return res.status(503).json({ error: 'Database offline' });
    try {
        const banners = await sequelize.models.Banner.findAll({
            where: { status: 'Active' },
            order: [['createdAt', 'DESC']]
        });
        res.json(withImageUrls(req, banners));
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/banners', async (req, res) => {
    if (!sequelize) return res.status(503).json({ error: 'Database offline' });
    try {
        const data = normalizePayloadArray(req.body);
        const upsertedBanners = [];
        for (let item of data) {
            const banner = await upsertBannerRecord(item);
            upsertedBanners.push(banner);
        }
        const banners = await sequelize.models.Banner.findAll({ order: [['createdAt', 'DESC']] });
        const bannerPayload = withImageUrls(req, banners);
        const upsertedPayload = withImageUrls(req, upsertedBanners);
        io.emit('banners_update', bannerPayload);
        res.json({
            success: true,
            banner: upsertedPayload[0] || null,
            updated: upsertedPayload,
            banners: bannerPayload
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/banners/upload', async (req, res) => {
    if (!sequelize) return res.status(503).json({ error: 'Database offline' });
    try {
        const banner = await upsertBannerRecord(req.body);
        const banners = await sequelize.models.Banner.findAll({ order: [['createdAt', 'DESC']] });
        const bannerPayload = withImageUrls(req, banners);
        io.emit('banners_update', bannerPayload);
        res.json({
            success: true,
            banner: withImageUrls(req, [banner])[0],
            banners: bannerPayload
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.put('/api/banners/:id', async (req, res) => {
    if (!sequelize) return res.status(503).json({ error: 'Database offline' });
    try {
        const id = req.params.id;
        const banner = await upsertBannerRecord({ ...req.body, id }, { requireExisting: true });
        if (!banner) return res.status(404).json({ error: 'Banner not found' });

        const banners = await sequelize.models.Banner.findAll({ order: [['createdAt', 'DESC']] });
        const bannerPayload = withImageUrls(req, banners);
        io.emit('banners_update', bannerPayload);
        res.json({ success: true, banner: withImageUrls(req, [banner])[0] });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.delete('/api/banners/:id', async (req, res) => {
    if (!sequelize) return res.status(503).json({ error: 'Database offline' });
    try {
        const id = req.params.id;
        const banner = await sequelize.models.Banner.findByPk(id);
        if (!banner) return res.status(404).json({ error: 'Banner not found' });

        const absolutePath = resolveBannerFilePath(banner.imagePath);
        await banner.destroy();

        if (absolutePath) {
            await fs.promises.unlink(absolutePath).catch(() => { });
        }

        const banners = await sequelize.models.Banner.findAll({ order: [['createdAt', 'DESC']] });
        io.emit('banners_update', withImageUrls(req, banners));
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
        contactNo: DataTypes.STRING,
        classGrade: DataTypes.STRING,
        parentPhone: DataTypes.STRING,
        rollNo: DataTypes.STRING,
        formB: DataTypes.STRING,
        fees: DataTypes.STRING,
        tax: DataTypes.STRING,
        feeTax: DataTypes.STRING,
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
        imagePath: DataTypes.STRING,
        salary: DataTypes.STRING,
        tax: DataTypes.STRING,
        salaryTax: DataTypes.STRING,
        netSalary: DataTypes.STRING,
        username: { type: DataTypes.STRING, unique: true },
        password: { type: DataTypes.STRING },
        role: { type: DataTypes.STRING, defaultValue: 'Teacher' }
    });
}

function defineStaffModel(sequelize) {
    return sequelize.define('Staff', {
        id: { type: DataTypes.STRING, primaryKey: true },
        fullName: DataTypes.STRING,
        fatherName: DataTypes.STRING,
        designation: DataTypes.STRING,
        cnic: DataTypes.STRING,
        phone: DataTypes.STRING,
        address: DataTypes.TEXT,
        gender: DataTypes.STRING,
        salary: DataTypes.STRING,
        imagePath: DataTypes.STRING
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

function defineBannerModel(sequelize) {
    return sequelize.define('Banner', {
        id: { type: DataTypes.STRING, primaryKey: true },
        imagePath: { type: DataTypes.STRING, allowNull: false },
        status: { type: DataTypes.STRING, defaultValue: 'Active' }
    });
}

function defineClassModel(sequelize) {
    return sequelize.define('Class', {
        id: { type: DataTypes.STRING, primaryKey: true },
        name: { type: DataTypes.STRING, allowNull: false },
        section: DataTypes.STRING,
        room: DataTypes.STRING,
        capacity: DataTypes.STRING
    });
}

function defineBillModel(sequelize) {
    return sequelize.define('Bill', {
        id: { type: DataTypes.STRING, primaryKey: true },
        category: DataTypes.STRING,
        amount: DataTypes.STRING,
        date: DataTypes.STRING,
        status: { type: DataTypes.STRING, defaultValue: 'Unpaid' },
        note: DataTypes.TEXT,
        invoice: DataTypes.TEXT('long'),
        receipt: DataTypes.TEXT('long'),
        paymentConfirmedDate: DataTypes.STRING
    });
}

function defineTeacherSalaryModel(sequelize) {
    return sequelize.define('TeacherSalary', {
        id: { type: DataTypes.STRING, primaryKey: true },
        teacherId: DataTypes.STRING,
        teacherName: DataTypes.STRING,
        monthKey: DataTypes.STRING,
        grossSalary: DataTypes.STRING,
        taxPercent: DataTypes.STRING,
        netSalary: DataTypes.STRING,
        lateFine: DataTypes.STRING,
        leaveDeduction: DataTypes.STRING,
        otherDeduction: DataTypes.STRING,
        totalDeduction: DataTypes.STRING,
        finalPayable: DataTypes.STRING,
        salaryAmount: DataTypes.STRING,
        paid: { type: DataTypes.BOOLEAN, defaultValue: false },
        date: DataTypes.STRING,
        time: DataTypes.STRING
    });
}

function defineTeacherAttendanceModel(sequelize) {
    return sequelize.define('TeacherAttendance', {
        id: { type: DataTypes.STRING, primaryKey: true },
        teacherId: DataTypes.STRING,
        teacherName: DataTypes.STRING,
        monthKey: DataTypes.STRING,
        attendanceData: DataTypes.TEXT('long'),
        presentDays: DataTypes.INTEGER,
        absentDays: DataTypes.INTEGER
    });
}

function defineSettingModel(sequelize) {
    return sequelize.define('Setting', {
        id: { type: DataTypes.STRING, primaryKey: true },
        schoolName: DataTypes.STRING,
        session: DataTypes.STRING,
        phone: DataTypes.STRING,
        contactEmail: DataTypes.STRING
    });
}

async function ensureStudentExtraColumns(sequelize) {
    const queryInterface = sequelize.getQueryInterface();
    const tableName = 'Students';
    const columns = await queryInterface.describeTable(tableName);

    if (!columns.contactNo) {
        await queryInterface.addColumn(tableName, 'contactNo', { type: DataTypes.STRING });
    }
    if (!columns.fees) {
        await queryInterface.addColumn(tableName, 'fees', { type: DataTypes.STRING });
    }
    if (!columns.tax) {
        await queryInterface.addColumn(tableName, 'tax', { type: DataTypes.STRING });
    }
    if (!columns.feeTax) {
        await queryInterface.addColumn(tableName, 'feeTax', { type: DataTypes.STRING });
    }
}

async function ensureTeacherExtraColumns(sequelize) {
    const queryInterface = sequelize.getQueryInterface();
    const tableName = 'Teachers';
    const columns = await queryInterface.describeTable(tableName);
    if (!columns.imagePath) {
        await queryInterface.addColumn(tableName, 'imagePath', { type: DataTypes.STRING });
    }
    if (!columns.tax) {
        await queryInterface.addColumn(tableName, 'tax', { type: DataTypes.STRING });
    }
    if (!columns.salaryTax) {
        await queryInterface.addColumn(tableName, 'salaryTax', { type: DataTypes.STRING });
    }
    if (!columns.netSalary) {
        await queryInterface.addColumn(tableName, 'netSalary', { type: DataTypes.STRING });
    }
}

async function ensureTeacherSalaryExtraColumns(sequelize) {
    const queryInterface = sequelize.getQueryInterface();
    const tableName = 'TeacherSalaries';
    try {
        const columns = await queryInterface.describeTable(tableName);
        if (!columns.grossSalary) {
            await queryInterface.addColumn(tableName, 'grossSalary', { type: DataTypes.STRING });
        }
        if (!columns.taxPercent) {
            await queryInterface.addColumn(tableName, 'taxPercent', { type: DataTypes.STRING });
        }
        if (!columns.netSalary) {
            await queryInterface.addColumn(tableName, 'netSalary', { type: DataTypes.STRING });
        }
        if (!columns.lateFine) {
            await queryInterface.addColumn(tableName, 'lateFine', { type: DataTypes.STRING });
        }
        if (!columns.leaveDeduction) {
            await queryInterface.addColumn(tableName, 'leaveDeduction', { type: DataTypes.STRING });
        }
        if (!columns.otherDeduction) {
            await queryInterface.addColumn(tableName, 'otherDeduction', { type: DataTypes.STRING });
        }
        if (!columns.totalDeduction) {
            await queryInterface.addColumn(tableName, 'totalDeduction', { type: DataTypes.STRING });
        }
        if (!columns.finalPayable) {
            await queryInterface.addColumn(tableName, 'finalPayable', { type: DataTypes.STRING });
        }
    } catch (err) {
        // Table may not exist yet in old setups; it will be created by sync if needed.
    }
}

async function ensureStaffExtraColumns(sequelize) {
    const queryInterface = sequelize.getQueryInterface();
    const candidateTableNames = ['Staffs', 'Staff'];
    for (const tableName of candidateTableNames) {
        try {
            const columns = await queryInterface.describeTable(tableName);
            if (!columns.imagePath) {
                await queryInterface.addColumn(tableName, 'imagePath', { type: DataTypes.STRING });
            }
            return;
        } catch (err) {
            // Try next possible table name generated by Sequelize pluralization rules.
        }
    }
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
        defineStaffModel(sequelize);
        defineNoticeModel(sequelize);
        defineBannerModel(sequelize);
        defineClassModel(sequelize);
        defineBillModel(sequelize);
        defineTeacherSalaryModel(sequelize);
        defineTeacherAttendanceModel(sequelize);
        defineSettingModel(sequelize);

        await sequelize.sync();
        await ensureStudentExtraColumns(sequelize);
        await ensureTeacherExtraColumns(sequelize);
        await ensureTeacherSalaryExtraColumns(sequelize);
        await ensureStaffExtraColumns(sequelize);
        console.log('\x1b[32m✔\x1b[0m Database Synced Successfully');
    } catch (err) {
        console.error('\x1b[31m✘\x1b[0m Database Connection Error:', err.message);
        console.log('ℹ️  Ensure MySQL is running and credentials in .env are correct.');
    }
}

startServer();
