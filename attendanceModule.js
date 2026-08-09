import { Router } from 'express';
import { Lecture } from '../models/Lecture.js';
import { StudentAttendance } from '../models/StudentAttendance.js';
import { Subject } from '../models/Subject.js';
import { Course } from '../models/Course.js';
import { User } from '../models/User.js';
import { authenticateToken, requireRole } from '../middleware/auth.js';
import store from '../data/store.js';
import { simulateAttendance } from '../utils/attendanceSimulator.js';

const router = Router();

function isLikelyMongoObjectId(id) {
  return typeof id === 'string' && /^[a-f0-9]{24}$/i.test(id);
}

/**
 * Auth directory lives in `store`; Mongo `User` may still exist after restarts. Resolve either so
 * admin course APIs and rosters work when both are in use.
 */
async function resolveAccountForCourse(userId) {
  if (userId === undefined || userId === null || userId === '') {
    return null;
  }
  const key = String(userId).trim();
  let cached = store.users.get(key);
  if (!cached) {
    for (const u of store.users.values()) {
      if (u && String(u.id) === key) {
        cached = u;
        break;
      }
    }
  }
  if (cached) {
    return cached;
  }

  if (!isLikelyMongoObjectId(key)) {
    return null;
  }

  try {
    const doc = await User.findById(key).lean();
    if (!doc) {
      return null;
    }
    const normalized = {
      id: doc._id.toString(),
      name: doc.name,
      email: doc.email,
      password: doc.password,
      role: doc.role,
      department: doc.department,
      studentId: doc.studentId,
    };
    if (!store.users.has(key)) {
      store.users.set(key, normalized);
    }
    return normalized;
  } catch {
    return null;
  }
}

function normalizeDate(value) {
  const normalized = new Date(value || new Date());

  if (Number.isNaN(normalized.getTime())) {
    return null;
  }

  normalized.setHours(0, 0, 0, 0);
  return normalized;
}

function getStudentsForDepartment(department) {
  return Array.from(store.users.values()).filter((user) => (
    user.role === 'student' && (!department || user.department === department)
  ));
}

function mapAttendanceRecord(record) {
  const totalLectures = record.totalLectures || 0;
  const attendedLectures = record.attendedLectures || 0;
  const attendancePercentage = totalLectures === 0
    ? 0
    : Number((record.attendancePercentage ?? (attendedLectures / totalLectures) * 100).toFixed(2));

  return {
    id: record._id?.toString?.() || record.id,
    studentId: record.studentId || record.userId,
    courseId: record.courseId?.toString?.() || record.courseId || null,
    subjectName: record.subjectName,
    subjectCode: record.subjectCode,
    present: attendedLectures,
    total: totalLectures,
    absent: Math.max(totalLectures - attendedLectures, 0),
    percentage: attendancePercentage,
    attendancePercentage,
    totalLectures,
    attendedLectures,
    lastLectureDate: record.lastLectureDate || null,
  };
}

function syncStoreAttendance(studentId, subject, attendance) {
  const userRecords = store.attendance.get(studentId) || [];
  const recordIndex = userRecords.findIndex((record) => record.subjectCode === subject.subjectCode);
  const mappedRecord = {
    id: attendance._id.toString(),
    studentId,
    userId: studentId,
    courseId: attendance.courseId?.toString?.() || attendance.courseId,
    subjectName: subject.subjectName,
    subjectCode: subject.subjectCode,
    present: attendance.attendedLectures,
    total: attendance.totalLectures,
    percentage: attendance.attendancePercentage,
    lastLectureDate: attendance.lastLectureDate,
  };

  if (recordIndex > -1) {
    userRecords[recordIndex] = {
      ...userRecords[recordIndex],
      ...mappedRecord,
    };
  } else {
    userRecords.push(mappedRecord);
  }

  store.attendance.set(studentId, userRecords);
}

function canManageSubject(user, subject) {
  if (!subject) {
    return false;
  }

  if (user.role === 'admin') {
    return true;
  }

  if (user.role === 'hod') {
    return !subject.department || subject.department === user.department;
  }

  if (user.role === 'faculty') {
    if (Array.isArray(subject.facultyIds) && subject.facultyIds.length > 0) {
      if (subject.facultyIds.includes(user.id)) {
        return true;
      }
      // Allow faculty from same department when explicit assignment is missing for newly created accounts.
      return !subject.department || subject.department === user.department;
    }

    return !subject.department || subject.department === user.department;
  }

  return false;
}

async function resolveSubject(subjectIdentifier) {
  const subject = await Subject.findOne({
    $or: [
      { subjectCode: subjectIdentifier },
      { subjectName: subjectIdentifier },
    ],
  }).lean();

  if (subject) {
    return subject;
  }

  const directMatch = store.subjects.get(subjectIdentifier);
  if (directMatch) {
    return directMatch;
  }

  for (const value of store.subjects.values()) {
    if (value.subjectName === subjectIdentifier) {
      return value;
    }
  }

  return null;
}

async function getStudentAttendanceRecord(studentId, subjectCode) {
  let attendance = await StudentAttendance.findOne({
    $or: [{ studentId }, { userId: studentId }],
    subjectCode,
  });

  if (attendance) {
    return attendance;
  }

  const storeRecord = (store.attendance.get(studentId) || []).find((record) => record.subjectCode === subjectCode);
  if (!storeRecord) {
    return null;
  }

  attendance = new StudentAttendance({
    studentId,
    userId: studentId,
    subjectName: storeRecord.subjectName,
    subjectCode: storeRecord.subjectCode,
    totalLectures: storeRecord.total,
    attendedLectures: storeRecord.present,
    attendancePercentage: storeRecord.percentage,
    lastLectureDate: storeRecord.lastLectureDate,
  });
  await attendance.save();

  return attendance;
}

async function buildAttendanceOverview({ department } = {}) {
  const [attendanceRecords, lectures] = await Promise.all([
    StudentAttendance.find().lean(),
    Lecture.find().sort({ date: -1 }).lean(),
  ]);

  const scopedUsers = Array.from(store.users.values()).filter((user) => (
    !department || user.department === department
  ));
  const scopedStudentIds = new Set(
    scopedUsers.filter((user) => user.role === 'student').map((user) => user.id),
  );

  const scopedAttendance = attendanceRecords.filter((record) => (
    scopedStudentIds.has(record.studentId || record.userId)
  ));
  const scopedLectures = lectures.filter((lecture) => !department || lecture.department === department);

  const subjectMap = new Map();
  scopedAttendance.forEach((record) => {
    const key = record.subjectCode;
    if (!subjectMap.has(key)) {
      subjectMap.set(key, {
        subjectCode: key,
        subjectName: record.subjectName,
        totalAttended: 0,
        totalLecturesAllStudents: 0,
        defaulterCount: 0,
      });
    }

    const stats = subjectMap.get(key);
    stats.totalAttended += record.attendedLectures;
    stats.totalLecturesAllStudents += record.totalLectures;
    if (record.attendancePercentage < 75) {
      stats.defaulterCount += 1;
    }
  });

  scopedLectures.forEach((lecture) => {
    if (!subjectMap.has(lecture.subjectCode)) {
      subjectMap.set(lecture.subjectCode, {
        subjectCode: lecture.subjectCode,
        subjectName: lecture.subject,
        totalAttended: 0,
        totalLecturesAllStudents: 0,
        defaulterCount: 0,
      });
    }
  });

  const lectureCountBySubject = scopedLectures.reduce((acc, lecture) => {
    acc[lecture.subjectCode] = (acc[lecture.subjectCode] || 0) + 1;
    return acc;
  }, {});

  const subjectWiseAverageAttendance = Array.from(subjectMap.values())
    .map((subject) => {
      const averageAttendance = subject.totalLecturesAllStudents > 0
        ? Number(((subject.totalAttended / subject.totalLecturesAllStudents) * 100).toFixed(2))
        : 0;

      return {
        subjectCode: subject.subjectCode,
        subjectName: subject.subjectName,
        averageAttendance,
        totalLectures: lectureCountBySubject[subject.subjectCode] || 0,
        defaulterCount: subject.defaulterCount,
      };
    })
    .sort((a, b) => a.subjectName.localeCompare(b.subjectName));

  const studentWiseData = scopedAttendance
    .map((record) => {
      const student = store.users.get(record.studentId || record.userId);
      return {
        id: `${record.studentId || record.userId}-${record.subjectCode}`,
        studentId: record.studentId || record.userId,
        studentName: student?.name || 'Student',
        rollNo: student?.studentId || record.studentId || record.userId,
        subjectName: record.subjectName,
        subjectCode: record.subjectCode,
        attendedLectures: record.attendedLectures,
        totalLectures: record.totalLectures,
        attendancePercentage: Number(record.attendancePercentage?.toFixed?.(2) || record.attendancePercentage || 0),
        status: record.attendancePercentage >= 75 ? 'Good' : record.attendancePercentage >= 60 ? 'Warning' : 'Critical',
      };
    })
    .sort((a, b) => a.attendancePercentage - b.attendancePercentage);

  return {
    subjectWiseAverageAttendance,
    totalLectures: scopedLectures.length,
    defaulters: studentWiseData.filter((entry) => entry.attendancePercentage < 75).length,
    studentWiseData,
  };
}

async function syncSubjectFromCourse(courseDoc) {
  const code = courseDoc.courseCode;
  await Subject.findOneAndUpdate(
    { subjectCode: code },
    {
      subjectName: courseDoc.courseName,
      subjectCode: code,
      department: courseDoc.department,
      facultyIds: [courseDoc.facultyId],
    },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  );

  store.subjects.set(code, {
    id: courseDoc._id?.toString?.() || code,
    subjectName: courseDoc.courseName,
    subjectCode: code,
    department: courseDoc.department,
    facultyIds: [courseDoc.facultyId],
  });
}

function mapCourseForAdmin(course) {
  const faculty = store.users.get(course.facultyId);
  return {
    id: course._id.toString(),
    courseName: course.courseName,
    courseCode: course.courseCode,
    department: course.department,
    facultyId: course.facultyId,
    facultyName: faculty?.name || 'Unknown',
    students: course.students || [],
    studentCount: (course.students || []).length,
    requiredAttendance: course.requiredAttendance ?? 80,
    updatedAt: course.updatedAt,
  };
}

router.post('/courses', authenticateToken, requireRole('admin'), async (req, res) => {
  try {
    const {
      courseName,
      courseCode,
      department,
      facultyId,
      students: studentIds = [],
      requiredAttendance = 80,
    } = req.body;

    if (!courseName || !courseCode || !department || !facultyId) {
      return res.status(400).json({ message: 'courseName, courseCode, department, and facultyId are required.' });
    }

    const code = String(courseCode).toUpperCase().trim();
    const facultyUser = await resolveAccountForCourse(facultyId);
    if (!facultyUser || facultyUser.role !== 'faculty') {
      return res.status(400).json({ message: 'Assigned faculty does not exist or is not a faculty account.' });
    }

    const normalizedIds = Array.isArray(studentIds) ? [...new Set(studentIds.map(String))] : [];
    for (const sid of normalizedIds) {
      const u = await resolveAccountForCourse(sid);
      if (!u || u.role !== 'student') {
        return res.status(400).json({ message: `Invalid student id: ${sid}` });
      }
    }

    const course = await Course.create({
      courseName: courseName.trim(),
      courseCode: code,
      department: department.trim(),
      facultyId,
      students: normalizedIds,
      requiredAttendance: Number(requiredAttendance) || 80,
    });

    await syncSubjectFromCourse(course.toObject());
    const created = mapCourseForAdmin(course.toObject());
    const fac = await resolveAccountForCourse(facultyId);
    res.status(201).json({ ...created, facultyName: fac?.name || created.facultyName });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({ message: 'A course with this course code already exists.' });
    }
    res.status(500).json({ message: 'Internal server error', error: error.message });
  }
});

router.get('/courses', authenticateToken, async (req, res) => {
  try {
    const { role } = req.user;
    if (role === 'admin') {
      const courses = await Course.find().sort({ courseName: 1 }).lean();
      const mapped = await Promise.all(
        courses.map(async (course) => {
          const base = mapCourseForAdmin(course);
          const f = await resolveAccountForCourse(course.facultyId);
          return { ...base, facultyName: f?.name || base.facultyName };
        }),
      );
      return res.json(mapped);
    }

    if (role === 'faculty') {
      const rows = await Course.find({ facultyId: req.user.id }).sort({ courseName: 1 }).lean();
      const mapped = await Promise.all(
        rows.map(async (c) => ({
          id: c._id.toString(),
          courseName: c.courseName,
          courseCode: c.courseCode,
          department: c.department,
          requiredAttendance: c.requiredAttendance ?? 80,
          facultyId: c.facultyId,
          students: (
            await Promise.all(
              (c.students || []).map(async (sid) => {
                const u = await resolveAccountForCourse(sid);
                return u && u.role === 'student'
                  ? { id: sid, name: u.name, rollNo: u.studentId || sid, department: u.department }
                  : null;
              }),
            )
          ).filter(Boolean),
        })),
      );
      return res.json(mapped);
    }

    if (role === 'student') {
      const courses = await Course.find({ students: req.user.id }).sort({ courseName: 1 }).lean();
      const attendanceRecords = await StudentAttendance.find({
        $or: [{ studentId: req.user.id }, { userId: req.user.id }],
      }).lean();
      const byCode = new Map(attendanceRecords.map((a) => [a.subjectCode, a]));

      const enriched = courses.map((c) => {
        const att = byCode.get(c.courseCode);
        const pct = att && att.totalLectures > 0
          ? Number((att.attendancePercentage ?? ((att.attendedLectures / att.totalLectures) * 100)).toFixed(2))
          : 0;
        const required = c.requiredAttendance ?? 80;
        let status = 'Good';
        if (pct < required) {
          status = pct >= required - 15 ? 'Warning' : 'Critical';
        }
        return {
          id: c._id.toString(),
          courseName: c.courseName,
          courseCode: c.courseCode,
          department: c.department,
          requiredAttendance: required,
          totalLectures: att?.totalLectures ?? 0,
          attendedLectures: att?.attendedLectures ?? 0,
          attendancePercentage: pct,
          status,
        };
      });
      return res.json(enriched);
    }

    return res.status(403).json({ message: 'Insufficient permissions' });
  } catch (error) {
    res.status(500).json({ message: 'Internal server error', error: error.message });
  }
});

router.put('/courses/:id', authenticateToken, requireRole('admin'), async (req, res) => {
  try {
    const course = await Course.findById(req.params.id);
    if (!course) {
      return res.status(404).json({ message: 'Course not found.' });
    }

    const {
      courseName,
      department,
      facultyId,
      students: studentIds,
      requiredAttendance,
    } = req.body;

    if (courseName !== undefined) {
      course.courseName = String(courseName).trim();
    }

    if (facultyId !== undefined) {
      const facultyUser = await resolveAccountForCourse(facultyId);
      if (!facultyUser || facultyUser.role !== 'faculty') {
        return res.status(400).json({ message: 'Assigned faculty does not exist or is not a faculty account.' });
      }
      course.facultyId = facultyId;
    }

    if (department !== undefined) {
      course.department = String(department).trim();
    }
    if (requiredAttendance !== undefined) {
      course.requiredAttendance = Number(requiredAttendance) || 80;
    }
    if (studentIds !== undefined) {
      if (!Array.isArray(studentIds)) {
        return res.status(400).json({ message: 'students must be an array of user ids.' });
      }
      const normalizedIds = [...new Set(studentIds.map(String))];
      for (const sid of normalizedIds) {
        const u = await resolveAccountForCourse(sid);
        if (!u || u.role !== 'student') {
          return res.status(400).json({ message: `Invalid student id: ${sid}` });
        }
      }
      course.students = normalizedIds;
    }

    await course.save();
    await syncSubjectFromCourse(course.toObject());
    const out = mapCourseForAdmin(course.toObject());
    const f = await resolveAccountForCourse(course.facultyId);
    res.json({ ...out, facultyName: f?.name || out.facultyName });
  } catch (error) {
    res.status(500).json({ message: 'Internal server error', error: error.message });
  }
});

router.delete('/courses/:id', authenticateToken, requireRole('admin'), async (req, res) => {
  try {
    const course = await Course.findById(req.params.id);
    if (!course) {
      return res.status(404).json({ message: 'Course not found.' });
    }

    const code = course.courseCode;
    await Lecture.deleteMany({ $or: [{ courseId: course._id }, { subjectCode: code }] });
    await StudentAttendance.deleteMany({ subjectCode: code });
    await Subject.deleteOne({ subjectCode: code });
    store.subjects.delete(code);
    await Course.deleteOne({ _id: course._id });

    res.json({ success: true, message: 'Course removed.' });
  } catch (error) {
    res.status(500).json({ message: 'Internal server error', error: error.message });
  }
});

router.get('/attendance-management', authenticateToken, requireRole('faculty', 'hod', 'admin'), async (req, res) => {
  try {
    const subjects = await Subject.find().sort({ subjectName: 1 }).lean();
    const availableSubjects = subjects
      .filter((subject) => canManageSubject(req.user, subject))
      .map((subject) => ({
        id: subject._id?.toString?.() || subject.id || subject.subjectCode,
        subject: subject.subjectName,
        subjectName: subject.subjectName,
        subjectCode: subject.subjectCode,
        department: subject.department,
      }));

    const department = req.user.role === 'admin'
      ? undefined
      : availableSubjects[0]?.department || req.user.department;

    const students = getStudentsForDepartment(department).map((student) => ({
      id: student.id,
      name: student.name,
      rollNo: student.studentId || student.id,
      department: student.department,
    }));

    const recentLectures = await Lecture.find({
      ...(department ? { department } : {}),
    })
      .sort({ date: -1, createdAt: -1 })
      .limit(8)
      .lean();

    res.json({
      subjects: availableSubjects,
      students,
      recentLectures: recentLectures.map((lecture) => ({
        id: lecture._id.toString(),
        subject: lecture.subject,
        subjectCode: lecture.subjectCode,
        date: lecture.date,
        presentCount: lecture.studentsPresent.length,
        absentCount: lecture.studentsAbsent.length,
      })),
    });
  } catch (error) {
    res.status(500).json({ message: 'Internal server error', error: error.message });
  }
});

router.post('/mark-attendance', authenticateToken, requireRole('faculty'), async (req, res) => {
  const { courseId, subject, date, attendance } = req.body;

  if ((!subject && !courseId) || !date || !Array.isArray(attendance) || attendance.length === 0) {
    return res.status(400).json({ message: 'Subject or course, date, and attendance entries are required.' });
  }

  const normalizedDate = normalizeDate(date);
  if (!normalizedDate) {
    return res.status(400).json({ message: 'Invalid lecture date.' });
  }

  const invalidEntries = attendance.some((entry) => !entry?.studentId || !['present', 'absent'].includes(entry?.status));
  if (invalidEntries) {
    return res.status(400).json({ message: 'Each attendance entry must include a studentId and a valid status.' });
  }

  const uniqueStudentIds = new Set(attendance.map((entry) => entry.studentId));
  if (uniqueStudentIds.size !== attendance.length) {
    return res.status(400).json({ message: 'Duplicate student entries are not allowed.' });
  }

  try {
    let courseDoc = null;
    if (courseId) {
      courseDoc = await Course.findById(courseId).lean();
      if (!courseDoc) {
        return res.status(404).json({ message: 'Course not found.' });
      }
      if (courseDoc.facultyId !== req.user.id) {
        return res.status(403).json({ message: 'You are not assigned to this course.' });
      }
    }

    const subjectRecord = courseDoc
      ? {
        subjectName: courseDoc.courseName,
        subjectCode: courseDoc.courseCode,
        department: courseDoc.department,
        facultyIds: [courseDoc.facultyId],
      }
      : await resolveSubject(subject);

    if (!subjectRecord) {
      return res.status(404).json({ message: 'Subject not found.' });
    }

    if (!courseDoc && !canManageSubject(req.user, subjectRecord)) {
      return res.status(403).json({ message: 'Faculty-subject mapping validation failed.' });
    }

    let eligibleStudents;
    if (courseDoc) {
      eligibleStudents = (
        await Promise.all(
          (courseDoc.students || []).map(async (id) => resolveAccountForCourse(id)),
        )
      ).filter((u) => u && u.role === 'student');
      if (eligibleStudents.length === 0) {
        return res.status(400).json({ message: 'This course has no enrolled students.' });
      }
    } else {
      eligibleStudents = getStudentsForDepartment(subjectRecord.department);
    }

    const eligibleStudentIds = new Set(eligibleStudents.map((student) => student.id));

    if (attendance.length !== eligibleStudents.length) {
      return res.status(400).json({ message: 'All students must be marked before submitting attendance.' });
    }

    const hasUnknownStudents = attendance.some((entry) => !eligibleStudentIds.has(entry.studentId));
    if (hasUnknownStudents) {
      return res.status(400).json({ message: 'Attendance includes students outside the selected class.' });
    }

    const existingLecture = await Lecture.findOne({
      subjectCode: subjectRecord.subjectCode,
      date: normalizedDate,
    });

    if (existingLecture) {
      return res.status(400).json({ message: 'Attendance for this subject and date has already been marked.' });
    }

    const studentsPresent = attendance
      .filter((entry) => entry.status === 'present')
      .map((entry) => entry.studentId);

    const studentsAbsent = attendance
      .filter((entry) => entry.status === 'absent')
      .map((entry) => entry.studentId);

    const lecture = await Lecture.create({
      subject: subjectRecord.subjectName,
      subjectCode: subjectRecord.subjectCode,
      department: subjectRecord.department,
      date: normalizedDate,
      facultyId: req.user.id,
      studentsPresent,
      studentsAbsent,
      ...(courseDoc ? { courseId: courseDoc._id } : {}),
    });

    await Promise.all(attendance.map(async (entry) => {
      const existingRecord = await getStudentAttendanceRecord(entry.studentId, subjectRecord.subjectCode);
      const attendanceRecord = existingRecord || new StudentAttendance({
        studentId: entry.studentId,
        userId: entry.studentId,
        subjectName: subjectRecord.subjectName,
        subjectCode: subjectRecord.subjectCode,
      });

      attendanceRecord.studentId = entry.studentId;
      attendanceRecord.userId = entry.studentId;
      attendanceRecord.subjectName = subjectRecord.subjectName;
      attendanceRecord.subjectCode = subjectRecord.subjectCode;
      if (courseDoc) {
        attendanceRecord.courseId = courseDoc._id;
      }
      attendanceRecord.totalLectures += 1;

      if (entry.status === 'present') {
        attendanceRecord.attendedLectures += 1;
      }

      attendanceRecord.lastLectureDate = normalizedDate;
      await attendanceRecord.save();
      syncStoreAttendance(entry.studentId, subjectRecord, attendanceRecord);

      const notifications = store.notifications.get(entry.studentId) || [];
      notifications.unshift({
        id: `${lecture._id.toString()}-${entry.studentId}`,
        userId: entry.studentId,
        title: 'Attendance Updated',
        message: `${subjectRecord.subjectName} attendance for ${normalizedDate.toLocaleDateString()} was marked as ${entry.status} by ${req.user.name}.`,
        read: false,
        createdAt: new Date().toISOString(),
      });
      store.notifications.set(entry.studentId, notifications);
    }));

    res.status(201).json({
      success: true,
      message: 'Attendance marked successfully',
      lecture: {
        id: lecture._id.toString(),
        subject: lecture.subject,
        subjectCode: lecture.subjectCode,
        date: lecture.date,
        presentCount: studentsPresent.length,
        absentCount: studentsAbsent.length,
      },
    });
  } catch (error) {
    res.status(500).json({ message: 'Internal server error', error: error.message });
  }
});

router.get('/attendance-summary', authenticateToken, async (req, res) => {
  try {
    let attendanceRecords = await StudentAttendance.find({
      $or: [{ studentId: req.user.id }, { userId: req.user.id }],
    }).sort({ subjectName: 1 });

    if (attendanceRecords.length === 0) {
      const storeRecords = store.attendance.get(req.user.id) || [];
      attendanceRecords = await Promise.all(storeRecords.map(async (record) => {
        const createdRecord = new StudentAttendance({
          studentId: req.user.id,
          userId: req.user.id,
          subjectName: record.subjectName,
          subjectCode: record.subjectCode,
          totalLectures: record.total,
          attendedLectures: record.present,
          attendancePercentage: record.percentage,
          lastLectureDate: record.lastLectureDate,
        });
        await createdRecord.save();
        return createdRecord;
      }));
    }

    res.json(attendanceRecords.map((record) => mapAttendanceRecord(record)));
  } catch (error) {
    res.status(500).json({ message: 'Internal server error', error: error.message });
  }
});

router.get('/attendance', authenticateToken, requireRole('student'), async (req, res) => {
  try {
    let attendanceRecords = await StudentAttendance.find({
      $or: [{ studentId: req.user.id }, { userId: req.user.id }],
    }).sort({ subjectName: 1 });

    if (attendanceRecords.length === 0) {
      const storeRecords = store.attendance.get(req.user.id) || [];
      attendanceRecords = await Promise.all(storeRecords.map(async (record) => {
        const createdRecord = new StudentAttendance({
          studentId: req.user.id,
          userId: req.user.id,
          subjectName: record.subjectName,
          subjectCode: record.subjectCode,
          totalLectures: record.total,
          attendedLectures: record.present,
          attendancePercentage: record.percentage,
          lastLectureDate: record.lastLectureDate,
        });
        await createdRecord.save();
        return createdRecord;
      }));
    }

    const courses = await Course.find({ students: req.user.id }).lean();
    const reqByCode = new Map(courses.map((c) => [c.courseCode, c.requiredAttendance ?? 80]));

    res.json({
      success: true,
      data: attendanceRecords.map((record) => ({
        ...mapAttendanceRecord(record),
        requiredAttendance: reqByCode.get(record.subjectCode) ?? 80,
      })),
      message: 'Attendance fetched successfully',
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Internal server error', error: error.message });
  }
});

router.get('/attendance-overview', authenticateToken, requireRole('admin', 'hod'), async (req, res) => {
  try {
    const department = req.user.role === 'hod' ? req.user.department : undefined;
    const overview = await buildAttendanceOverview({ department });

    res.json({
      success: true,
      data: overview,
      message: 'Attendance overview fetched successfully',
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Internal server error', error: error.message });
  }
});

router.get('/attendance-simulator', authenticateToken, async (req, res) => {
  const { subjectCode, miss } = req.query;

  if (!subjectCode) {
    return res.status(400).json({ message: 'Subject code is required' });
  }

  const missCount = Number.parseInt(miss, 10);
  if (miss !== undefined && (Number.isNaN(missCount) || missCount < 0)) {
    return res.status(400).json({ message: 'Invalid input: miss must be a non-negative number' });
  }

  try {
    const attendance = await getStudentAttendanceRecord(req.user.id, subjectCode);
    if (!attendance) {
      return res.status(404).json({ message: 'Attendance record not found for this subject' });
    }

    const simulation = simulateAttendance(
      attendance.attendedLectures,
      attendance.totalLectures,
      missCount || 0,
    );

    res.json({
      subjectName: attendance.subjectName,
      subjectCode: attendance.subjectCode,
      ...simulation,
    });
  } catch (error) {
    res.status(500).json({ message: 'Internal server error', error: error.message });
  }
});

export default router;
