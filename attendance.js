import { Router } from 'express';
import store from '../data/store.js';
import { StudentAttendance } from '../models/StudentAttendance.js';
import { authenticateToken } from '../middleware/auth.js';

const router = Router();

// GET /api/attendance - Get attendance for current student
router.get('/', authenticateToken, async (req, res) => {
  try {
    const studentId = req.user.id;
    let attendanceRecords = await StudentAttendance.find({
      $or: [{ studentId }, { userId: studentId }],
    }).sort({ subjectName: 1 });

    if (attendanceRecords.length === 0) {
      const records = store.attendance.get(studentId) || [];
      return res.json(records);
    }

    const mappedRecords = attendanceRecords.map((r) => ({
      id: r._id,
      studentId: r.studentId || r.userId,
      subjectName: r.subjectName,
      subjectCode: r.subjectCode,
      present: r.attendedLectures,
      total: r.totalLectures,
      absent: Math.max(r.totalLectures - r.attendedLectures, 0),
      percentage: r.attendancePercentage,
      lastLectureDate: r.lastLectureDate || null,
    }));

    res.json(mappedRecords);
  } catch (error) {
    res.status(500).json({ message: 'Internal server error', error: error.message });
  }
});

// PUT /api/attendance - Update attendance (faculty/admin)
router.put('/', authenticateToken, (req, res) => {
  if (!['faculty', 'admin', 'hod'].includes(req.user.role)) {
    return res.status(403).json({ message: 'Only faculty can update attendance' });
  }

  const { userId, subjectCode, present, total } = req.body;
  const records = store.attendance.get(userId);

  if (!records) {
    return res.status(404).json({ message: 'Student attendance not found' });
  }

  const record = records.find(r => r.subjectCode === subjectCode);
  if (record) {
    if (present !== undefined) record.present = present;
    if (total !== undefined) record.total = total;
  }

  res.json({ message: 'Attendance updated', record });
});

export default router;
