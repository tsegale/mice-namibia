-- Runs once when the docker-compose database is first created: a second,
-- empty database for "npm test" (the tests wipe and rebuild it every run).
CREATE DATABASE IF NOT EXISTS mice_test CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
GRANT ALL PRIVILEGES ON mice_test.* TO 'mice'@'%';
FLUSH PRIVILEGES;
