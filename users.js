import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { v4 as uuid } from 'uuid';
import store from '../data/store.js';
import { authenticateToken, requireRole } from '../middleware/auth.js';

const router = Router();

// GET /api/users - Admin only
router.get('/', authenticateToken, requireRole('admin'), (req, res) => {
  const users = Array.from(store.users.values()).map(({ password, ...u }) => u);
  res.json(users);
});

// POST /api/users - Admin create user
router.post('/', authenticateToken, requireRole('admin'), async (req, res) => {
  const { name, email, password, role, department } = req.body;

  if (!name || !email || !password || !role) {
    return res.status(400).json({ message: 'All fields required' });
  }

  for (const [, user] of store.users) {
    if (user.email === email) {
      return res.status(409).json({ message: 'Email already exists' });
    }
  }

  const hashedPassword = await bcrypt.hash(password, 10);
  const id = uuid();
  const user = { id, name, email, password: hashedPassword, role, department: department || 'Computer Science', createdAt: new Date().toISOString() };
  store.users.set(id, user);

  if (role === 'student') {
    store.attendance.set(id, []);
  }

  const { password: _, ...safeUser } = user;
  res.status(201).json(safeUser);
});

// PUT /api/users/:id
router.put('/:id', authenticateToken, requireRole('admin'), (req, res) => {
  const user = store.users.get(req.params.id);
  if (!user) return res.status(404).json({ message: 'User not found' });

  const { name, email, role, department } = req.body;
  if (name) user.name = name;
  if (email) user.email = email;
  if (role) user.role = role;
  if (department) user.department = department;

  const { password: _, ...safeUser } = user;
  res.json(safeUser);
});

// DELETE /api/users/:id
router.delete('/:id', authenticateToken, requireRole('admin'), (req, res) => {
  if (!store.users.has(req.params.id)) {
    return res.status(404).json({ message: 'User not found' });
  }
  store.users.delete(req.params.id);
  store.attendance.delete(req.params.id);
  store.notifications.delete(req.params.id);
  res.json({ message: 'User deleted' });
});

export default router;
