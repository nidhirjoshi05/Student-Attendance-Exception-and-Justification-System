import mongoose from 'mongoose';

const noteSchema = new mongoose.Schema({
  title: {
    type: String,
    required: true,
  },
  subject: {
    type: String,
    required: true,
  },
  subjectCode: {
    type: String,
  },
  file: {
    type: String,
  },
  uploadedBy: {
    type: String,
  },
}, { timestamps: true });

export const Note = mongoose.model('Note', noteSchema);
