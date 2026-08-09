import mongoose from 'mongoose';

const courseSchema = new mongoose.Schema({
  courseName: {
    type: String,
    required: true,
    trim: true,
  },
  courseCode: {
    type: String,
    required: true,
    unique: true,
    uppercase: true,
    trim: true,
  },
  department: {
    type: String,
    required: true,
    trim: true,
  },
  facultyId: {
    type: String,
    required: true,
  },
  students: [{
    type: String,
  }],
  requiredAttendance: {
    type: Number,
    default: 80,
    min: 0,
    max: 100,
  },
}, { timestamps: true });

courseSchema.pre('save', function normalizeCode() {
  if (this.courseCode) {
    this.courseCode = String(this.courseCode).toUpperCase().trim();
  }
});

export const Course = mongoose.model('Course', courseSchema);
