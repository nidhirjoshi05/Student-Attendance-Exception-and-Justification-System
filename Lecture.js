import mongoose from 'mongoose';

const lectureSchema = new mongoose.Schema({
  subject: {
    type: String,
    required: true,
  },
  subjectCode: {
    type: String,
    required: true,
  },
  department: {
    type: String,
  },
  date: {
    type: Date,
    default: Date.now,
  },
  studentsPresent: [{
    type: String, // userId or studentId
  }],
  studentsAbsent: [{
    type: String, // userId or studentId
  }],
  facultyId: {
    type: String,
    required: true,
  },
  courseId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Course',
  },
}, { timestamps: true });

lectureSchema.index({ subjectCode: 1, date: 1 }, { unique: true });

export const Lecture = mongoose.model('Lecture', lectureSchema);
