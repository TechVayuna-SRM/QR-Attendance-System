CREATE DATABASE IF NOT EXISTS TV_DA_QR_BASED_ATTENDANCE_SYSTEM_FULL_PROJECT_DATABASE;
USE TV_DA_QR_BASED_ATTENDANCE_SYSTEM_FULL_PROJECT_DATABASE;

CREATE TABLE IF NOT EXISTS users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    email VARCHAR(150) UNIQUE NOT NULL,
    google_id VARCHAR(200),
    password_hash VARCHAR(64),
    role ENUM('admin', 'domain_lead', 'member', 'faculty') DEFAULT 'member',
    department VARCHAR(100),
    year VARCHAR(10),
    regno VARCHAR(50) UNIQUE,
    is_verified BOOLEAN DEFAULT FALSE,
    otp VARCHAR(100),
    otp_expiry DATETIME,
    face_registered BOOLEAN DEFAULT FALSE,
    face_image_path VARCHAR(300),
    is_approved BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS domains (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(100) UNIQUE NOT NULL
);

INSERT IGNORE INTO domains (name) VALUES
('AI'), ('Data Analytics'), ('Web Development'),
('Research and Patent'), ('Competitive Programming'),
('Creatives'), ('PR & Marketing'), ('Media');

CREATE TABLE IF NOT EXISTS user_domains (
    user_id INT,
    domain_id INT,
    PRIMARY KEY (user_id, domain_id),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (domain_id) REFERENCES domains(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS domain_leads (
    user_id INT PRIMARY KEY,
    domain_id INT,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (domain_id) REFERENCES domains(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS qr_sessions (
    id INT AUTO_INCREMENT PRIMARY KEY,
    token VARCHAR(300) UNIQUE NOT NULL,
    generated_by INT,
    generated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    expires_at DATETIME NOT NULL,
    is_active BOOLEAN DEFAULT TRUE,
    cloudinary_public_id VARCHAR(300),
    cloudinary_url VARCHAR(500),
    FOREIGN KEY (generated_by) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS attendance (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    domain_id INT NOT NULL,
    qr_session_id INT,
    status ENUM('present', 'absent') DEFAULT 'absent',
    marked_at DATETIME,
    date DATE NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (domain_id) REFERENCES domains(id) ON DELETE CASCADE,
    FOREIGN KEY (qr_session_id) REFERENCES qr_sessions(id),
    UNIQUE KEY unique_attendance (user_id, domain_id, date)
);

CREATE TABLE IF NOT EXISTS domain_join_requests (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    domain_id INT NOT NULL,
    status VARCHAR(20) DEFAULT 'pending',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (domain_id) REFERENCES domains(id) ON DELETE CASCADE
);
