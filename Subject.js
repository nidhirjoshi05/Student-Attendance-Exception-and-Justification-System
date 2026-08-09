import mongoose from 'mongoose';

const subjectSchema = new mongoose.Schema({
  subjectName: {
    type: String,
    required: true,
  },
  subjectCode: {
    type: String,
    required: true,
    unique: true,
  },
  department: {
    type: String,
    required: true,
  },
  facultyIds: [{
    type: String,
  }],
}, { timestamps: true });

export const Subject = mongoose.model('Subject', subjectSchema);
