import { Router } from 'express';
import store from '../data/store.js';
import { StudentAttendance } from '../models/StudentAttendance.js';
import { Lecture } from '../models/Lecture.js';
import { authenticateToken } from '../middleware/auth.js';

const router = Router();

router.get('/', authenticateToken, async (req, res) => {
  try {
    const allRequests = Array.from(store.requests.values());
    const approved = allRequests.filter(r => r.status === 'approved').length;
    const total = allRequests.length;
    const scopedUsers = Array.from(store.users.values()).filter((user) => (
      req.user.role === 'admin' || !req.user.department || user.department === req.user.department
    ));
    const scopedStudentIds = new Set(
      scopedUsers
        .filter((user) => user.role === 'student')
        .map((user) => user.id),
    );

    let attendanceRecords = await StudentAttendance.find();
    let lectures = await Lecture.find().sort({ date: -1 });

    if (req.user.role !== 'admin' && req.user.department) {
      attendanceRecords = attendanceRecords.filter((record) => scopedStudentIds.has(record.studentId || record.userId));
      lectures = lectures.filter((lecture) => lecture.department === req.user.department);
    }

    const subjectStats = {};
    attendanceRecords.forEach((record) => {
      if (!subjectStats[record.subjectCode]) {
        subjectStats[record.subjectCode] = {
          subjectName: record.subjectName,
          totalAttended: 0,
          totalLectures: 0,
          lectureCount: 0,
          studentCount: 0,
          defaulters: 0,
          studentBreakdown: [],
        };
      }

      const student = store.users.get(record.studentId || record.userId);
      const currentStats = subjectStats[record.subjectCode];
      currentStats.totalAttended += record.attendedLectures;
      currentStats.totalLectures += record.totalLectures;
      currentStats.studentCount += 1;

      if (record.attendancePercentage < 75) {
        currentStats.defaulters += 1;
      }

      currentStats.studentBreakdown.push({
        studentId: record.studentId || record.userId,
        studentName: student?.name || 'Student',
        rollNo: student?.studentId || record.studentId || record.userId,
        attendedLectures: record.attendedLectures,
        totalLectures: record.totalLectures,
        attendancePercentage: Number(record.attendancePercentage?.toFixed?.(2) || record.attendancePercentage || 0),
      });
    });

    lectures.forEach((lecture) => {
      if (!subjectStats[lecture.subjectCode]) {
        subjectStats[lecture.subjectCode] = {
          subjectName: lecture.subject,
          totalAttended: 0,
          totalLectures: 0,
          lectureCount: 0,
          studentCount: 0,
          defaulters: 0,
          studentBreakdown: [],
        };
      }

      subjectStats[lecture.subjectCode].lectureCount += 1;
    });

    const classAttendanceOverview = Object.keys(subjectStats).map((code) => {
      const currentStats = subjectStats[code];
      const avgAttendance = currentStats.totalLectures > 0
        ? Math.round((currentStats.totalAttended / currentStats.totalLectures) * 100)
        : 0;

      return {
        subjectCode: code,
        subjectName: currentStats.subjectName,
        avgAttendance,
        totalLectures: currentStats.lectureCount || (currentStats.studentCount ? Math.round(currentStats.totalLectures / currentStats.studentCount) : 0),
        defaulterCount: currentStats.defaulters,
        studentCount: currentStats.studentCount,
        studentBreakdown: currentStats.studentBreakdown
          .sort((a, b) => a.attendancePercentage - b.attendancePercentage),
      };
    }).sort((a, b) => a.subjectName.localeCompare(b.subjectName));

    const studentAttendanceBreakdown = attendanceRecords
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

    const totalLecturesConducted = lectures.length;
    const overallAttendanceAverage = attendanceRecords.length
      ? Math.round(attendanceRecords.reduce((sum, record) => sum + record.attendancePercentage, 0) / attendanceRecords.length)
      : 0;
    const totalDefaulters = studentAttendanceBreakdown.filter((record) => record.attendancePercentage < 75).length;

    res.json({
      totalRequests: total,
      approvedRequests: approved,
      rejectedRequests: allRequests.filter(r => r.status === 'rejected').length,
      pendingRequests: allRequests.filter(r => r.status === 'pending').length,
      escalatedRequests: allRequests.filter(r => r.status === 'escalated').length,
      approvalRate: total > 0 ? Math.round((approved / total) * 100) : 0,
      avgResolutionDays: 2,
      totalUsers: scopedUsers.length,
      activeThisMonth: scopedUsers.length,
      totalLecturesConducted,
      overallAttendanceAverage,
      totalDefaulters,
      trackedSubjects: classAttendanceOverview.length,
      classAttendanceOverview,
      studentAttendanceBreakdown,
      attendanceDistribution: {
        safe: attendanceRecords.filter(r => r.attendancePercentage >= 75).length,
        warning: attendanceRecords.filter(r => r.attendancePercentage >= 60 && r.attendancePercentage < 75).length,
        critical: attendanceRecords.filter(r => r.attendancePercentage < 60).length,
      },
    });
  } catch (error) {
    res.status(500).json({ message: 'Internal server error', error: error.message });
  }
});

export default router;
