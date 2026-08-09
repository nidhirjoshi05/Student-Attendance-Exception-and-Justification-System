import mongoose from 'mongoose';

const studentAttendanceSchema = new mongoose.Schema({
  studentId: {
    type: String,
    required: true,
  },
  userId: {
    type: String,
  },
  courseId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Course',
  },
  subjectName: {
    type: String,
    required: true,
  },
  subjectCode: {
    type: String,
    required: true,
  },
  totalLectures: {
    type: Number,
    default: 0,
  },
  attendedLectures: {
    type: Number,
    default: 0,
  },
  attendancePercentage: {
    type: Number,
    default: 0,
  },
  lastLectureDate: {
    type: Date,
  },
}, { timestamps: true });

studentAttendanceSchema.pre('validate', function() {
  if (!this.studentId && this.userId) {
    this.studentId = this.userId;
  }

  if (!this.userId && this.studentId) {
    this.userId = this.studentId;
  }

  this.attendancePercentage = this.totalLectures === 0
    ? 0
    : Number(((this.attendedLectures / this.totalLectures) * 100).toFixed(2));
});

studentAttendanceSchema.index({ studentId: 1, subjectCode: 1 }, { unique: true });

export const StudentAttendance = mongoose.model('StudentAttendance', studentAttendanceSchema);
