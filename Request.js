import mongoose from 'mongoose';

const requestSchema = new mongoose.Schema({
  studentId: {
    type: String,
    required: true,
  },
  studentName: {
    type: String,
    required: true,
  },
  subject: {
    type: String,
    required: true,
  },
  date: {
    type: Date,
    required: true,
  },
  reason: {
    type: String,
    required: true,
  },
  description: {
    type: String,
    required: true,
  },
  status: {
    type: String,
    default: 'pending',
  },
  documents: [{
    type: String,
  }],
  remarks: {
    type: String,
  },
  reviewedBy: {
    type: String,
  },
}, { timestamps: true });

export const Request = mongoose.model('Request', requestSchema);
