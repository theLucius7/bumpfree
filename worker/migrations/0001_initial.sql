-- SQLite schema. Authorization is enforced in the Worker, constraints here remain atomic.
PRAGMA foreign_keys = ON;
CREATE TABLE users (
 id TEXT PRIMARY KEY, email TEXT NOT NULL UNIQUE COLLATE NOCASE,
 display_name TEXT NOT NULL CHECK(length(display_name) BETWEEN 1 AND 50),
 role TEXT NOT NULL DEFAULT 'user' CHECK(role IN ('user','superadmin')),
 room_quota INTEGER NOT NULL DEFAULT 3 CHECK(room_quota BETWEEN 0 AND 100),
 schedule_quota INTEGER NOT NULL DEFAULT 3 CHECK(schedule_quota BETWEEN 0 AND 100),
 password_salt TEXT NOT NULL, password_verifier TEXT,
 recovery_hash TEXT, auth_version INTEGER NOT NULL DEFAULT 1,
 created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX users_display_name ON users(display_name);
CREATE INDEX users_role ON users(role);
CREATE TRIGGER last_admin BEFORE UPDATE OF role ON users WHEN OLD.role='superadmin' AND NEW.role!='superadmin'
 AND (SELECT count(*) FROM users WHERE role='superadmin') <= 1
 BEGIN SELECT RAISE(ABORT,'LAST_ADMIN'); END;
CREATE TABLE sessions (
 token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 auth_version INTEGER NOT NULL, expires_at INTEGER NOT NULL,
 created_at INTEGER NOT NULL
);
CREATE INDEX sessions_user ON sessions(user_id);
CREATE INDEX sessions_expiry ON sessions(expires_at);
CREATE TABLE auth_invites (
 token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
 expires_at INTEGER NOT NULL
);
CREATE TABLE rate_limits (key TEXT PRIMARY KEY, count INTEGER NOT NULL, expires_at INTEGER NOT NULL);
CREATE INDEX rate_expiry ON rate_limits(expires_at);
CREATE TABLE schedules (
 id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 semester_tag TEXT NOT NULL CHECK(length(semester_tag) BETWEEN 1 AND 80),
 school TEXT, start_date TEXT NOT NULL CHECK(strftime('%w',start_date)='1' AND start_date BETWEEN '2000-01-01' AND '2100-12-31'),
 max_weeks INTEGER NOT NULL CHECK(max_weeks BETWEEN 1 AND 30),
 timezone TEXT NOT NULL DEFAULT 'Asia/Shanghai', is_active INTEGER NOT NULL DEFAULT 0 CHECK(is_active IN (0,1)),
 imported_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
 UNIQUE(id,user_id), UNIQUE(user_id,semester_tag)
);
CREATE UNIQUE INDEX schedules_one_active ON schedules(user_id) WHERE is_active=1;
CREATE TRIGGER schedule_quota BEFORE INSERT ON schedules WHEN
 (SELECT count(*) FROM schedules WHERE user_id=NEW.user_id) >= (SELECT schedule_quota FROM users WHERE id=NEW.user_id)
 BEGIN SELECT RAISE(ABORT,'SCHEDULE_QUOTA'); END;
CREATE TABLE courses (
 id TEXT PRIMARY KEY, schedule_id TEXT NOT NULL, user_id TEXT NOT NULL,
 name TEXT NOT NULL CHECK(length(name) BETWEEN 1 AND 200), teacher TEXT, room TEXT, note TEXT,
 day_of_week INTEGER NOT NULL CHECK(day_of_week BETWEEN 1 AND 7),
 start_time TEXT NOT NULL CHECK(length(start_time)=5),
 end_time TEXT NOT NULL CHECK(length(end_time)=5 AND end_time>start_time),
 start_week INTEGER NOT NULL CHECK(start_week BETWEEN 1 AND 30),
 end_week INTEGER NOT NULL CHECK(end_week BETWEEN start_week AND 30), color TEXT,
 created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
 FOREIGN KEY(schedule_id,user_id) REFERENCES schedules(id,user_id) ON DELETE CASCADE
);
CREATE INDEX courses_schedule ON courses(schedule_id,user_id);
CREATE INDEX courses_user ON courses(user_id);
CREATE TRIGGER courses_limit BEFORE INSERT ON courses WHEN
 (SELECT count(*) FROM courses WHERE schedule_id=NEW.schedule_id)>=500
 BEGIN SELECT RAISE(ABORT,'COURSE_LIMIT'); END;
CREATE TRIGGER courses_weeks_insert BEFORE INSERT ON courses WHEN NEW.end_week>
 (SELECT max_weeks FROM schedules WHERE id=NEW.schedule_id)
 BEGIN SELECT RAISE(ABORT,'COURSE_WEEKS'); END;
CREATE TRIGGER courses_weeks_update BEFORE UPDATE ON courses WHEN NEW.end_week>
 (SELECT max_weeks FROM schedules WHERE id=NEW.schedule_id)
 BEGIN SELECT RAISE(ABORT,'COURSE_WEEKS'); END;
CREATE TABLE rooms (
 id TEXT PRIMARY KEY, admin_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 name TEXT NOT NULL CHECK(length(name) BETWEEN 1 AND 100), description TEXT, expires_at TEXT,
 is_public INTEGER NOT NULL DEFAULT 0 CHECK(is_public IN (0,1)),
 created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX rooms_admin ON rooms(admin_id);
CREATE TRIGGER room_quota BEFORE INSERT ON rooms WHEN
 (SELECT count(*) FROM rooms WHERE admin_id=NEW.admin_id)>=(SELECT room_quota FROM users WHERE id=NEW.admin_id)
 BEGIN SELECT RAISE(ABORT,'ROOM_QUOTA'); END;
CREATE TABLE room_members (
 room_id TEXT NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
 user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, color TEXT NOT NULL,
 joined_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
 PRIMARY KEY(room_id,user_id)
);
CREATE INDEX members_user ON room_members(user_id,room_id);
CREATE TRIGGER room_owner AFTER INSERT ON rooms BEGIN
 INSERT INTO room_members(room_id,user_id,color) VALUES(NEW.id,NEW.admin_id,'#6366f1'); END;
CREATE TRIGGER member_limit BEFORE INSERT ON room_members WHEN
 (SELECT count(*) FROM room_members WHERE room_id=NEW.room_id)>=50
 BEGIN SELECT RAISE(ABORT,'MEMBER_LIMIT'); END;
CREATE TRIGGER keep_room_owner BEFORE DELETE ON room_members WHEN
 EXISTS(SELECT 1 FROM rooms WHERE id=OLD.room_id AND admin_id=OLD.user_id)
 BEGIN SELECT RAISE(ABORT,'ROOM_OWNER'); END;
CREATE TABLE invitations (
 id TEXT PRIMARY KEY, room_id TEXT NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
 invitee_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 inviter_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','accepted','declined')),
 created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX invitations_invitee ON invitations(invitee_id,status);
CREATE UNIQUE INDEX invitations_one_pending ON invitations(room_id,invitee_id) WHERE status='pending';
CREATE TRIGGER invitation_accept BEFORE UPDATE ON invitations WHEN
 OLD.status!='pending' OR NEW.room_id!=OLD.room_id OR NEW.invitee_id!=OLD.invitee_id OR NEW.inviter_id!=OLD.inviter_id
 BEGIN SELECT RAISE(ABORT,'INVITATION_STATE'); END;
CREATE TRIGGER invitation_join AFTER UPDATE OF status ON invitations WHEN NEW.status='accepted' BEGIN
 SELECT RAISE(ABORT,'ROOM_EXPIRED') WHERE NOT EXISTS(SELECT 1 FROM rooms WHERE id=NEW.room_id AND
 (expires_at IS NULL OR expires_at>strftime('%Y-%m-%dT%H:%M:%fZ','now')));
 INSERT OR IGNORE INTO room_members(room_id,user_id,color) VALUES(NEW.room_id,NEW.invitee_id,'#8b5cf6');
END;
CREATE TABLE busy_blocks (
 id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 title TEXT NOT NULL CHECK(length(title) BETWEEN 1 AND 80),
 starts_at TEXT NOT NULL, ends_at TEXT NOT NULL CHECK(ends_at>starts_at), note TEXT,
 source TEXT NOT NULL CHECK(source IN ('manual','reschedule')),
 created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX busy_user_dates ON busy_blocks(user_id,starts_at);
CREATE TRIGGER busy_limit BEFORE INSERT ON busy_blocks WHEN
 (SELECT count(*) FROM busy_blocks WHERE user_id=NEW.user_id)>=1000
 BEGIN SELECT RAISE(ABORT,'BUSY_LIMIT'); END;
CREATE TABLE import_interfaces (id TEXT PRIMARY KEY, config TEXT NOT NULL CHECK(json_valid(config)));
CREATE TABLE manual_schedule_submissions (
 id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','processing','done','rejected')),
 text_content TEXT, file_name TEXT, file_type TEXT, file_size INTEGER, admin_note TEXT,
 created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
 updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX manual_user ON manual_schedule_submissions(user_id,status,created_at);
CREATE INDEX manual_status ON manual_schedule_submissions(status,created_at);
CREATE TRIGGER manual_limit BEFORE INSERT ON manual_schedule_submissions WHEN
 (SELECT count(*) FROM manual_schedule_submissions WHERE user_id=NEW.user_id AND status IN ('pending','processing'))>=5
 BEGIN SELECT RAISE(ABORT,'MANUAL_LIMIT'); END;
CREATE TABLE attachment_chunks (
 submission_id TEXT NOT NULL REFERENCES manual_schedule_submissions(id) ON DELETE CASCADE,
 chunk_index INTEGER NOT NULL, data BLOB NOT NULL, PRIMARY KEY(submission_id,chunk_index)
);
