CREATE TRIGGER qsl_sync_delete AFTER DELETE ON qsl_logs BEGIN
  UPDATE spots SET qsl_count=CASE WHEN qsl_count>0 THEN qsl_count-1 ELSE 0 END,
    revision=revision+1,
    sync_state=CASE WHEN sync_state='sending' THEN 'sending' ELSE 'pending' END,
    sync_after=0,sync_attempts=0 WHERE id=OLD.spot_id;
END;
