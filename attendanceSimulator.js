/**
 * Attendance Simulator Logic
 * @param {number} A - attendedLectures
 * @param {number} T - totalLectures
 * @param {number} X - lectures user wants to miss
 * @returns {object} Simulator Result
 */
export const simulateAttendance = (A, T, X = 0) => {
  const miss = parseInt(X) || 0;
  const R = 80; // Required attendance fixed at 80%

  // 1. Current Attendance Calculation
  const currentAttendance = T === 0 ? 0 : (A / T) * 100;

  // 2. New Attendance Calculation
  const newTotal = T + miss;
  const newAttended = A;
  const newAttendance = newTotal === 0 ? 0 : (newAttended / newTotal) * 100;

  // 3. Color + Status Logic
  let status = "SAFE";
  let color = "green";
  let message = "You are safe. You can miss these lectures without issues.";

  if (newAttendance > 85) {
    status = "SAFE";
    color = "green";
    message = "You are safe. You can miss these lectures without issues.";
  } else if (newAttendance >= 80 && newAttendance <= 85) {
    status = "WARNING";
    color = "yellow";
    message = "You are close to the limit. Be careful before missing more lectures.";
  } else {
    status = "DEFAULTER";
    color = "red";
    message = "You will become a defaulter if you miss these lectures.";
  }

  return {
    currentAttendance: parseFloat(currentAttendance.toFixed(2)),
    newAttendance: parseFloat(newAttendance.toFixed(2)),
    missedLectures: miss,
    status,
    color,
    message
  };
};
