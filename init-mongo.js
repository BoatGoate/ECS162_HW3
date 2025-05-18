// Initialize the user database
db = db.getSiblingDB('mydatabase');  // Switch to the 'mydatabase' database

// Check if the users collection exists, and if not, insert the static user
db.createCollection('users');
db.users.find().count() === 0 && db.users.insertOne({
    email: 'alice@example.com',
    hash: '$2a$10$CwTycUXWue0Thq9StjUM0uJ8DPLKXt1FYlwYpQW2G3cAwjKoh2WZK',  // hashed password
    username: 'alice',
    userID: '123'
});

// Initialize the comments database
db = db.getSiblingDB('nyt_comments_db');  // Switch to the 'nyt_comments_db' database

// Create comments collection
db.createCollection('comments');

// Create article_stats collection for tracking comment counts
db.createCollection('article_stats');