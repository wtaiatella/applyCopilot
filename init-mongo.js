// MongoDB initialization script
// Creates the applycopilot database and sets up collections

db = db.getSiblingDB('applycopilot');

// Create collections
db.createCollection('users');
db.createCollection('profiles');
db.createCollection('joblistings');
db.createCollection('applications');
db.createCollection('notifications');

// Create indexes for better query performance
db.users.createIndex({ "email": 1 }, { unique: true });
db.users.createIndex({ "username": 1 }, { unique: true });
db.profiles.createIndex({ "userId": 1 }, { unique: true });
db.joblistings.createIndex({ "externalId": 1 }, { unique: true, sparse: true });
db.joblistings.createIndex({ "portal": 1, "postedAt": -1 });
db.joblistings.createIndex({ "compatibilityScore": -1 });
db.applications.createIndex({ "userId": 1, "status": 1 });
db.applications.createIndex({ "jobId": 1 });
db.notifications.createIndex({ "userId": 1, "read": 1, "createdAt": -1 });

print("MongoDB initialization completed successfully");
