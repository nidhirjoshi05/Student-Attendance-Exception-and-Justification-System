import bcrypt from 'bcryptjs';
import { v4 as uuid } from 'uuid';
import store from './store.js';
import { User } from '../models/User.js';
import { StudentAttendance } from '../models/StudentAttendance.js';
import { Subject } from '../models/Subject.js';
import { Request } from '../models/Request.js';
import { Note } from '../models/Note.js';
import { Lecture } from '../models/Lecture.js';
import { Course } from '../models/Course.js';

export async function seedData() {
  if (store.users.size > 0) return;

  console.log('🌱 Seeding demo data...');

  try {
    await User.deleteMany({});
    await StudentAttendance.deleteMany({});
    await Subject.deleteMany({});
    await Request.deleteMany({});
    await Note.deleteMany({});
    await Lecture.deleteMany({});
    await Course.deleteMany({});
    store.users.clear();
    store.subjects.clear();
    store.attendance.clear();
    store.requests.clear();
    store.notes = [];
    store.notifications.clear();

    // Demo users
    const hashedPw = bcrypt.hashSync('password123', 10);

    const usersData = [
      { name: 'Alice Johnson', email: 'student@demo.com', password: hashedPw, role: 'student', department: 'Computer Science', studentId: 'CS2024001' },
      { name: 'Bob Smith', email: 'student2@demo.com', password: hashedPw, role: 'student', department: 'Computer Science', studentId: 'CS2024002' },
      { name: 'Dr. Sarah Williams', email: 'faculty@demo.com', password: hashedPw, role: 'faculty', department: 'Computer Science' },
      { name: 'Prof. Michael Brown', email: 'hod@demo.com', password: hashedPw, role: 'hod', department: 'Computer Science' },
      { name: 'Admin User', email: 'admin@demo.com', password: hashedPw, role: 'admin', department: 'Administration' },
    ];

    const createdUsers = [];
    for (const u of usersData) {
      const user = new User(u);
      await user.save();
      createdUsers.push(user);
      store.users.set(user._id.toString(), {
        ...u,
        id: user._id.toString(),
        department: user.department,
        studentId: user.studentId,
      });
    }

    const student1 = createdUsers[0];
    const student2 = createdUsers[1];
    const faculty = createdUsers[2];

    // Subjects
    const subjectsData = [
      { subjectName: 'Data Structures & Algorithms', subjectCode: 'CS301', department: 'Computer Science', facultyIds: [faculty._id.toString()] },
      { subjectName: 'Operating Systems', subjectCode: 'CS302', department: 'Computer Science', facultyIds: [faculty._id.toString()] },
      { subjectName: 'Database Management Systems', subjectCode: 'CS303', department: 'Computer Science', facultyIds: [faculty._id.toString()] },
      { subjectName: 'Computer Networks', subjectCode: 'CS304', department: 'Computer Science', facultyIds: [faculty._id.toString()] },
      { subjectName: 'Software Engineering', subjectCode: 'CS305', department: 'Computer Science', facultyIds: [faculty._id.toString()] },
      { subjectName: 'Machine Learning', subjectCode: 'CS306', department: 'Computer Science', facultyIds: [faculty._id.toString()] },
    ];

    const createdSubjects = [];
    for (const s of subjectsData) {
      const subject = new Subject(s);
      await subject.save();
      createdSubjects.push(subject);
      store.subjects.set(subject.subjectCode, {
        id: subject._id.toString(),
        subjectName: subject.subjectName,
        subjectCode: subject.subjectCode,
        department: subject.department,
        facultyIds: subject.facultyIds,
      });
    }

    const courseByCode = new Map();
    for (const subj of createdSubjects) {
      const bothStudents = ['CS301', 'CS302', 'CS303'].includes(subj.subjectCode)
        ? [student1._id.toString(), student2._id.toString()]
        : [student1._id.toString()];
      const co = await Course.create({
        courseName: subj.subjectName,
        courseCode: subj.subjectCode,
        department: subj.department,
        facultyId: faculty._id.toString(),
        students: bothStudents,
        requiredAttendance: 80,
      });
      courseByCode.set(subj.subjectCode, co);
    }

    // Attendance for students (linked to centralized courses)
    const attendanceData = [
      { studentId: student1._id.toString(), userId: student1._id.toString(), subjectName: 'Data Structures & Algorithms', subjectCode: 'CS301', attendedLectures: 28, totalLectures: 32, courseId: courseByCode.get('CS301')?._id },
      { studentId: student1._id.toString(), userId: student1._id.toString(), subjectName: 'Operating Systems', subjectCode: 'CS302', attendedLectures: 22, totalLectures: 30, courseId: courseByCode.get('CS302')?._id },
      { studentId: student1._id.toString(), userId: student1._id.toString(), subjectName: 'Database Management Systems', subjectCode: 'CS303', attendedLectures: 25, totalLectures: 28, courseId: courseByCode.get('CS303')?._id },
      { studentId: student1._id.toString(), userId: student1._id.toString(), subjectName: 'Computer Networks', subjectCode: 'CS304', attendedLectures: 18, totalLectures: 30, courseId: courseByCode.get('CS304')?._id },
      { studentId: student1._id.toString(), userId: student1._id.toString(), subjectName: 'Software Engineering', subjectCode: 'CS305', attendedLectures: 30, totalLectures: 32, courseId: courseByCode.get('CS305')?._id },
      { studentId: student1._id.toString(), userId: student1._id.toString(), subjectName: 'Machine Learning', subjectCode: 'CS306', attendedLectures: 20, totalLectures: 28, courseId: courseByCode.get('CS306')?._id },
      { studentId: student2._id.toString(), userId: student2._id.toString(), subjectName: 'Data Structures & Algorithms', subjectCode: 'CS301', attendedLectures: 26, totalLectures: 32, courseId: courseByCode.get('CS301')?._id },
      { studentId: student2._id.toString(), userId: student2._id.toString(), subjectName: 'Operating Systems', subjectCode: 'CS302', attendedLectures: 24, totalLectures: 30, courseId: courseByCode.get('CS302')?._id },
      { studentId: student2._id.toString(), userId: student2._id.toString(), subjectName: 'Database Management Systems', subjectCode: 'CS303', attendedLectures: 27, totalLectures: 28, courseId: courseByCode.get('CS303')?._id },
    ];

    for (const a of attendanceData) {
      const attendance = new StudentAttendance(a);
      await attendance.save();
      const userRecords = store.attendance.get(a.studentId) || [];
      userRecords.push({
        id: attendance._id.toString(),
        studentId: a.studentId,
        userId: a.userId,
        subjectName: a.subjectName,
        subjectCode: a.subjectCode,
        present: a.attendedLectures,
        total: a.totalLectures,
        percentage: attendance.attendancePercentage,
      });
      store.attendance.set(a.studentId, userRecords);
    }

    // Requests
    const requestsData = [
      {
        studentId: student1._id,
        studentName: student1.name,
        subject: 'Operating Systems',
        date: new Date('2026-03-05'),
        reason: 'Medical',
        description: 'Medical Emergency...',
        status: 'pending',
        documents: ['medical_certificate.pdf'],
      },
      {
        studentId: student1._id,
        studentName: student1.name,
        subject: 'Computer Networks',
        date: new Date('2026-02-28'),
        reason: 'Academic Competition',
        description: 'ACM-ICPC...',
        status: 'approved',
        documents: ['participation_cert.pdf'],
        reviewedBy: faculty._id,
      },
    ];

    for (const r of requestsData) {
      const request = new Request(r);
      await request.save();
      store.requests.set(request._id.toString(), { ...r, id: request._id.toString(), type: r.reason });
    }

    // Notes
    const notesData = [
      {
        title: 'Operating Systems - Lecture 12',
        subject: 'Operating Systems',
        subjectCode: 'CS302',
        file: 'os_lec12.pdf',
        uploadedBy: faculty._id,
      },
      {
        title: 'Database Management - Normalization',
        subject: 'Database Management Systems',
        subjectCode: 'CS303',
        file: 'dbms_norm.pdf',
        uploadedBy: faculty._id,
      },
    ];

    for (const n of notesData) {
      const note = new Note(n);
      await note.save();
      store.notes.push({ ...n, id: note._id.toString() });
    }

    console.log(`✅ Seeded ${createdUsers.length} users, ${createdSubjects.length} subjects, ${courseByCode.size} courses, ${requestsData.length} requests, ${notesData.length} notes`);
  } catch (error) {
    console.error('❌ Seeding error:', error);
  }
}
