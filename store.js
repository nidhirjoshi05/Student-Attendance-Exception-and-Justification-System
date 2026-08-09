// In-memory data store
const store = {
  users: new Map(),
  subjects: new Map(),
  attendance: new Map(),
  requests: new Map(),
  notes: [],
  notifications: new Map(),
};

export default store;
