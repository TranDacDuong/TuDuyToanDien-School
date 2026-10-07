BEGIN;

-- Finish tuition notices whose contact check failed. Contact synchronization
-- itself remains independent; retrying a notice is an explicit admin action.
CREATE OR REPLACE FUNCTION public.finalize_unreachable_tuition_notices()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE n integer;
BEGIN
  UPDATE public.zalo_tuition_deliveries d SET status='failed',lease_until=NULL,
    error_message=CASE
      WHEN c.parent_id IS NULL THEN 'Chua co ket noi Zalo phu huynh; da bo qua luot gui'
      WHEN c.status='not_found' THEN 'Khong tim thay Zalo phu huynh; da bo qua luot gui'
      WHEN c.status='not_friend' THEN 'Chua the gui den Zalo phu huynh; da bo qua luot gui'
      WHEN c.status='invited' THEN 'Chua the gui sau loi moi ket ban; da bo qua luot gui'
      ELSE 'Kiem tra Zalo khong thanh cong; da bo qua luot gui'
    END || CASE WHEN NULLIF(c.last_error,'') IS NOT NULL THEN ': ' || c.last_error ELSE '' END,
    updated_at=now()
  FROM (SELECT pending.id,c.* FROM public.zalo_tuition_deliveries pending
    LEFT JOIN public.zalo_parent_contacts c ON c.parent_id=pending.parent_id
    WHERE pending.status IN ('queued','not_found','not_friend','invited','greeted')
      AND NOT pending.dispatch_paused AND pending.sent_at IS NULL
      AND (c.lease_until IS NULL OR c.lease_until<=now())
      AND NOT COALESCE(c.zalo_uid IS NOT NULL AND
        c.phone=(SELECT regexp_replace(u.phone,'[^0-9]','','g') FROM public.users u WHERE u.id=pending.parent_id) AND
        EXISTS(SELECT 1 FROM public.parent_students ps WHERE ps.parent_id=pending.parent_id
          AND ps.student_id=pending.student_id AND ps.revoked_at IS NULL) AND
        (c.status IN ('friend','invited') OR c.greeting_sent_at IS NOT NULL),false)
      AND (c.status IN ('error','rate_limited','not_found','not_friend')
        OR (c.last_checked_at>=pending.created_at AND c.status='invited')
        OR pending.created_at<now()-interval '5 minutes')
  ) c
  WHERE d.id=c.id AND d.status IN ('queued','not_found','not_friend','invited','greeted')
    AND NOT d.dispatch_paused AND d.sent_at IS NULL;
  GET DIAGNOSTICS n=ROW_COUNT;
  RETURN n;
END;
$$;
REVOKE ALL ON FUNCTION public.finalize_unreachable_tuition_notices() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.finalize_unreachable_tuition_notices() TO service_role;

-- Keep all deployed identity, balance, QR-repair and pacing checks intact.
DO $$
DECLARE src text;
BEGIN
  src:=pg_get_functiondef('public.claim_zalo_tuition_delivery()'::regprocedure);
  IF position('finalize_unreachable_tuition_notices' IN src)=0 THEN
    IF position('  RETURN QUERY' IN src)=0 THEN RAISE EXCEPTION 'Unexpected tuition claim definition'; END IF;
    src:=replace(src,'  RETURN QUERY',
      '  PERFORM public.finalize_unreachable_tuition_notices();
  RETURN QUERY');
    EXECUTE src;
  END IF;
END;
$$;

SELECT public.finalize_unreachable_tuition_notices() AS skipped_unreachable_notices;
COMMIT;
