-- Run this once if the database already exists to widen the otp column for bcrypt hashes
ALTER TABLE users MODIFY COLUMN otp VARCHAR(100);
