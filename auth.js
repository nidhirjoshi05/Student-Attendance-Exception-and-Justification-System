import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { v4 as uuid } from 'uuid';
import store from '../data/store.js';
import { authenticateToken, JWT_SECRET } from '../middleware/auth.js';

const router = Router();

// POST /api/auth/register
router.post('/register', async (req, res) => {
  try {
    const { name, email, password, role, department } = req.body;

    if (!name || !email || !password || !role) {
      return res.status(400).json({ message: 'All fields are required' });
    }

    // Check for duplicate email
    for (const [, user] of store.users) {
      if (user.email === email) {
        return res.status(409).json({ message: 'Email already exists' });
      }
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const id = uuid();
    const user = {
      id,
      name,
      email,
      password: hashedPassword,
      role,
      department: department || 'Computer Science',
      studentId: role === 'student' ? `STU${Date.now()}` : undefined,
      createdAt: new Date().toISOString(),
    };

    store.users.set(id, user);

    // Initialize empty attendance for students
    if (role === 'student') {
      store.attendance.set(id, [
        { id: uuid(), userId: id, subjectName: 'Data Structures & Algorithms', subjectCode: 'CS301', present: 0, total: 0 },
        { id: uuid(), userId: id, subjectName: 'Operating Systems', subjectCode: 'CS302', present: 0, total: 0 },
        { id: uuid(), userId: id, subjectName: 'Database Management Systems', subjectCode: 'CS303', present: 0, total: 0 },
      ]);
    }

    const token = jwt.sign(
      {
        id: user.id,
        email: user.email,
        role: user.role,
        name: user.name,
        department: user.department,
        studentId: user.studentId,
      },
      JWT_SECRET,
      { expiresIn: '7d' },
    );

    const { password: _, ...safeUser } = user;
    res.status(201).json({ token, user: safeUser });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// POST /api/auth/login
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ message: 'Email and password required' });
    }

    let foundUser = null;
    for (const [, user] of store.users) {
      if (user.email === email) {
        foundUser = user;
        break;
      }
    }

    if (!foundUser) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    const validPassword = await bcrypt.compare(password, foundUser.password);
    if (!validPassword) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    const token = jwt.sign(
      {
        id: foundUser.id,
        email: foundUser.email,
        role: foundUser.role,
        name: foundUser.name,
        department: foundUser.department,
        studentId: foundUser.studentId,
      },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    const { password: _, ...safeUser } = foundUser;
    res.json({ token, user: safeUser });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// GET /api/auth/me
router.get('/me', authenticateToken, (req, res) => {
  const user = store.users.get(req.user.id);
  if (!user) {
    return res.status(404).json({ message: 'User not found' });
  }
  const { password: _, ...safeUser } = user;
  res.json({ user: safeUser });
});

export default router;
