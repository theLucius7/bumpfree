CREATE TRIGGER courses_move_limit BEFORE UPDATE OF schedule_id ON courses WHEN NEW.schedule_id!=OLD.schedule_id
 AND (SELECT count(*) FROM courses WHERE schedule_id=NEW.schedule_id)>=500
 BEGIN SELECT RAISE(ABORT,'COURSE_LIMIT'); END;
